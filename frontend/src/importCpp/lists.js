import { recognizeExpression } from './expressions.js';

// Recognizing the Lists blocks (blocks/lists.js) back out of C++. A list is
// three things in the generated sketch, and all three have to line up before
// any of them is treated as a list at all:
//
//   float scores[20];              <- the array
//   byte scoresLength = 0;         <- its length counter
//   void listAdd(float list[], byte &length, byte capacity, float value) {...}
//                                  <- the shared helper functions
//
// Same duplication as MOTOR_DRIVES and NOTE_FREQUENCIES in statements.js,
// for the same reason: generators/arduino/lists.js is the source of truth for
// code *generation*, and this is a second copy so the importer doesn't have
// to reach across into the Blockly generator tree. The failure mode if the
// two ever drift apart is a rejected import with a specific message, never a
// silently wrong one -- an unmatched helper falls through to the "My Blocks"
// path in program.js, whose `float[]`/`byte&` parameters aren't a supported
// custom-block parameter type, so it reports that and stops.

// blocks/lists.js's LIST_SIZE_OPTIONS. An array whose size isn't one of
// these has no representation in the size dropdown, so it's rejected rather
// than quietly rounded to one that does.
const ALLOWED_LIST_SIZES = [10, 20, 50, 100];

// The generator names a list's counter `<array>Length`, or `<array>Length2`,
// `<array>Length3`... if Blockly's deduper had to break a tie with a
// same-named variable. Matching the pattern rather than the exact string is
// what lets those deduped sketches round-trip.
const LENGTH_SUFFIX = /^Length\d*$/;

function input(name, blockState) {
  return blockState ? { [name]: { block: blockState } } : {};
}

// --- helper-function matching ---------------------------------------------

// The six helpers, verbatim as generators/arduino/lists.js emits them.
// Matched by whole-body shape, not by name: Blockly's own name deduping can
// rename them (a kid with a "My Block" called listAdd gets listAdd2), and so
// can a human.
const HELPER_SOURCES = [
  {
    kind: 'add',
    name: 'listAdd',
    params: ['list', 'length', 'capacity', 'value'],
    source: `void listAdd(float list[], byte &length, byte capacity, float value) {
      if (length >= capacity) return;
      list[length] = value;
      length = length + 1;
    }`,
  },
  {
    kind: 'delete',
    name: 'listDelete',
    params: ['list', 'length', 'index'],
    source: `void listDelete(float list[], byte &length, float index) {
      int i = (int) index - 1;
      if (i < 0 || i >= length) return;
      for (int j = i; j < length - 1; j++) {
        list[j] = list[j + 1];
      }
      length = length - 1;
    }`,
  },
  {
    kind: 'insert',
    name: 'listInsert',
    params: ['list', 'length', 'capacity', 'index', 'value'],
    source: `void listInsert(float list[], byte &length, byte capacity, float index, float value) {
      int i = (int) index - 1;
      if (length >= capacity || i < 0 || i > length) return;
      for (int j = length; j > i; j--) {
        list[j] = list[j - 1];
      }
      list[i] = value;
      length = length + 1;
    }`,
  },
  {
    kind: 'replace',
    name: 'listReplace',
    params: ['list', 'length', 'index', 'value'],
    source: `void listReplace(float list[], byte length, float index, float value) {
      int i = (int) index - 1;
      if (i < 0 || i >= length) return;
      list[i] = value;
    }`,
  },
  {
    kind: 'item',
    name: 'listItem',
    params: ['list', 'length', 'index'],
    source: `float listItem(float list[], byte length, float index) {
      int i = (int) index - 1;
      if (i < 0 || i >= length) return 0;
      return list[i];
    }`,
  },
  {
    kind: 'contains',
    name: 'listContains',
    params: ['list', 'length', 'value'],
    source: `bool listContains(float list[], byte length, float value) {
      for (int i = 0; i < length; i++) {
        if (list[i] == value) return true;
      }
      return false;
    }`,
  },
];

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Reduces a function definition to a form that ignores the two things a
// human is free to change without changing what the code does: the names of
// the function and its parameters, and the whitespace/indentation. Local
// variables inside the body (`i`, `j`) are deliberately NOT canonicalized --
// renaming those is rare, and the cost of not handling it is a rejected
// import with a message, not a wrong one.
//
// Every name is substituted in a single pass so a replacement can never be
// re-matched by a later one.
function canonicalize(source, fnName, paramNames) {
  const names = [fnName, ...paramNames];
  const replacements = new Map();
  names.forEach((name, index) => {
    if (!replacements.has(name)) replacements.set(name, index === 0 ? '$F' : `$P${index - 1}`);
  });
  const pattern = new RegExp(`\\b(${names.map(escapeRegExp).join('|')})\\b`, 'g');
  return source
    .replace(pattern, (match) => replacements.get(match))
    .replace(/\s+/g, ' ')
    // Collapse the spacing around punctuation too, so `list[j+1]` and
    // `list[j + 1]` reduce to the same thing. `$` is excluded so the
    // substituted `$F`/`$P0` placeholders stay intact.
    .replace(/\s*([^\w\s$])\s*/g, '$1')
    .trim();
}

