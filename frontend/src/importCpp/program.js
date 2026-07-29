import { recognizeStatementList, FAILED, scanServoAttachPins } from './statements.js';
import { createNameDeduper } from './identifiers.js';
import { unwrapParens } from './cst.js';

const CTYPE_TO_PARAM_TYPE = { int: 'number', float: 'number', double: 'number', long: 'number', String: 'text', bool: 'boolean' };
const GLOBAL_VAR_TYPES = new Set(['float', 'int', 'double', 'long', 'bool', 'String']);
const DEFINE_X = 480;
const DEFINE_Y_STEP = 160;

function functionName(fnDefNode) {
  return fnDefNode.childForFieldName('declarator')?.childForFieldName('declarator')?.text;
}

function recognizeGlobalDeclaration(node, ctx) {
  const typeNode = node.childForFieldName('type');
  const declNode = node.childForFieldName('declarator');
  const typeText = typeNode?.text;

  if (typeText === 'Servo' && declNode?.type === 'identifier') {
    ctx.servoVars.add(declNode.text);
    return;
  }
  if (GLOBAL_VAR_TYPES.has(typeText) && declNode?.type === 'identifier') {
    ctx.getOrCreateVariable(declNode.text);
    return;
  }
  ctx.error(node, `this app doesn't support this global declaration ("${node.text.trim().split('\n')[0]}").`);
}

// Registers a custom function's *signature* only (name + param list) --
// bodies are recognized afterward, once every function's signature is
// known, so custom functions can call each other regardless of which one
// is textually defined first (C++ itself would need a forward declaration
// for that; this app's own "My Blocks" call blocks don't care about
// declaration order at all, so being lenient here is a deliberate,
// reasonable hand-written-code accommodation, not just laziness).
function registerCustomFunctionSignature(node, name, ctx, globalDedupe) {
  const returnType = node.childForFieldName('type');
  if (!returnType || returnType.text !== 'void') {
    ctx.error(node, `"${name}" gives back a value (its return type is "${returnType?.text ?? '?'}") -- this app's custom blocks can only be "void" (no return value).`);
    ctx.rejectedFunctionNames.add(name);
    return;
  }
  const paramListNode = node.childForFieldName('declarator')?.childForFieldName('parameters');
  const paramDecls = paramListNode ? paramListNode.namedChildren.filter((n) => n.type === 'parameter_declaration') : [];
  if (paramListNode && paramDecls.length !== paramListNode.namedChildren.length) {
    ctx.error(node, `"${name}" has a parameter this app doesn't support.`);
    ctx.rejectedFunctionNames.add(name);
    return;
  }

  const paramDedupe = createNameDeduper();
  const params = [];
  const seenNames = new Set();
  for (let i = 0; i < paramDecls.length; i += 1) {
    const p = paramDecls[i];
    const typeText = p.childForFieldName('type')?.text;
    const paramType = CTYPE_TO_PARAM_TYPE[typeText];
    const declNode = p.childForFieldName('declarator');
    if (!paramType || declNode?.type !== 'identifier') {
      ctx.error(p, `"${name}"'s parameter #${i + 1} has a type this app doesn't support (only int/float, String, or bool).`);
      ctx.rejectedFunctionNames.add(name);
      return;
    }
    const paramName = declNode.text;
    if (seenNames.has(paramName)) {
      ctx.error(p, `"${name}" has two parameters both named "${paramName}".`);
      ctx.rejectedFunctionNames.add(name);
      return;
    }
    seenNames.add(paramName);
    params.push({ id: `p${i}`, name: paramName, type: paramType, cName: paramDedupe(paramName) });
  }

  const id = `import_fn_${ctx.customFunctions.size}`;
  ctx.customFunctions.set(name, {
    id,
    name,
    cName: globalDedupe(name),
    nextParamSeq: params.length,
    params,
    defineType: `myblock_define_${id}`,
    callType: `myblock_call_${id}`,
  });
}

