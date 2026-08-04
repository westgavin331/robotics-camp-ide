import { recognizeExpression } from './expressions.js';
import { unwrapParens, conditionValue } from './cst.js';
import { tryListStatement } from './lists.js';

// Recognizes a *list* of sibling statements (a function body, or an
// if/while/for/forever's own body) into a Blockly next-chain. Returns:
//   - a block-state object (the chain's first block) if the list recognized
//     successfully and produced at least one visible block
//   - null if the list recognized successfully but produced *no* visible
//     blocks (an empty {} body, or a body containing only silently-consumed
//     lines like pinMode/Serial.begin -- not an error)
//   - FAILED if something couldn't be recognized (error already recorded;
//     callers must propagate FAILED upward without adding their own error)
export const FAILED = Symbol('import-failed');

function input(name, blockState) {
  return blockState ? { [name]: { block: blockState } } : {};
}

export function recognizeStatementList(nodes, ctx, scope) {
  const list = nodes.filter((n) => n.type !== 'comment');
  const blocks = [];
  let i = 0;
  let failed = false;
  while (i < list.length) {
    const result = recognizeOne(list, i, ctx, scope);
    if (result === FAILED) {
      // The list as a whole is doomed either way -- keep scanning the
      // *remaining* siblings anyway (one at a time, ignoring multi-
      // statement lookahead from here on) purely so their independent
      // problems get recorded too, rather than stopping at the first one
      // and making the kid fix-and-reimport repeatedly to see the rest.
      failed = true;
      i += 1;
      continue;
    }
    if (!failed && result.block) blocks.push(result.block);
    i += failed ? 1 : result.count;
  }
  if (failed) return FAILED;
  for (let j = blocks.length - 2; j >= 0; j -= 1) {
    blocks[j].next = { block: blocks[j + 1] };
  }
  return blocks.length ? blocks[0] : null;
}

// A single statement's own "value" when it's really just a call/assignment
// wrapped in an expression_statement -- unwraps that wrapper so pattern
// matchers can look at the call/assignment directly.
function exprOf(stmtNode) {
  if (stmtNode.type !== 'expression_statement') return null;
  return stmtNode.namedChild(0);
}

function isCallTo(node, name) {
  return node && node.type === 'call_expression' && node.childForFieldName('function')?.text === name;
}

function callArgs(node) {
  const a = node.childForFieldName('arguments');
  return a ? a.namedChildren : [];
}

function isFieldCallTo(node, object, method) {
  if (!node || node.type !== 'call_expression') return false;
  const fn = node.childForFieldName('function');
  return (
    fn?.type === 'field_expression' &&
    fn.childForFieldName('argument')?.text === object &&
    fn.childForFieldName('field')?.text === method
  );
}

// --- pinMode / Serial.begin / IrReceiver.resume: silently consumed -------
// These are all hoisted setup-only side effects this app's own blocks
// re-derive automatically (see generators/arduino/{io,serial,ir}.js's
// addSetup calls) -- recognized and dropped wherever they appear, not
// turned into a visible block.

function tryConsumeImplicitLine(node, ctx) {
  const expr = exprOf(node);
  if (!expr) return false;

  if (isCallTo(expr, 'pinMode')) return true;

  if (isFieldCallTo(expr, 'Serial', 'begin')) {
    const args = callArgs(expr);
    const baud = args[0];
    if (args.length === 1 && baud.type === 'number_literal' && Number(baud.text) === 9600) return true;
    ctx.error(node, 'this code uses Serial.begin with a baud rate other than 9600 -- this app always uses 9600, so change it to 9600 first.');
    return 'error';
  }

  if (isFieldCallTo(expr, 'IrReceiver', 'resume') && callArgs(expr).length === 0) return true;

  return false;
}

// --- Servo attach pre-scan (program.js calls this once, globally) --------

export function scanServoAttachPins(functionBodyNode, ctx) {
  for (const call of functionBodyNode.descendantsOfType('call_expression')) {
    const fn = call.childForFieldName('function');
    if (fn?.type !== 'field_expression' || fn.childForFieldName('field')?.text !== 'attach') continue;
    const varName = fn.childForFieldName('argument')?.text;
    if (!ctx.servoVars.has(varName)) continue;
    const args = callArgs(call);
    if (args.length === 1) ctx.servoAttachPins.set(varName, args[0]);
  }
}