const CANONICAL_HELPERS = HELPER_SOURCES.map((helper) => ({
  kind: helper.kind,
  canonical: canonicalize(helper.source, helper.name, helper.params),
}));

// The identifier a parameter declares, whatever wrapping its declarator has
// -- `float list[]` (array_declarator), `byte &length` (reference_declarator)
// and `float value` (a bare identifier) all have to yield just the name.
function declaredName(node) {
  if (!node) return null;
  if (node.type === 'identifier') return node.text;
  for (const child of node.namedChildren) {
    const found = declaredName(child);
    if (found) return found;
  }
  return null;
}

function functionParts(fnNode) {
  const declarator = fnNode.childForFieldName('declarator');
  const name = declarator?.childForFieldName('declarator')?.text;
  const paramListNode = declarator?.childForFieldName('parameters');
  if (!name || !paramListNode) return null;
  const paramNodes = paramListNode.namedChildren.filter((n) => n.type === 'parameter_declaration');
  const params = paramNodes.map((p) => declaredName(p.childForFieldName('declarator')));
  if (params.some((p) => !p)) return null;
  return { name, params };
}

// Returns the helper kind ('add', 'item', ...) this top-level function is,
// or null if it isn't one. Called from program.js's top-level scan, next to
// the equivalent check for the distance-sensor helper.
export function matchListHelper(fnNode) {
  const parts = functionParts(fnNode);
  if (!parts) return null;
  const canonical = canonicalize(fnNode.text, parts.name, parts.params);
  return CANONICAL_HELPERS.find((helper) => helper.canonical === canonical)?.kind ?? null;
}

// --- global declarations --------------------------------------------------

// `float scores[20];` -> {name, size}, or null for any other declaration.
function arrayDeclaration(node) {
  if (node.childForFieldName('type')?.text !== 'float') return null;
  const declarator = node.childForFieldName('declarator');
  if (declarator?.type !== 'array_declarator') return null;
  const nameNode = declarator.childForFieldName('declarator');
  const sizeNode = declarator.childForFieldName('size');
  if (nameNode?.type !== 'identifier' || sizeNode?.type !== 'number_literal') return null;
  const size = Number(sizeNode.text);
  if (!Number.isInteger(size)) return null;
  return { name: nameNode.text, size, sizeNode };
}

// `byte scoresLength = 0;` -> {name}, or null.
function counterDeclaration(node) {
  if (node.childForFieldName('type')?.text !== 'byte') return null;
  const declarator = node.childForFieldName('declarator');
  if (declarator?.type !== 'init_declarator') return null;
  const nameNode = declarator.childForFieldName('declarator');
  const valueNode = declarator.childForFieldName('value');
  if (nameNode?.type !== 'identifier') return null;
  if (valueNode?.type !== 'number_literal' || Number(valueNode.text) !== 0) return null;
  return { name: nameNode.text };
}