// sensor_read_distance (generators/arduino/sensors.js) is emitted as a
// provideFunction_ helper -- a real top-level function, structurally
// identical every time it's generated. Matched by *shape*, not name (a
// human, or Blockly's own collision-suffixing, could rename it), so this
// checks the exact 10-statement body against the exact template rather than
// just checking the function's name.
function expectCall(stmtNode, fnName, argMatchers) {
  if (!stmtNode || stmtNode.type !== 'expression_statement') return false;
  const call = stmtNode.namedChild(0);
  if (!call || call.type !== 'call_expression' || call.childForFieldName('function')?.text !== fnName) return false;
  const args = call.childForFieldName('arguments')?.namedChildren ?? [];
  return args.length === argMatchers.length && argMatchers.every((m, i) => m(args[i]));
}
const isIdent = (name) => (node) => node?.type === 'identifier' && node.text === name;
const isNum = (value) => (node) => node?.type === 'number_literal' && Number(node.text) === value;

function matchesDistanceHelperTemplate(fnNode) {
  if (fnNode.childForFieldName('type')?.text !== 'float') return false;
  const paramListNode = fnNode.childForFieldName('declarator')?.childForFieldName('parameters');
  const params = paramListNode ? paramListNode.namedChildren.filter((n) => n.type === 'parameter_declaration') : [];
  if (params.length !== 2) return false;
  const trigName = params[0].childForFieldName('declarator')?.text;
  const echoName = params[1].childForFieldName('declarator')?.text;
  if (!trigName || !echoName) return false;

  const stmts = fnNode.childForFieldName('body').namedChildren.filter((n) => n.type !== 'comment');
  if (stmts.length !== 10) return false;
  if (!expectCall(stmts[0], 'pinMode', [isIdent(trigName), isIdent('OUTPUT')])) return false;
  if (!expectCall(stmts[1], 'pinMode', [isIdent(echoName), isIdent('INPUT')])) return false;
  if (!expectCall(stmts[2], 'digitalWrite', [isIdent(trigName), isIdent('LOW')])) return false;
  if (!expectCall(stmts[3], 'delayMicroseconds', [isNum(2)])) return false;
  if (!expectCall(stmts[4], 'digitalWrite', [isIdent(trigName), isIdent('HIGH')])) return false;
  if (!expectCall(stmts[5], 'delayMicroseconds', [isNum(10)])) return false;
  if (!expectCall(stmts[6], 'digitalWrite', [isIdent(trigName), isIdent('LOW')])) return false;

  const declStmt = stmts[7];
  if (declStmt.type !== 'declaration') return false;
  const initDecl = declStmt.childForFieldName('declarator');
  if (initDecl?.type !== 'init_declarator') return false;
  const durationVarName = initDecl.childForFieldName('declarator')?.text;
  const pulseCall = initDecl.childForFieldName('value');
  if (pulseCall?.type !== 'call_expression' || pulseCall.childForFieldName('function')?.text !== 'pulseIn') return false;
  const pulseArgs = pulseCall.childForFieldName('arguments')?.namedChildren ?? [];
  if (pulseArgs.length !== 3 || pulseArgs[0].text !== echoName || pulseArgs[1].text !== 'HIGH') return false;
  if (!isNum(30000)(pulseArgs[2])) return false;

  if (!expectCall(stmts[8], 'delay', [isNum(60)])) return false;

  const returnStmt = stmts[9];
  if (returnStmt.type !== 'return_statement') return false;
  const retExpr = unwrapParens(returnStmt.namedChild(0));
  if (!retExpr || retExpr.type !== 'binary_expression' || retExpr.childForFieldName('operator')?.type !== '/') return false;
  if (!isNum(2)(retExpr.childForFieldName('right'))) return false;
  const mult = unwrapParens(retExpr.childForFieldName('left'));
  if (!mult || mult.type !== 'binary_expression' || mult.childForFieldName('operator')?.type !== '*') return false;
  if (mult.childForFieldName('left')?.text !== durationVarName) return false;
  return isNum(0.034)(mult.childForFieldName('right'));
}

function findFirstProblemNode(node) {
  if (node.isError || node.isMissing) return node;
  for (const child of node.children) {
    const found = findFirstProblemNode(child);
    if (found) return found;
  }
  return null;
}