function tryServoWrite(node, ctx, scope) {
  const expr = exprOf(node);
  if (!expr || expr.type !== 'call_expression') return undefined;
  const fn = expr.childForFieldName('function');
  if (fn?.type !== 'field_expression' || fn.childForFieldName('field')?.text !== 'write') return undefined;
  const varName = fn.childForFieldName('argument')?.text;
  if (!ctx.servoVars.has(varName)) return undefined;
  const args = callArgs(expr);
  if (args.length !== 1) return undefined;
  const pinNode = ctx.servoAttachPins.get(varName);
  if (!pinNode) {
    ctx.error(node, `"${varName}.write(...)" is used, but this app couldn't find a matching "${varName}.attach(pin)" anywhere to know which pin it's on.`);
    return FAILED;
  }
  const pin = recognizeExpression(pinNode, ctx, scope);
  const angle = recognizeExpression(args[0], ctx, scope);
  if (!pin || !angle) return FAILED;
  return { count: 1, block: { type: 'io_servo_write', inputs: { ...input('PIN', pin), ...input('ANGLE', angle) } } };
}

function tryServoAttachLine(node, ctx) {
  const expr = exprOf(node);
  if (!expr || expr.type !== 'call_expression') return false;
  const fn = expr.childForFieldName('function');
  if (fn?.type !== 'field_expression' || fn.childForFieldName('field')?.text !== 'attach') return false;
  return ctx.servoVars.has(fn.childForFieldName('argument')?.text);
}

// --- sound_play_note: tone()+delay() pair, or a lone REST delay() --------
// Both must use the "(beats * 250)" shape this app's own generator always
// produces (see generators/arduino/sound.js's BEAT_DURATION_MS) -- "beats"
// is this app's own invented tempo unit, not something hand-written Arduino
// code would independently happen to match, so this intentionally only
// recognizes that one exact shape rather than approximating arbitrary
// tone()/delay() calls as a "note".
const NOTE_FREQUENCIES = {
  C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494,
  C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, B5: 988,
  C6: 1047,
};

function extractBeatsExpr(durationNode) {
  const n = unwrapParens(durationNode);
  if (!n || n.type !== 'binary_expression' || n.childForFieldName('operator')?.type !== '*') return undefined;
  const right = unwrapParens(n.childForFieldName('right'));
  if (!right || right.type !== 'number_literal' || Number(right.text) !== 250) return undefined;
  return n.childForFieldName('left');
}

function trySoundPlayNote(nodes, i, ctx, scope) {
  const a = exprOf(nodes[i]);
  if (isCallTo(a, 'tone')) {
    const args = callArgs(a);
    if (args.length !== 3) return undefined;
    const [, freqNode, durNode] = args;
    if (freqNode.type !== 'number_literal') return undefined;
    const noteName = Object.entries(NOTE_FREQUENCIES).find(([, hz]) => hz === Number(freqNode.text))?.[0];
    if (!noteName) return undefined;
    const b = nodes[i + 1] ? exprOf(nodes[i + 1]) : null;
    if (!isCallTo(b, 'delay')) return undefined;
    const bArgs = callArgs(b);
    if (bArgs.length !== 1 || bArgs[0].text !== durNode.text) return undefined;
    const beatsExpr = extractBeatsExpr(durNode);
    if (!beatsExpr) return undefined;
    const beats = recognizeExpression(beatsExpr, ctx, scope);
    if (!beats) return FAILED;
    return { count: 2, block: { type: 'sound_play_note', fields: { NOTE: noteName }, inputs: input('BEATS', beats) } };
  }
  if (isCallTo(a, 'delay')) {
    const args = callArgs(a);
    if (args.length !== 1) return undefined;
    const beatsExpr = extractBeatsExpr(args[0]);
    if (!beatsExpr) return undefined;
    const beats = recognizeExpression(beatsExpr, ctx, scope);
    if (!beats) return FAILED;
    return { count: 1, block: { type: 'sound_play_note', fields: { NOTE: 'REST' }, inputs: input('BEATS', beats) } };
  }
  return undefined;
}

