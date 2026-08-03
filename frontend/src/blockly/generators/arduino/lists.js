import * as Blockly from 'blockly/core';
import { arduinoGenerator as generator } from './core.js';
import { DEFAULT_LIST_SIZE } from '../../blocks/lists.js';

// Each list compiles to two globals -- a fixed-size array and a separate
// byte counting how many of its slots are in use:
//
//   float scores[20];
//   byte scoresLength = 0;
//
// See blocks/lists.js for why it's a fixed-size array rather than anything
// heap-backed. The array is `float` because every other number in this app
// is (core.js's addVariable declares all workspace variables `float`), so a
// distance reading of 23.7cm stored in a list and read back is still 23.7
// rather than silently becoming 23.
//
// The length counter is a separate variable rather than, say, a sentinel
// value in the array, because 0 is a perfectly ordinary thing for a kid to
// store -- there is no number available to mean "nothing here".
//
// All the actual list operations live in shared helper functions emitted via
// provideFunction_ (so N copies of "add to list" still emit one listAdd),
// each taking the array, its length counter by reference, and where relevant
// the capacity. That keeps the per-call code a kid sees in View Code down to
// one readable line, and -- more importantly -- puts every bounds check in
// exactly one place instead of inlining it at every call site.

// Index arguments arrive as `float` (every Number socket in this app does),
// so the helpers all start by truncating to a 0-based int. Out-of-range is a
// no-op on the mutating helpers and 0 on listItem, matching Scratch, which
// also refuses to do anything rather than erroring.
const LIST_ADD = [
  `void ${generator.FUNCTION_NAME_PLACEHOLDER_}(float list[], byte &length, byte capacity, float value) {`,
  '  if (length >= capacity) return;',
  '  list[length] = value;',
  '  length = length + 1;',
  '}',
];

const LIST_DELETE = [
  `void ${generator.FUNCTION_NAME_PLACEHOLDER_}(float list[], byte &length, float index) {`,
  '  int i = (int) index - 1;',
  '  if (i < 0 || i >= length) return;',
  '  for (int j = i; j < length - 1; j++) {',
  '    list[j] = list[j + 1];',
  '  }',
  '  length = length - 1;',
  '}',
];

const LIST_INSERT = [
  `void ${generator.FUNCTION_NAME_PLACEHOLDER_}(float list[], byte &length, byte capacity, float index, float value) {`,
  '  int i = (int) index - 1;',
  '  if (length >= capacity || i < 0 || i > length) return;',
  '  for (int j = length; j > i; j--) {',
  '    list[j] = list[j - 1];',
  '  }',
  '  list[i] = value;',
  '  length = length + 1;',
  '}',
];

const LIST_REPLACE = [
  `void ${generator.FUNCTION_NAME_PLACEHOLDER_}(float list[], byte length, float index, float value) {`,
  '  int i = (int) index - 1;',
  '  if (i < 0 || i >= length) return;',
  '  list[i] = value;',
  '}',
];

const LIST_ITEM = [
  `float ${generator.FUNCTION_NAME_PLACEHOLDER_}(float list[], byte length, float index) {`,
  '  int i = (int) index - 1;',
  '  if (i < 0 || i >= length) return 0;',
  '  return list[i];',
  '}',
];

const LIST_CONTAINS = [
  `bool ${generator.FUNCTION_NAME_PLACEHOLDER_}(float list[], byte length, float value) {`,
  '  for (int i = 0; i < length; i++) {',
  '    if (list[i] == value) return true;',
  '  }',
  '  return false;',
  '}',
];

// A list's size comes from its list_create block, which can sit anywhere in
// the workspace -- including *below* the blocks that use the list, or inside
// the forever loop. Since the capacity is baked into both the array
// declaration and every call site, reading it off whichever block the walk
// happens to reach first would mean a create block placed after a use
// declared `float scores[100]` while still telling listAdd the capacity was
// 20, quietly capping the list at the wrong size. So it's looked up from the
// whole workspace, once, and block order never enters into it.
//
// A list with no create block at all is still legal (it just gets the
// default size), and if there are somehow several for one list, the last one
// wins -- an arbitrary but stable choice.
function capacityFor(block, varId) {
  const createBlocks = block.workspace.getBlocksByType('list_create', false);
  let capacity = DEFAULT_LIST_SIZE;
  for (const createBlock of createBlocks) {
    if (createBlock.getFieldValue('LIST') === varId) capacity = Number(createBlock.getFieldValue('SIZE'));
  }
  return capacity;
}

