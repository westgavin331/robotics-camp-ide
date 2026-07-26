import * as Blockly from 'blockly/core';

// "forever" (spec section 2's Control flow list). Stock Blockly has no
// built-in forever block -- Scratch's is a UI/curriculum concept, not part
// of core Blockly -- so this is custom, like the other additions in this
// directory.
//
// No nextStatement: matches Scratch's own "forever" (nothing can ever
// follow it, since execution never falls through an infinite loop) and
// also sidesteps a confusing case for kids -- code placed after a forever
// block directly under the entry-point hat would otherwise have nowhere
// sensible to go. See generators/arduino/core.js for what a forever block
// means specifically when it's a direct child of "when Arduino Uno starts
// up" (its contents become void loop()) versus anywhere else (a genuine
// while (true) -- see generators/arduino/loops.js).
Blockly.defineBlocksWithJsonArray([
  {
    type: 'controls_forever',
    message0: 'forever',
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    style: 'camp_control_blocks',
    tooltip: 'Repeats the enclosed blocks forever.',
  },
]);