// --- motor_*: six digitalWrite/analogWrite lines on the fixed TB6612FNG --
// pins -- the right motor's (IN1, IN2, PWM) triple then the left motor's,
// which is exactly what generators/arduino/motors.js emits for every Motors
// block (its own copy of these constants is the source of truth for code
// *generation*; this one exists so the importer doesn't have to reach across
// into the Blockly generator tree -- same duplication the NOTE_FREQUENCIES
// table above uses, for the same reason).
//
// Matched ahead of the generic digitalWrite/analogWrite recognition in
// recognizeExpressionStatement, which would otherwise turn this back into
// six separate Basic I/O blocks. That's only safe to prefer because the
// pattern is highly specific -- all six pins literal, drawn from the two
// motors' own triples in that exact order, with both motors given the same
// speed expression and a recognized direction pairing. Code that happens to
// touch these pins any other way (one motor alone, a different order) still
// falls through to the plain I/O blocks.
const RIGHT_MOTOR = { in1: 2, in2: 4, pwm: 6 };
const LEFT_MOTOR = { in1: 7, in2: 8, pwm: 5 };

// The (IN1, IN2) states each motor gets per movement -- mirrors MOVEMENTS in
// generators/arduino/motors.js, where the mounting-direction reasoning lives.
const MOTOR_MOVEMENTS = [
  { dir: 'FORWARD', turn: false, right: ['LOW', 'HIGH'], left: ['HIGH', 'LOW'] },
  { dir: 'BACKWARD', turn: false, right: ['HIGH', 'LOW'], left: ['LOW', 'HIGH'] },
  { dir: 'RIGHT', turn: true, right: ['HIGH', 'LOW'], left: ['HIGH', 'LOW'] },
  { dir: 'LEFT', turn: true, right: ['LOW', 'HIGH'], left: ['LOW', 'HIGH'] },
];

// A literal pin argument, as a number -- undefined for anything else (a
// variable, an expression). Motor pins are hard-wired, so only a literal
// can be one of them.
function literalPin(node) {
  if (!node || node.type !== 'number_literal') return undefined;
  const n = Number(node.text);
  return Number.isInteger(n) ? n : undefined;
}

function digitalWriteParts(node) {
  const expr = exprOf(node);
  if (!isCallTo(expr, 'digitalWrite')) return undefined;
  const args = callArgs(expr);
  if (args.length !== 2) return undefined;
  const pin = literalPin(args[0]);
  if (pin === undefined) return undefined;
  if (args[1].type !== 'identifier' || (args[1].text !== 'HIGH' && args[1].text !== 'LOW')) return undefined;
  return { pin, state: args[1].text };
}

// One motor's three lines at nodes[i..i+2], as the states/speed they write --
// undefined unless all three are literal writes to that motor's own pins, in
// (IN1, IN2, PWM) order.
function motorTriple(nodes, i, motor) {
  const first = digitalWriteParts(nodes[i]);
  const second = nodes[i + 1] ? digitalWriteParts(nodes[i + 1]) : undefined;
  if (!first || !second) return undefined;
  if (first.pin !== motor.in1 || second.pin !== motor.in2) return undefined;
  const third = nodes[i + 2] ? exprOf(nodes[i + 2]) : null;
  if (!isCallTo(third, 'analogWrite')) return undefined;
  const args = callArgs(third);
  if (args.length !== 2 || literalPin(args[0]) !== motor.pwm) return undefined;
  return { in1State: first.state, in2State: second.state, speedNode: args[1] };
}

function motorPair(nodes, i) {
  const right = motorTriple(nodes, i, RIGHT_MOTOR);
  const left = right ? motorTriple(nodes, i + 3, LEFT_MOTOR) : undefined;
  return right && left ? { right, left } : undefined;
}

// Both motors braked at zero -- what motor_stop emits, and what the timed
// blocks emit after their delay().
function isMotorStop(nodes, i) {
  const pair = motorPair(nodes, i);
  if (!pair) return false;
  return [pair.right, pair.left].every(
    (t) =>
      t.in1State === 'LOW' &&
      t.in2State === 'LOW' &&
      t.speedNode.type === 'number_literal' &&
      Number(t.speedNode.text) === 0,
  );
}