// The C names for one list, cached per generation run (core.js's init()
// clears listVarNames_) so repeated blocks referencing the same list agree on
// both names, and so the length counter's name is only run through the
// deduper once.
//
// Both names go through Blockly.Names, which tracks every name it has handed
// out across variables AND generated function names -- so a list called
// "count" sitting next to a plain variable called "count", or a kid who names
// a variable "scoresLength" while a list "scores" exists, gets one of them
// auto-renamed instead of the two silently compiling into the same C
// identifier.
function listNamesFor(block, gen) {
  const varId = block.getFieldValue('LIST');
  let entry = gen.listVarNames_.get(varId);
  if (!entry) {
    const array = gen.nameDB_.getName(varId, Blockly.Names.NameType.VARIABLE);
    const length = gen.nameDB_.getDistinctName(`${array}Length`, Blockly.Names.NameType.VARIABLE);
    entry = { array, length, capacity: capacityFor(block, varId) };
    gen.listVarNames_.set(varId, entry);
  }
  return entry;
}

// Called by EVERY list block, not just list_create, so a list that's used
// without ever being created still compiles.
function listFor(block, gen) {
  const entry = listNamesFor(block, gen);
  gen.definitions_[`list_${entry.array}`] = `float ${entry.array}[${entry.capacity}];`;
  gen.definitions_[`list_${entry.array}_length`] = `byte ${entry.length} = 0;`;
  return entry;
}

// Contributes no code at its own position -- the two globals it stands for
// are hoisted, the way pinMode/Serial.begin are (see ir.js's
// ir_start_receiver for the same shape). Its size dropdown is read by
// capacityFor() above rather than here, so that every block agrees on the
// capacity no matter which one the generator reaches first.
generator.forBlock['list_create'] = function (block, gen) {
  listFor(block, gen);
  return '';
};

generator.forBlock['list_add'] = function (block, gen) {
  const list = listFor(block, gen);
  const item = gen.valueToCode(block, 'ITEM', gen.ORDER_NONE) || '0';
  const fn = gen.provideFunction_('listAdd', LIST_ADD);
  return `${fn}(${list.array}, ${list.length}, ${list.capacity}, ${item});\n`;
};

generator.forBlock['list_delete'] = function (block, gen) {
  const list = listFor(block, gen);
  const index = gen.valueToCode(block, 'INDEX', gen.ORDER_NONE) || '1';
  const fn = gen.provideFunction_('listDelete', LIST_DELETE);
  return `${fn}(${list.array}, ${list.length}, ${index});\n`;
};

// The only operation with no helper function: emptying a list is exactly
// "the counter is now 0". The array's contents are left alone deliberately
// -- nothing can read past the counter, so zeroing 20 floats would cost loop
// time to hide data that's already unreachable.
generator.forBlock['list_delete_all'] = function (block, gen) {
  const list = listFor(block, gen);
  return `${list.length} = 0;\n`;
};

generator.forBlock['list_insert'] = function (block, gen) {
  const list = listFor(block, gen);
  const index = gen.valueToCode(block, 'INDEX', gen.ORDER_NONE) || '1';
  const item = gen.valueToCode(block, 'ITEM', gen.ORDER_NONE) || '0';
  const fn = gen.provideFunction_('listInsert', LIST_INSERT);
  return `${fn}(${list.array}, ${list.length}, ${list.capacity}, ${index}, ${item});\n`;
};

generator.forBlock['list_replace'] = function (block, gen) {
  const list = listFor(block, gen);
  const index = gen.valueToCode(block, 'INDEX', gen.ORDER_NONE) || '1';
  const item = gen.valueToCode(block, 'ITEM', gen.ORDER_NONE) || '0';
  const fn = gen.provideFunction_('listReplace', LIST_REPLACE);
  return `${fn}(${list.array}, ${list.length}, ${index}, ${item});\n`;
};

generator.forBlock['list_item'] = function (block, gen) {
  const list = listFor(block, gen);
  const index = gen.valueToCode(block, 'INDEX', gen.ORDER_NONE) || '1';
  const fn = gen.provideFunction_('listItem', LIST_ITEM);
  return [`${fn}(${list.array}, ${list.length}, ${index})`, gen.ORDER_UNARY_POSTFIX];
};

generator.forBlock['list_length'] = function (block, gen) {
  const list = listFor(block, gen);
  return [list.length, gen.ORDER_ATOMIC];
};

generator.forBlock['list_contains'] = function (block, gen) {
  const list = listFor(block, gen);
  const item = gen.valueToCode(block, 'ITEM', gen.ORDER_NONE) || '0';
  const fn = gen.provideFunction_('listContains', LIST_CONTAINS);
  return [`${fn}(${list.array}, ${list.length}, ${item})`, gen.ORDER_UNARY_POSTFIX];
};
