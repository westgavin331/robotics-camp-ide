import * as Blockly from 'blockly/core';

// The required entry point (spec-driven addition, not from section 2's
// table -- see generators/arduino/core.js for what this means for code
// generation). Shaped like a Scratch hat block: no previousStatement means
// nothing can ever connect above it, nextStatement lets blocks stack
// underneath it same as any normal statement chain (not a nested C-shape --
// "blocks snap in underneath", not "inside"). The 'cap' hat style (see
// theme.js) gives it the rounded-top look on top of that.
Blockly.defineBlocksWithJsonArray([
  {
    type: 'arduino_start',
    message0: 'when Arduino Uno starts up',
    nextStatement: null,
    style: 'camp_hat_blocks',
    tooltip:
      'The starting point of your program. Blocks connected directly below run once; ' +
      'put a "forever" block here to run something over and over.',
  },
]);