// A recognized movement (both motors, one speed, a known direction pairing),
// or undefined.
function motorMovement(nodes, i) {
  const pair = motorPair(nodes, i);
  if (!pair) return undefined;
  if (pair.right.speedNode.text !== pair.left.speedNode.text) return undefined;
  const move = MOTOR_MOVEMENTS.find(
    (m) =>
      m.right[0] === pair.right.in1State &&
      m.right[1] === pair.right.in2State &&
      m.left[0] === pair.left.in1State &&
      m.left[1] === pair.left.in2State,
  );
  return move ? { move, speedNode: pair.right.speedNode } : undefined;
}

// Stop is checked first: its all-LOW states aren't one of MOTOR_MOVEMENTS'
// pairings, so the two can't both match, and checking it up front keeps the
// "drive, delay, stop" lookahead below from having to special-case it.
//
// A "for N seconds" block and the hand-built equivalent (set speed, wait,
// stop motors) compile to identical code, so an import of that sequence
// necessarily comes back as the single timed block. That's the more natural
// reading of the code, and the behaviour is the same either way.
function tryMotor(nodes, i, ctx, scope) {
  if (isMotorStop(nodes, i)) return { count: 6, block: { type: 'motor_stop' } };

  const movement = motorMovement(nodes, i);
  if (!movement) return undefined;
  const speed = recognizeExpression(movement.speedNode, ctx, scope);
  if (!speed) return FAILED;
  const { dir, turn } = movement.move;

  const delayExpr = nodes[i + 6] ? exprOf(nodes[i + 6]) : null;
  const delayArgs = isCallTo(delayExpr, 'delay') ? callArgs(delayExpr) : [];
  const secondsExpr = delayArgs.length === 1 ? extractSecondsExpr(delayArgs[0]) : undefined;
  if (secondsExpr && isMotorStop(nodes, i + 7)) {
    const time = recognizeExpression(secondsExpr, ctx, scope);
    if (!time) return FAILED;
    return {
      count: 13,
      block: {
        type: turn ? 'motor_turn_for' : 'motor_drive_for',
        fields: { DIR: dir },
        inputs: { ...input('SPEED', speed), ...input('TIME', time) },
      },
    };
  }

  return {
    count: 6,
    block: {
      type: turn ? 'motor_set_turn' : 'motor_set_drive',
      fields: { DIR: dir },
      inputs: input('SPEED', speed),
    },
  };
}

// --- io_wait: delay(<t> * 1000) or a bare delay(<ms>) ---------------------

function tryWait(node, ctx, scope) {
  const expr = exprOf(node);
  if (!isCallTo(expr, 'delay')) return undefined;
  const args = callArgs(expr);
  if (args.length !== 1) return undefined;
  const secondsExpr = extractSecondsExpr(args[0]);
  if (secondsExpr) {
    const time = recognizeExpression(secondsExpr, ctx, scope);
    if (!time) return FAILED;
    return { count: 1, block: { type: 'io_wait', fields: { UNIT: 'SECONDS' }, inputs: input('TIME', time) } };
  }
  const time = recognizeExpression(args[0], ctx, scope);
  if (!time) return FAILED;
  return { count: 1, block: { type: 'io_wait', fields: { UNIT: 'MS' }, inputs: input('TIME', time) } };
}

function extractSecondsExpr(node) {
  const n = unwrapParens(node);
  if (!n || n.type !== 'binary_expression' || n.childForFieldName('operator')?.type !== '*') return undefined;
  const right = unwrapParens(n.childForFieldName('right'));
  if (!right || right.type !== 'number_literal' || Number(right.text) !== 1000) return undefined;
  return n.childForFieldName('left');
}

// --- ir_if_received: if (IrReceiver.decode()) { ...; IrReceiver.resume(); } ----

