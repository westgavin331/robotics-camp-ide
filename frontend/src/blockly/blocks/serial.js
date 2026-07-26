import * as Blockly from 'blockly/core';

// Minimal debug helper, not part of spec section 2 -- added because there's
// no other way to observe a value (like an IR code) without it, and the
// real Serial Monitor is a later stage (spec section 1). Expect this to be
// folded into a proper "Serial"/debug category once that stage lands.
Blockly.defineBlocksWithJsonArray([
  {
    type: 'serial_print',
    message0: 'print %1 to serial',
    args0: [{ type: 'input_value', name: 'VALUE' }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_serial_blocks',
    tooltip: 'Print a value to the Serial Monitor, followed by a newline.',
  },
]);
