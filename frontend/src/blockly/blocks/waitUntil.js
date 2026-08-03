import * as Blockly from 'blockly/core';

// "wait until <>" -- Scratch's block of the same name. Like `controls_forever`
// (see forever.js), stock Blockly has no equivalent, so it's custom.
//
// It's the counterpart to io_wait's "wait N seconds": that one pauses for a
// known amount of time, this one pauses for an unknown amount until something
// becomes true -- "wait until the button is pressed", "wait until distance <
// 10". Both are the natural way a kid expresses "hold here", and without this
// block the alternative is an empty "repeat until" loop, which reads like it
// should do something and doesn't.
//
// The CONDITION socket is `check: 'Boolean'`, exactly like controls_if's IF0,
// so it takes the same hexagonal condition blocks and refuses number blocks.
Blockly.defineBlocksWithJsonArray([
  {
    type: 'wait_until',
    message0: 'wait until %1',
    args0: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_control_blocks',
    tooltip:
      'Stops here and keeps checking, over and over, until the condition is true -- then carries on with the blocks below.',
  },
]);