function tryIrIfReceived(node, ctx, scope) {
  if (node.type !== 'if_statement') return undefined;
  const cond = conditionValue(node.childForFieldName('condition'));
  if (!isFieldCallTo(cond, 'IrReceiver', 'decode') || callArgs(cond).length !== 0) return undefined;

  if (node.childForFieldName('alternative')) {
    ctx.error(node, 'this checks IrReceiver.decode() but has an "else" -- the IR Remote block for this never has one.');
    return FAILED;
  }
  const consequence = node.childForFieldName('consequence');
  if (consequence.type !== 'compound_statement') {
    ctx.error(node, 'this checks IrReceiver.decode() but its body isn\'t wrapped in { }.');
    return FAILED;
  }
  const bodyStatements = consequence.namedChildren.filter((n) => n.type !== 'comment');
  const last = bodyStatements[bodyStatements.length - 1];
  const lastExpr = last ? exprOf(last) : null;
  if (!isFieldCallTo(lastExpr, 'IrReceiver', 'resume') || callArgs(lastExpr).length !== 0) {
    ctx.error(node, 'this checks IrReceiver.decode() but its last line isn\'t IrReceiver.resume() -- this app\'s IR block always adds that automatically, so the code needs to match that exact shape.');
    return FAILED;
  }
  const body = recognizeStatementList(bodyStatements.slice(0, -1), ctx, scope);
  if (body === FAILED) return FAILED;
  return { count: 1, block: { type: 'ir_if_received', inputs: body ? { DO: { block: body } } : {} } };
}

// --- one statement (or the start of a 2-statement pattern) ---------------

function recognizeOne(nodes, i, ctx, scope) {
  const node = nodes[i];

  const consumed = tryConsumeImplicitLine(node, ctx);
  if (consumed === 'error') return FAILED;
  if (consumed) return { count: 1, block: null };
  if (tryServoAttachLine(node, ctx)) return { count: 1, block: null };

  for (const tryFn of [tryMotor, trySoundPlayNote, tryIrStartReceiver]) {
    const result = tryFn(nodes, i, ctx, scope);
    if (result !== undefined) return result === FAILED ? FAILED : result;
  }

  for (const tryFn of [tryWait, tryServoWrite]) {
    const result = tryFn(node, ctx, scope);
    if (result !== undefined) return result === FAILED ? FAILED : result;
  }

  // Ahead of recognizeSingleStatement below, which would otherwise report a
  // list helper call as an unknown function and `<counter> = 0;` as an
  // assignment to an undeclared variable.
  const listStatement = tryListStatement(node, ctx, scope, FAILED);
  if (listStatement !== undefined) return listStatement;

  const irIf = tryIrIfReceived(node, ctx, scope);
  if (irIf !== undefined) return irIf;

  const single = recognizeSingleStatement(node, ctx, scope);
  return single === FAILED ? FAILED : { count: 1, block: single };
}

function tryIrStartReceiver(nodes, i, ctx, scope) {
  const expr = exprOf(nodes[i]);
  if (!isFieldCallTo(expr, 'IrReceiver', 'begin')) return undefined;
  const args = callArgs(expr);
  if (args.length !== 2 || args[1].text !== 'ENABLE_LED_FEEDBACK') return undefined;
  const pin = recognizeExpression(args[0], ctx, scope);
  if (!pin) return FAILED;
  return { count: 1, block: { type: 'ir_start_receiver', inputs: input('PIN', pin) } };
}

// --- statements with exactly one shape (no lookahead needed) -------------

function recognizeSingleStatement(node, ctx, scope) {
  switch (node.type) {
    case 'expression_statement':
      return recognizeExpressionStatement(node.namedChild(0), ctx, scope, node);
    case 'if_statement':
      return recognizeIf(node, ctx, scope);
    case 'while_statement':
      return recognizeWhile(node, ctx, scope);
    case 'for_statement':
      return recognizeFor(node, ctx, scope);
    case 'break_statement':
      return { type: 'controls_flow_statements', fields: { FLOW: 'BREAK' } };
    case 'continue_statement':
      return { type: 'controls_flow_statements', fields: { FLOW: 'CONTINUE' } };
    default:
      ctx.error(node, `this app doesn't have a block for this kind of code ("${node.type.replace(/_/g, ' ')}").`);
      return FAILED;
  }
}

