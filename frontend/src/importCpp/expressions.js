import { unwrapParens } from './cst.js';
import { tryListCall, tryListIdentifier } from './lists.js';

// Recognizes a C++ expression node and returns a Blockly value block-state
// (`{type, fields?, inputs?}`, matching Blockly.serialization.blocks'
// format -- see program.js's module comment for how the whole project gets
// assembled), or null if nothing in this app's block set matches. On null,
// the specific sub-recognizer that actually failed has already called
// `ctx.error(...)` with a precise message -- callers must NOT add a second,
// vaguer error of their own; they just propagate the null upward.
//
// `scope` is the current custom-function's parameter map (name -> {getterType,
// check}) when recognizing inside a My Blocks definition body, or null at
// global scope (setup/loop) where bare identifiers can only be variables.

const COMPARE_OPS = { '==': 'EQ', '!=': 'NEQ', '<': 'LT', '<=': 'LTE', '>': 'GT', '>=': 'GTE' };
const ARITH_OPS = { '+': 'ADD', '-': 'MINUS', '*': 'MULTIPLY', '/': 'DIVIDE' };
const SINGLE_MATH_CALLS = { sqrt: 'ROOT', log: 'LN', log10: 'LOG10', exp: 'EXP', abs: 'ABS' };
const ROUND_CALLS = { round: 'ROUND', ceil: 'ROUNDUP', floor: 'ROUNDDOWN' };

function numberBlock(value) {
  return { type: 'math_number', fields: { NUM: value } };
}

function boolBlock(value) {
  return { type: 'logic_boolean', fields: { BOOL: value ? 'TRUE' : 'FALSE' } };
}

function textBlock(str) {
  return { type: 'shadow_text', fields: { TEXT: str } };
}

function input(name, blockState) {
  return blockState ? { [name]: { block: blockState } } : {};
}