// Pre-scan over the top-level declarations, run before any of them are
// recognized individually (program.js), so that an array and the counter
// that belongs to it are paired up regardless of which order they appear in.
// Pairing is by name -- `scores` + `scoresLength` -- rather than by source
// adjacency, which a human reformatting the file could break.
export function scanListDeclarations(rootNode, ctx) {
  const arrays = [];
  const counterNames = new Set();
  for (const node of rootNode.namedChildren) {
    if (node.type !== 'declaration') continue;
    const array = arrayDeclaration(node);
    if (array) {
      arrays.push({ ...array, node });
      continue;
    }
    const counter = counterDeclaration(node);
    if (counter) counterNames.add(counter.name);
  }

  for (const array of arrays) {
    const lengthName = [...counterNames].find(
      (name) => name.startsWith(array.name) && LENGTH_SUFFIX.test(name.slice(array.name.length)),
    );
    if (!lengthName) {
      ctx.error(
        array.node,
        `"${array.name}" looks like a list, but this app also needs a "byte ${array.name}Length = 0;" counter next to it to know how many items are in it.`,
      );
      ctx.rejectedListNames.add(array.name);
      continue;
    }
    if (!ALLOWED_LIST_SIZES.includes(array.size)) {
      ctx.error(
        array.sizeNode,
        `this app's lists can hold ${ALLOWED_LIST_SIZES.join(', ')} items -- change "${array.name}"'s size of ${array.size} to one of those.`,
      );
      ctx.rejectedListNames.add(array.name);
      ctx.rejectedListNames.add(lengthName);
      continue;
    }
    ctx.addList(array.name, lengthName, array.size);
  }
}

// True if this top-level declaration is one of the two halves of a list --
// either one scanListDeclarations successfully claimed, or one it already
// rejected with a specific reason. program.js skips both, so a list with a
// real problem produces that one precise message instead of it plus a vaguer
// "this app doesn't support this global declaration" on the same line.
export function isListDeclaration(node, ctx) {
  const array = arrayDeclaration(node);
  if (array) return ctx.lists.has(array.name) || ctx.rejectedListNames.has(array.name);
  const counter = counterDeclaration(node);
  if (!counter) return false;
  return ctx.listLengthNames.has(counter.name) || ctx.rejectedListNames.has(counter.name);
}

// --- shared call-site checks ----------------------------------------------

function callArgs(node) {
  const a = node.childForFieldName('arguments');
  return a ? a.namedChildren : [];
}

function listField(list) {
  return { LIST: { id: list.id, name: list.name, type: 'List' } };
}

// Every helper call starts `(<array>, <its own length counter>, ...)`. Both
// have to be plain identifiers naming the same list, which is what stops an
// unrelated function that happens to share a helper's shape from being read
// as a list operation.
function listFromCall(args, ctx) {
  if (args.length < 2) return null;
  if (args[0].type !== 'identifier' || args[1].type !== 'identifier') return null;
  const list = ctx.lists.get(args[0].text);
  if (!list || list.lengthName !== args[1].text) return null;
  return list;
}

// add/insert also pass the capacity, which must agree with the size the
// array was actually declared with -- there's nowhere in the blocks to
// record a second, different capacity.
function capacityMatches(node, list, ctx) {
  if (node.type !== 'number_literal' || Number(node.text) !== list.capacity) {
    ctx.error(
      node,
      `this passes a size of ${node.text} for the list "${list.name}", but "${list.name}" is declared to hold ${list.capacity} items.`,
    );
    return false;
  }
  return true;
}

// --- statements -----------------------------------------------------------

// The four mutating helper calls, plus `<counter> = 0;` for "delete all".
// Returns undefined when this isn't a list statement at all (so the caller
// keeps trying other patterns), a {count, block} result, or FAILED.
export function tryListStatement(node, ctx, scope, FAILED) {
  if (node.type !== 'expression_statement') return undefined;
  const expr = node.namedChild(0);
  if (!expr) return undefined;

  if (expr.type === 'assignment_expression') {
    return tryDeleteAll(expr, node, ctx, FAILED);
  }
  if (expr.type !== 'call_expression') return undefined;

  const fnNode = expr.childForFieldName('function');
  if (fnNode?.type !== 'identifier') return undefined;
  const kind = ctx.listHelperNames.get(fnNode.text);
  if (!kind) return undefined;

  const args = callArgs(expr);
  const list = listFromCall(args, ctx);
  if (!list) {
    ctx.error(node, `"${fnNode.text}(...)" is one of this app's list helpers, but it isn't being called on a list and its matching counter.`);
    return FAILED;
  }

  switch (kind) {
    case 'add': {
      if (args.length !== 4) return undefined;
      if (!capacityMatches(args[2], list, ctx)) return FAILED;
      const item = recognizeExpression(args[3], ctx, scope);
      if (!item) return FAILED;
      return { count: 1, block: { type: 'list_add', fields: listField(list), inputs: input('ITEM', item) } };
    }
    case 'delete': {
      if (args.length !== 3) return undefined;
      const index = recognizeExpression(args[2], ctx, scope);
      if (!index) return FAILED;
      return { count: 1, block: { type: 'list_delete', fields: listField(list), inputs: input('INDEX', index) } };
    }
    case 'insert': {
      if (args.length !== 5) return undefined;
      if (!capacityMatches(args[2], list, ctx)) return FAILED;
      const index = recognizeExpression(args[3], ctx, scope);
      const item = recognizeExpression(args[4], ctx, scope);
      if (!index || !item) return FAILED;
      return {
        count: 1,
        block: { type: 'list_insert', fields: listField(list), inputs: { ...input('ITEM', item), ...input('INDEX', index) } },
      };
    }
    case 'replace': {
      if (args.length !== 4) return undefined;
      const index = recognizeExpression(args[2], ctx, scope);
      const item = recognizeExpression(args[3], ctx, scope);
      if (!index || !item) return FAILED;
      return {
        count: 1,
        block: { type: 'list_replace', fields: listField(list), inputs: { ...input('INDEX', index), ...input('ITEM', item) } },
      };
    }
    default:
      // 'item'/'contains' report values -- a bare call to one as a statement
      // throws its result away, which no block can express.
      ctx.error(node, `"${fnNode.text}(...)" gives back a value, so it can't be used on its own line.`);
      return FAILED;
  }
}