function recognizeExpressionStatement(expr, ctx, scope, wholeNode) {
  if (expr.type === 'call_expression') {
    const fn = expr.childForFieldName('function');
    const args = callArgs(expr);

    if (fn.type === 'identifier') {
      const name = fn.text;
      if (name === 'digitalWrite' && args.length === 2) {
        if (args[1].type !== 'identifier' || (args[1].text !== 'HIGH' && args[1].text !== 'LOW')) {
          ctx.error(args[1], 'digitalWrite\'s second argument should be HIGH or LOW.');
          return FAILED;
        }
        const pin = recognizeExpression(args[0], ctx, scope);
        if (!pin) return FAILED;
        return { type: 'io_digital_write', fields: { STATE: args[1].text }, inputs: input('PIN', pin) };
      }
      if (name === 'analogWrite' && args.length === 2) {
        const pin = recognizeExpression(args[0], ctx, scope);
        const value = recognizeExpression(args[1], ctx, scope);
        if (!pin || !value) return FAILED;
        return { type: 'io_pwm_write', inputs: { ...input('PIN', pin), ...input('VALUE', value) } };
      }
      if (ctx.customFunctions.has(name)) {
        return recognizeCustomCall(name, args, expr, ctx, scope);
      }
      if (ctx.rejectedFunctionNames.has(name)) return FAILED;
      ctx.error(wholeNode, `this app doesn't have a block for "${name}(...)".`);
      return FAILED;
    }
    if (fn.type === 'field_expression' && fn.childForFieldName('argument')?.text === 'Serial' && fn.childForFieldName('field')?.text === 'println') {
      if (args.length !== 1) {
        ctx.error(wholeNode, 'Serial.println should be called with exactly one value.');
        return FAILED;
      }
      const value = recognizeExpression(args[0], ctx, scope);
      if (!value) return FAILED;
      return { type: 'serial_print', inputs: input('VALUE', value) };
    }
    ctx.error(wholeNode, `this app doesn't have a block for "${expr.text}".`);
    return FAILED;
  }

  if (expr.type === 'assignment_expression') {
    return recognizeAssignment(expr, ctx, scope, wholeNode);
  }

  ctx.error(wholeNode, `this app doesn't have a block for this kind of code ("${expr.type.replace(/_/g, ' ')}").`);
  return FAILED;
}

function recognizeCustomCall(name, argNodes, callNode, ctx, scope) {
  const def = ctx.customFunctions.get(name);
  if (argNodes.length !== def.params.length) {
    ctx.error(callNode, `"${name}" needs ${def.params.length} input(s), but this call has ${argNodes.length}.`);
    return FAILED;
  }
  const inputs = {};
  for (let k = 0; k < def.params.length; k += 1) {
    const value = recognizeExpression(argNodes[k], ctx, scope);
    if (!value) return FAILED;
    Object.assign(inputs, input(`ARG_${def.params[k].id}`, value));
  }
  return { type: def.callType, inputs };
}

function recognizeAssignment(expr, ctx, scope, wholeNode) {
  const leftNode = expr.childForFieldName('left');
  const op = expr.childForFieldName('operator')?.type;
  const rightNode = expr.childForFieldName('right');
  if (leftNode.type !== 'identifier') {
    ctx.error(wholeNode, 'this app can only assign directly to a plain variable name.');
    return FAILED;
  }
  const name = leftNode.text;
  if (scope && scope.has(name)) {
    ctx.error(wholeNode, `"${name}" is one of this block's inputs, which can't be changed -- only variables can.`);
    return FAILED;
  }
  if (!ctx.variables.has(name)) {
    ctx.error(leftNode, `"${name}" isn't a variable this app knows about (used before being declared with a global variable).`);
    return FAILED;
  }
  const varId = ctx.variables.get(name).id;

  // `x = x + <delta>;` is math_change; anything else with `=` is a plain set.
  if (op === '=' && rightNode.type === 'binary_expression' && rightNode.childForFieldName('operator')?.type === '+') {
    const rLeft = rightNode.childForFieldName('left');
    if (rLeft.type === 'identifier' && rLeft.text === name) {
      const delta = recognizeExpression(rightNode.childForFieldName('right'), ctx, scope);
      if (!delta) return FAILED;
      return { type: 'math_change', fields: { VAR: { id: varId } }, inputs: input('DELTA', delta) };
    }
  }
  if (op === '=') {
    const value = recognizeExpression(rightNode, ctx, scope);
    if (!value) return FAILED;
    return { type: 'variables_set', fields: { VAR: { id: varId } }, inputs: input('VALUE', value) };
  }
  ctx.error(wholeNode, `this app doesn't have a block for the "${op}" assignment operator (only "=", as a plain set or "x = x + delta").`);
  return FAILED;
}