// this app's `quote()` (generators/arduino/text.js) only ever escapes `\`
// and `"` -- so those are the only two escape sequences safe to reverse
// with certainty that re-generating the imported text produces the exact
// same source. Anything else (\n, \t, \xNN, ...) is rejected rather than
// silently turned into a literal control character that would then break
// when regenerated (quote() doesn't re-escape raw newlines).
function unescapeSimpleString(node, ctx) {
  const contentNode = node.namedChildren.find((c) => c.type === 'string_content');
  const raw = contentNode ? contentNode.text : '';
  if (/\\(?![\\"])/.test(raw)) {
    ctx.error(node, 'this text has a special character (like \\n) that this app doesn\'t support yet.');
    return null;
  }
  return raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function lookupIdentifier(node, ctx, scope) {
  const name = node.text;
  if (scope && scope.has(name)) {
    return { type: scope.get(name).getterType };
  }
  // A list's length counter reads back as "length of [list]"; the list array
  // itself gets a message of its own rather than the not-a-variable one below.
  const asList = tryListIdentifier(node, ctx);
  if (asList !== undefined) return asList.block;
  // Reading the variable ir_held_command's generated bookkeeping maintains IS
  // the reporter block -- the tracker that keeps it up to date was consumed
  // separately (see statements.js).
  if (ctx.irHeldCommandVars?.held === name) return { type: 'ir_held_command' };
  if (ctx.variables.has(name)) {
    return { type: 'variables_get', fields: { VAR: { id: ctx.variables.get(name).id } } };
  }
  ctx.error(node, `"${name}" isn't a variable this app knows about (used before being declared with a global variable, or not one of this custom block's inputs).`);
  return null;
}

// `random(min(a,b), max(a,b)+1)` is exactly what math_random_int generates;
// a hand-written `random(a, b)` (no min/max wrapping) is accepted too, for
// the same value, since that's the more natural way a person would write
// "random number between a and b".
function recognizeRandomCall(argNodes, ctx, scope) {
  if (argNodes.length !== 2) return undefined; // not this pattern at all -- let the caller try others / report generically
  const [argA, argB] = argNodes;
  const isMinMaxShape =
    argA.type === 'call_expression' &&
    argA.childForFieldName('function')?.text === 'min' &&
    argB.type === 'binary_expression' &&
    argB.childForFieldName('operator')?.type === '+';
  if (isMinMaxShape) {
    const minArgs = argA.childForFieldName('arguments').namedChildren;
    const maxCall = unwrapParens(argB.childForFieldName('left'));
    const plusOne = unwrapParens(argB.childForFieldName('right'));
    const maxArgs = maxCall?.type === 'call_expression' ? maxCall.childForFieldName('arguments').namedChildren : null;
    if (
      minArgs?.length === 2 &&
      maxCall?.childForFieldName('function')?.text === 'max' &&
      maxArgs?.length === 2 &&
      minArgs[0].text === maxArgs[0].text &&
      minArgs[1].text === maxArgs[1].text &&
      plusOne?.type === 'number_literal' &&
      Number(plusOne.text) === 1
    ) {
      const from = recognizeExpression(minArgs[0], ctx, scope);
      const to = recognizeExpression(minArgs[1], ctx, scope);
      if (!from || !to) return null;
      return { type: 'math_random_int', inputs: { ...input('FROM', from), ...input('TO', to) } };
    }
  }
  const from = recognizeExpression(argA, ctx, scope);
  const to = recognizeExpression(argB, ctx, scope);
  if (!from || !to) return null;
  return { type: 'math_random_int', inputs: { ...input('FROM', from), ...input('TO', to) } };
}

function recognizeCall(node, ctx, scope) {
  const fnNode = node.childForFieldName('function');
  const argsNode = node.childForFieldName('arguments');
  const args = argsNode ? argsNode.namedChildren : [];

  // The one method call that's a plain reporter (ir_protocol_name) -- checked
  // before the identifier-only guard below, which every other call in this
  // app satisfies.
  if (fnNode.type === 'field_expression' && fnNode.text === 'IrReceiver.getProtocolString' && args.length === 0) {
    return { type: 'ir_protocol_name' };
  }
  if (fnNode.type !== 'identifier') {
    ctx.error(node, `this app doesn't have a block for "${node.text}".`);
    return null;
  }
  const name = fnNode.text;

  if (name === 'pow' && args.length === 2) {
    // `pow(10, x)` is ambiguous with math_single's POW10 (both generators
    // produce identical C++) -- POW10 is preferred as the more specific
    // match when the first argument is literally 10.
    if (args[0].type === 'number_literal' && Number(args[0].text) === 10) {
      const exp = recognizeExpression(args[1], ctx, scope);
      if (!exp) return null;
      return { type: 'math_single', fields: { OP: 'POW10' }, inputs: input('NUM', exp) };
    }
    const a = recognizeExpression(args[0], ctx, scope);
    const b = recognizeExpression(args[1], ctx, scope);
    if (!a || !b) return null;
    return { type: 'math_arithmetic', fields: { OP: 'POWER' }, inputs: { ...input('A', a), ...input('B', b) } };
  }
  if (Object.prototype.hasOwnProperty.call(SINGLE_MATH_CALLS, name) && args.length === 1) {
    const arg = recognizeExpression(args[0], ctx, scope);
    if (!arg) return null;
    return { type: 'math_single', fields: { OP: SINGLE_MATH_CALLS[name] }, inputs: input('NUM', arg) };
  }
  if (Object.prototype.hasOwnProperty.call(ROUND_CALLS, name) && args.length === 1) {
    const arg = recognizeExpression(args[0], ctx, scope);
    if (!arg) return null;
    return { type: 'math_round', fields: { OP: ROUND_CALLS[name] }, inputs: input('NUM', arg) };
  }
  if (name === 'fmod' && args.length === 2) {
    const a = recognizeExpression(args[0], ctx, scope);
    const b = recognizeExpression(args[1], ctx, scope);
    if (!a || !b) return null;
    return { type: 'math_modulo', inputs: { ...input('DIVIDEND', a), ...input('DIVISOR', b) } };
  }
  if (name === 'random') {
    const result = recognizeRandomCall(args, ctx, scope);
    if (result !== undefined) return result;
  }
  if (name === 'digitalRead' && args.length === 1) {
    const pin = recognizeExpression(args[0], ctx, scope);
    if (!pin) return null;
    return { type: 'io_digital_read', inputs: input('PIN', pin) };
  }
  if (name === 'analogRead' && args.length === 1) {
    const pin = recognizeExpression(args[0], ctx, scope);
    if (!pin) return null;
    return { type: 'io_analog_read', inputs: input('PIN', pin) };
  }
  const asListCall = tryListCall(name, args, node, ctx, scope);
  if (asListCall !== undefined) return asListCall;
  if (ctx.distanceHelperNames.has(name) && args.length === 2) {
    const trig = recognizeExpression(args[0], ctx, scope);
    const echo = recognizeExpression(args[1], ctx, scope);
    if (!trig || !echo) return null;
    return { type: 'sensor_read_distance', inputs: { ...input('TRIG', trig), ...input('ECHO', echo) } };
  }
  if (ctx.rejectedFunctionNames.has(name)) return null; // root cause already reported at its definition
  if (ctx.customFunctions.has(name)) {
    ctx.error(node, `"${name}(...)" is one of your own blocks, but it doesn't give back a value -- it can only be used on its own line, not inside another expression.`);
    return null;
  }
  ctx.error(node, `this app doesn't have a block for "${name}(...)".`);
  return null;
}

export function recognizeExpression(rawNode, ctx, scope = null) {
  const node = unwrapParens(rawNode);
  if (!node) return null;

  switch (node.type) {
    case 'number_literal': {
      const n = Number(node.text);
      if (Number.isNaN(n)) {
        ctx.error(node, `"${node.text}" doesn't look like a number this app can use.`);
        return null;
      }
      return numberBlock(n);
    }
    case 'true':
      return boolBlock(true);
    case 'false':
      return boolBlock(false);
    case 'string_literal': {
      const str = unescapeSimpleString(node, ctx);
      return str === null ? null : textBlock(str);
    }
    case 'identifier':
      return lookupIdentifier(node, ctx, scope);
    case 'unary_expression': {
      const op = node.childForFieldName('operator')?.type;
      const arg = node.childForFieldName('argument');
      if (op === '-') {
        const inner = recognizeExpression(arg, ctx, scope);
        if (!inner) return null;
        return { type: 'math_single', fields: { OP: 'NEG' }, inputs: input('NUM', inner) };
      }
      if (op === '!') {
        const inner = recognizeExpression(arg, ctx, scope);
        if (!inner) return null;
        return { type: 'logic_negate', inputs: input('BOOL', inner) };
      }
      ctx.error(node, `this app doesn't have a block for the "${op}" operator.`);
      return null;
    }
    case 'binary_expression': {
      const opNode = node.childForFieldName('operator');
      const op = opNode.type;
      const leftNode = node.childForFieldName('left');
      const rightNode = node.childForFieldName('right');
      if (Object.prototype.hasOwnProperty.call(COMPARE_OPS, op)) {
        const a = recognizeExpression(leftNode, ctx, scope);
        const b = recognizeExpression(rightNode, ctx, scope);
        if (!a || !b) return null;
        return { type: 'logic_compare', fields: { OP: COMPARE_OPS[op] }, inputs: { ...input('A', a), ...input('B', b) } };
      }
      if (op === '&&' || op === '||') {
        const a = recognizeExpression(leftNode, ctx, scope);
        const b = recognizeExpression(rightNode, ctx, scope);
        if (!a || !b) return null;
        return { type: 'logic_operation', fields: { OP: op === '&&' ? 'AND' : 'OR' }, inputs: { ...input('A', a), ...input('B', b) } };
      }
      if (Object.prototype.hasOwnProperty.call(ARITH_OPS, op)) {
        const a = recognizeExpression(leftNode, ctx, scope);
        const b = recognizeExpression(rightNode, ctx, scope);
        if (!a || !b) return null;
        return { type: 'math_arithmetic', fields: { OP: ARITH_OPS[op] }, inputs: { ...input('A', a), ...input('B', b) } };
      }
      if (op === '%') {
        const a = recognizeExpression(leftNode, ctx, scope);
        const b = recognizeExpression(rightNode, ctx, scope);
        if (!a || !b) return null;
        return { type: 'math_modulo', inputs: { ...input('DIVIDEND', a), ...input('DIVISOR', b) } };
      }
      // ir_repeat_received's one exact shape (generators/arduino/ir.js) --
      // there's no generic block for bitwise "&", only this one specific,
      // fixed expression.
      if (op === '&' && leftNode.text === 'IrReceiver.decodedIRData.flags' && rightNode.text === 'IRDATA_FLAGS_IS_REPEAT') {
        return { type: 'ir_repeat_received' };
      }
      ctx.error(opNode, `this app doesn't have a block for the "${op}" operator.`);
      return null;
    }
    case 'field_expression': {
      if (node.text === 'IrReceiver.decodedIRData.command') return { type: 'ir_get_code', fields: { FORMAT: 'COMMAND' } };
      if (node.text === 'IrReceiver.decodedIRData.address') return { type: 'ir_get_code', fields: { FORMAT: 'ADDRESS' } };
      if (node.text === 'IrReceiver.decodedIRData.decodedRawData') return { type: 'ir_get_code', fields: { FORMAT: 'RAW' } };
      ctx.error(node, `this app doesn't have a block for "${node.text}".`);
      return null;
    }
    case 'conditional_expression': {
      const cond = recognizeExpression(node.childForFieldName('condition'), ctx, scope);
      const then = recognizeExpression(node.childForFieldName('consequence'), ctx, scope);
      const els = recognizeExpression(node.childForFieldName('alternative'), ctx, scope);
      if (!cond || !then || !els) return null;
      return { type: 'logic_ternary', inputs: { ...input('IF', cond), ...input('THEN', then), ...input('ELSE', els) } };
    }
    case 'call_expression':
      return recognizeCall(node, ctx, scope);
    default:
      ctx.error(node, `this app doesn't have a block for this kind of code ("${node.type.replace(/_/g, ' ')}").`);
      return null;
  }
}