// Turns an already-parsed tree-sitter tree into a project object matching
// projectIO.js's shape ({version, workspace, customBlocks}) -- the same
// shape Save/Load already knows how to put into a live Blockly workspace
// (loadProject), so importing reuses that existing, tested path rather than
// building blocks directly. Returns null (with ctx.errors populated) if
// anything couldn't be recognized -- see index.js for the whole-import-
// rejects policy this supports.
export function buildProjectFromCpp(tree, ctx) {
  const root = tree.rootNode;
  if (root.hasError) {
    const problem = findFirstProblemNode(root) || root;
    ctx.error(problem, "this doesn't look like valid C++ here -- check for a missing brace, parenthesis, or semicolon nearby.");
    return null;
  }

  let setupNode = null;
  let loopNode = null;
  const customFnNodes = [];
  const globalDedupe = createNameDeduper();

  for (const node of root.namedChildren) {
    if (node.type === 'comment' || node.type === 'preproc_include') continue;
    if (node.type === 'preproc_def' || node.type === 'preproc_function_def') {
      ctx.error(node, "this app doesn't support #define -- write the value directly wherever it's used instead.");
      continue;
    }
    if (node.type === 'declaration') {
      recognizeGlobalDeclaration(node, ctx);
      continue;
    }
    if (node.type === 'function_definition') {
      const name = functionName(node);
      if (name === 'setup') {
        if (setupNode) ctx.error(node, 'found more than one "void setup()" function.');
        setupNode = node;
      } else if (name === 'loop') {
        if (loopNode) ctx.error(node, 'found more than one "void loop()" function.');
        loopNode = node;
      } else if (matchesDistanceHelperTemplate(node)) {
        ctx.distanceHelperNames.add(name);
      } else {
        customFnNodes.push({ node, name });
      }
      continue;
    }
    ctx.error(node, `this app doesn't have a block for this kind of top-level code ("${node.type.replace(/_/g, ' ')}").`);
  }

  if (!setupNode) ctx.error(root, 'missing a "void setup() { }" function -- every sketch needs one, even if empty.');
  if (!loopNode) ctx.error(root, 'missing a "void loop() { }" function -- every sketch needs one, even if empty.');

  for (const { node, name } of customFnNodes) {
    registerCustomFunctionSignature(node, name, ctx, globalDedupe);
  }

  for (const fnNode of [setupNode, loopNode, ...customFnNodes.map((f) => f.node)]) {
    if (!fnNode) continue;
    const body = fnNode.childForFieldName('body');
    if (body) scanServoAttachPins(body, ctx);
  }

  if (ctx.hasErrors) return null; // skeleton itself is already broken -- don't bother walking bodies

  const setupBody = setupNode ? recognizeStatementList(setupNode.childForFieldName('body').namedChildren, ctx, null) : null;
  const loopBody = loopNode ? recognizeStatementList(loopNode.childForFieldName('body').namedChildren, ctx, null) : null;

  const customBlocks = [];
  const defineBlockStates = [];
  for (const { node, name } of customFnNodes) {
    const def = ctx.customFunctions.get(name);
    if (!def) continue; // signature already rejected; error already recorded
    const scope = new Map(def.params.map((p) => [p.name, { getterType: `myblock_param_${def.id}_${p.id}` }]));
    const body = recognizeStatementList(node.childForFieldName('body').namedChildren, ctx, scope);
    if (body === FAILED) continue;
    customBlocks.push({ id: def.id, name: def.name, cName: def.cName, nextParamSeq: def.nextParamSeq, params: def.params });
    defineBlockStates.push({
      type: def.defineType,
      x: DEFINE_X,
      y: 30 + defineBlockStates.length * DEFINE_Y_STEP,
      ...(body ? { next: { block: body } } : {}),
    });
  }

  if (ctx.hasErrors || setupBody === FAILED || loopBody === FAILED) return null;

  // Assembly matches the toolbox's own starting scaffold and how
  // generators/arduino/core.js interprets it: setup's statements go
  // directly under the hat, then a forever block wrapping loop's
  // statements is appended as the last element of that same chain.
  const forever = { type: 'controls_forever', ...(loopBody ? { inputs: { DO: { block: loopBody } } } : {}) };
  let hatNext = forever;
  if (setupBody) {
    hatNext = setupBody;
    let tail = hatNext;
    while (tail.next) tail = tail.next.block;
    tail.next = { block: forever };
  }
  const hat = { type: 'arduino_start', x: 0, y: 0, next: { block: hatNext } };

  return {
    version: 1,
    workspace: {
      blocks: { languageVersion: 0, blocks: [hat, ...defineBlockStates] },
      variables: [...ctx.variables.values()],
    },
    customBlocks,
  };
}