function recognizeIf(node, ctx, scope) {
  const branches = [];
  let cursor = node;
  let elseBody = undefined;
  while (cursor) {
    const cond = recognizeExpression(conditionValue(cursor.childForFieldName('condition')), ctx, scope);
    if (!cond) return FAILED;
    const consequence = cursor.childForFieldName('consequence');
    if (consequence.type !== 'compound_statement') {
      ctx.error(consequence, 'this app expects { } around if/else bodies.');
      return FAILED;
    }
    const body = recognizeStatementList(consequence.namedChildren, ctx, scope);
    if (body === FAILED) return FAILED;
    branches.push({ cond, body });

    const alt = cursor.childForFieldName('alternative');
    if (!alt) {
      cursor = null;
    } else if (alt.type === 'else_clause') {
      const inner = alt.namedChild(0);
      if (inner.type === 'if_statement') {
        cursor = inner;
      } else if (inner.type === 'compound_statement') {
        const body2 = recognizeStatementList(inner.namedChildren, ctx, scope);
        if (body2 === FAILED) return FAILED;
        elseBody = body2;
        cursor = null;
      } else {
        ctx.error(inner, 'this app expects { } around if/else bodies.');
        return FAILED;
      }
    } else {
      cursor = null;
    }
  }

  const fields = {};
  const inputs = {};
  const extraState = { elseIfCount: branches.length - 1, hasElse: elseBody !== undefined };
  branches.forEach((b, idx) => {
    Object.assign(inputs, input(`IF${idx}`, b.cond));
    if (b.body) Object.assign(inputs, input(`DO${idx}`, b.body));
  });
  if (elseBody) Object.assign(inputs, input('ELSE', elseBody));
  return { type: 'controls_if', extraState, fields, inputs };
}

// The `<expr>` inside `!(<expr>)`, or undefined if this isn't a negation --
// the shape wait_until's generator always produces for its condition.
function negatedOperand(node) {
  if (!node || node.type !== 'unary_expression') return undefined;
  if (node.childForFieldName('operator')?.type !== '!') return undefined;
  return unwrapParens(node.childForFieldName('argument'));
}

function recognizeWhile(node, ctx, scope) {
  const condNode = conditionValue(node.childForFieldName('condition'));
  const bodyNode = node.childForFieldName('body');
  if (bodyNode.type !== 'compound_statement') {
    ctx.error(bodyNode, 'this app expects { } around while bodies.');
    return FAILED;
  }
  if ((condNode.type === 'true') || (condNode.type === 'number_literal' && Number(condNode.text) === 1)) {
    const body = recognizeStatementList(bodyNode.namedChildren, ctx, scope);
    if (body === FAILED) return FAILED;
    return { type: 'controls_forever', inputs: body ? input('DO', body) : {} };
  }

  // wait_until: `while (!(<cond>)) {}` -- a negated spin over an empty body.
  // Checked ahead of the generic while below, which would otherwise read it
  // as "repeat while <not cond>" with an empty body: same behaviour, but a
  // loop block that visibly does nothing, and with an extra `not` block
  // wrapped around a condition the kid never wrote one on.
  //
  // An empty "repeat until" compiles to this identical code, so that one
  // necessarily comes back as wait_until. Nothing is lost by preferring it:
  // an empty repeat-until is a no-op shell whose only actual effect IS
  // waiting, and the importer never produced the UNTIL mode in the first
  // place (a negated while has always come back as WHILE + a `not` block).
  const bodyStatements = bodyNode.namedChildren.filter((n) => n.type !== 'comment');
  const waitCondNode = bodyStatements.length === 0 ? negatedOperand(condNode) : undefined;
  if (waitCondNode) {
    const cond = recognizeExpression(waitCondNode, ctx, scope);
    if (!cond) return FAILED;
    return { type: 'wait_until', inputs: input('CONDITION', cond) };
  }
  const cond = recognizeExpression(condNode, ctx, scope);
  const body = recognizeStatementList(bodyNode.namedChildren, ctx, scope);
  if (!cond || body === FAILED) return FAILED;
  return { type: 'controls_whileUntil', fields: { MODE: 'WHILE' }, inputs: { ...input('BOOL', cond), ...(body ? input('DO', body) : {}) } };
}