// "delete all of [list]" is the one operation with no helper function: the
// generator emits it as `<counter> = 0;` directly, since emptying a list is
// exactly "the counter is now 0".
function tryDeleteAll(expr, node, ctx, FAILED) {
  const leftNode = expr.childForFieldName('left');
  if (leftNode?.type !== 'identifier') return undefined;
  const listName = ctx.listLengthNames.get(leftNode.text);
  if (!listName) return undefined;

  const rightNode = expr.childForFieldName('right');
  const isZero = rightNode?.type === 'number_literal' && Number(rightNode.text) === 0;
  if (expr.childForFieldName('operator')?.type !== '=' || !isZero) {
    ctx.error(
      node,
      `"${leftNode.text}" is the counter for the list "${listName}" -- the only thing this app can do to it directly is set it to 0 ("delete all of ${listName}"). Use the list blocks to change what's in the list.`,
    );
    return FAILED;
  }
  return { count: 1, block: { type: 'list_delete_all', fields: listField(ctx.lists.get(listName)) } };
}

// --- expressions ----------------------------------------------------------

// `listItem(...)` / `listContains(...)`. Returns undefined if `name` isn't a
// list helper at all, so expressions.js keeps trying its other call shapes.
export function tryListCall(name, args, node, ctx, scope) {
  const kind = ctx.listHelperNames.get(name);
  if (kind !== 'item' && kind !== 'contains') return undefined;
  const list = listFromCall(args, ctx);
  if (!list || args.length !== 3) {
    ctx.error(node, `"${name}(...)" is one of this app's list helpers, but it isn't being called on a list and its matching counter.`);
    return null;
  }
  const value = recognizeExpression(args[2], ctx, scope);
  if (!value) return null;
  if (kind === 'item') {
    return { type: 'list_item', fields: listField(list), inputs: input('INDEX', value) };
  }
  return { type: 'list_contains', fields: listField(list), inputs: input('ITEM', value) };
}

// A bare mention of a list's counter is "length of [list]"; a bare mention of
// the array itself has no block (the list blocks are the only way to touch
// it), so that gets its own message rather than the generic "not a variable"
// one, which would be misleading.
export function tryListIdentifier(node, ctx) {
  const name = node.text;
  const listName = ctx.listLengthNames.get(name);
  if (listName) {
    return { block: { type: 'list_length', fields: listField(ctx.lists.get(listName)) } };
  }
  if (ctx.lists.has(name)) {
    ctx.error(node, `"${name}" is a list -- use the Lists blocks (like "item 1 of ${name}") to read from it.`);
    return { block: null };
  }
  return undefined;
}

// --- project assembly -----------------------------------------------------

// The `create list` blocks to put at the top of setup(). The generated
// declarations they correspond to are globals, so unlike every other block
// there's no statement in the source marking where this one "was" -- the top
// of setup() is where a kid would naturally have put it, and it matches the
// toolbox's own starting scaffold. `list_create` emits no code at its own
// position, so a sketch that goes through import and straight back out again
// still produces byte-identical C++.
export function listCreateBlockStates(ctx) {
  return [...ctx.lists.values()].map((list) => ({
    type: 'list_create',
    fields: { ...listField(list), SIZE: String(list.capacity) },
  }));
}
