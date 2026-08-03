import * as Blockly from 'blockly/core';

// "Lists" blocks -- Scratch's list blocks, on hardware that has no dynamic
// memory to implement them the way Scratch does.
//
// Scratch lists are heap-backed and unbounded. The Uno has 2048 bytes of
// SRAM total, and its heap grows toward the stack with nothing guarding the
// gap, so a malloc/realloc-backed list (or a std::vector, or a linked list)
// fragments memory on repeated add/delete and eventually dies at an
// unpredictable later moment with no error -- which to an 8-12 year old is
// indistinguishable from "the robot is broken". So every list here is a
// fixed-size global array plus a separate byte holding how many slots are
// actually in use (see generators/arduino/lists.js). All the memory is
// allocated at compile time, which means the size cost is knowable before
// the sketch is ever uploaded -- that's what makes the RAM warning in
// warnings.js possible at all.
//
// The visible consequence of that choice, and the reason `list_create`
// carries a size dropdown instead of being a bare "create list": a list has
// a hard ceiling, and it's better for a kid to pick it (and see it written
// on the block) than to discover it as silent, unexplained data loss. Adding
// past the ceiling is a no-op rather than an error, which is the closest
// thing to Scratch's "nothing bad ever happens" feel that's also safe.
//
// Lists hold numbers only, not text. Every workspace variable in this app is
// already declared `float` (see core.js's addVariable) for the same
// no-type-inference reason, and a String element would be a 6-byte object
// per slot whose characters live on the heap -- dragging the fragmentation
// problem back in through the side door.

// Lists are Blockly variables of their own type, not of the default ''
// type, which is what keeps them out of the Variables category (Blockly's
// own Variables.flyoutCategory only ever offers getVariablesOfType('')) while
// still giving every list dropdown rename/delete and serialization for free.
export const LIST_VARIABLE_TYPE = 'List';

// Scratch's own default list name, kept for familiarity.
const DEFAULT_LIST_NAME = 'my list';

// Per-slot cost of the generated `float name[N];` array on an AVR, plus the
// one byte its length counter takes. Used by warnings.js to price a
// workspace's lists against the Uno's 2048 bytes.
export const LIST_ITEM_BYTES = 4;
export const LIST_LENGTH_BYTES = 1;

// 20 items = 81 bytes = 4% of the Uno's SRAM, which leaves room for the
// several-hundred-byte fixed costs of the IRremote/Serial/Servo libraries
// plus stack headroom. 100 items = 401 bytes, i.e. a fifth of the whole
// board, which is why it's the top of the list rather than a free-typed
// number -- see the budget check in warnings.js.
export const DEFAULT_LIST_SIZE = 20;
export const LIST_SIZE_OPTIONS = [
  ['10', '10'],
  ['20', '20'],
  ['50', '50'],
  ['100', '100'],
];

// Every list-referencing field is identical, so it's built once here rather
// than repeated nine times below.
function listField() {
  return {
    type: 'field_variable',
    name: 'LIST',
    variable: DEFAULT_LIST_NAME,
    variableTypes: [LIST_VARIABLE_TYPE],
    defaultType: LIST_VARIABLE_TYPE,
  };
}

// Index inputs are `check: 'Number'` like every other numeric socket, and
// are 1-based to match Scratch ("item 1 of" is the first item, not "item
// 0"). Out-of-range indexes are no-ops on the statement blocks and 0 on
// `item _ of _`, rather than errors -- see the generator for where that's
// enforced.
Blockly.defineBlocksWithJsonArray([
  {
    type: 'list_create',
    message0: 'create list %1 with room for %2 items',
    args0: [
      listField(),
      { type: 'field_dropdown', name: 'SIZE', options: LIST_SIZE_OPTIONS },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_lists_blocks',
    tooltip:
      "Makes the list, and decides how many items it can ever hold. The room is reserved on the Arduino whether you fill it or not, so pick the smallest size that fits what you're storing.",
  },
  {
    type: 'list_add',
    message0: 'add %1 to %2',
    args0: [{ type: 'input_value', name: 'ITEM', check: 'Number' }, listField()],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_lists_blocks',
    tooltip: 'Adds a number to the end of the list. Does nothing if the list is already full.',
  },
  {
    type: 'list_delete',
    message0: 'delete item %1 of %2',
    args0: [{ type: 'input_value', name: 'INDEX', check: 'Number' }, listField()],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_lists_blocks',
    tooltip: 'Removes one item, and closes the gap so the items after it shift up by one. The first item is item 1.',
  },
  {
    type: 'list_delete_all',
    message0: 'delete all of %1',
    args0: [listField()],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_lists_blocks',
    tooltip: 'Empties the list. The reserved room stays the same -- only the count of items in it goes back to 0.',
  },
  {
    type: 'list_insert',
    message0: 'insert %1 at %2 of %3',
    args0: [
      { type: 'input_value', name: 'ITEM', check: 'Number' },
      { type: 'input_value', name: 'INDEX', check: 'Number' },
      listField(),
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_lists_blocks',
    tooltip: 'Puts a number in at that spot, pushing everything from there onward down by one. Does nothing if the list is already full.',
  },
  {
    type: 'list_replace',
    message0: 'replace item %1 of %2 with %3',
    args0: [
      { type: 'input_value', name: 'INDEX', check: 'Number' },
      listField(),
      { type: 'input_value', name: 'ITEM', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_lists_blocks',
    tooltip: 'Swaps out one item for a different number, leaving the length of the list unchanged.',
  },
  {
    type: 'list_item',
    message0: 'item %1 of %2',
    args0: [{ type: 'input_value', name: 'INDEX', check: 'Number' }, listField()],
    inputsInline: true,
    output: 'Number',
    style: 'camp_lists_blocks',
    tooltip: 'The number stored at that spot. The first item is item 1. Gives back 0 if there is no item there.',
  },
  {
    type: 'list_length',
    message0: 'length of %1',
    args0: [listField()],
    inputsInline: true,
    output: 'Number',
    style: 'camp_lists_blocks',
    tooltip: 'How many items are in the list right now -- not how much room it has.',
  },
  {
    type: 'list_contains',
    message0: 'list %1 contains %2 ?',
    args0: [listField(), { type: 'input_value', name: 'ITEM', check: 'Number' }],
    inputsInline: true,
    output: 'Boolean',
    style: 'camp_lists_blocks',
    tooltip: 'True if that number is somewhere in the list.',
  },
]);