function recognizeFor(node, ctx, scope) {
  const init = node.childForFieldName('initializer');
  const cond = node.childForFieldName('condition');
  const update = node.childForFieldName('update');
  const bodyNode = node.childForFieldName('body');
  if (!init || !cond || !update) {
    ctx.error(node, 'this app needs a for-loop to have all three parts: start, condition, and step.');
    return FAILED;
  }
  if (bodyNode.type !== 'compound_statement') {
    ctx.error(bodyNode, 'this app expects { } around for-loop bodies.');
    return FAILED;
  }

  // controls_repeat_ext: for (int V = 0; V < N; V++) { ... }
  if (init.type === 'declaration' && update.type === 'update_expression') {
    const declarator = init.childForFieldName('declarator');
    if (declarator?.type === 'init_declarator') {
      const varName = declarator.childForFieldName('declarator')?.text;
      const startVal = declarator.childForFieldName('value');
      const condOp = cond.type === 'binary_expression' ? cond.childForFieldName('operator')?.type : null;
      const updateOp = update.childForFieldName('operator')?.type;
      if (
        startVal?.type === 'number_literal' &&
        Number(startVal.text) === 0 &&
        condOp === '<' &&
        cond.childForFieldName('left')?.text === varName &&
        updateOp === '++' &&
        update.childForFieldName('argument')?.text === varName
      ) {
        const times = recognizeExpression(cond.childForFieldName('right'), ctx, scope);
        if (!times) return FAILED;
        const body = recognizeStatementList(bodyNode.namedChildren, ctx, scope);
        if (body === FAILED) return FAILED;
        return { type: 'controls_repeat_ext', inputs: { ...input('TIMES', times), ...(body ? input('DO', body) : {}) } };
      }
    }
    ctx.error(node, 'this app doesn\'t recognize this for-loop\'s shape.');
    return FAILED;
  }

  // controls_for: for (V = from; V <= to; V += by) { ... }  (V a known variable)
  if (init.type === 'assignment_expression' && (update.type === 'assignment_expression')) {
    const varName = init.childForFieldName('left')?.text;
    if (init.childForFieldName('operator')?.type !== '=' || !ctx.variables.has(varName)) {
      ctx.error(node, 'this app doesn\'t recognize this for-loop\'s shape.');
      return FAILED;
    }
    const condOp = cond.type === 'binary_expression' ? cond.childForFieldName('operator')?.type : null;
    const updateOp = update.childForFieldName('operator')?.type;
    const matchesUp = condOp === '<=' && updateOp === '+=';
    const matchesDown = condOp === '>=' && updateOp === '-=';
    if (
      (!matchesUp && !matchesDown) ||
      cond.childForFieldName('left')?.text !== varName ||
      update.childForFieldName('left')?.text !== varName
    ) {
      ctx.error(node, 'this app doesn\'t recognize this for-loop\'s shape.');
      return FAILED;
    }
    const from = recognizeExpression(init.childForFieldName('right'), ctx, scope);
    const to = recognizeExpression(cond.childForFieldName('right'), ctx, scope);
    const by = recognizeExpression(update.childForFieldName('right'), ctx, scope);
    if (!from || !to || !by) return FAILED;
    const body = recognizeStatementList(bodyNode.namedChildren, ctx, scope);
    if (body === FAILED) return FAILED;
    return {
      type: 'controls_for',
      fields: { VAR: { id: ctx.variables.get(varName).id } },
      inputs: { ...input('FROM', from), ...input('TO', to), ...input('BY', by), ...(body ? input('DO', body) : {}) },
    };
  }

  ctx.error(node, 'this app doesn\'t recognize this for-loop\'s shape (dynamic/non-literal bounds aren\'t supported).');
  return FAILED;
}
