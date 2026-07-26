import * as Blockly from 'blockly/core';

// "IR Remote" blocks (spec section 2, Day 6), over the IRremote library
// (Armin Joachimsmeyer's fork).
//
// `ir_if_received` is deliberately NOT "a boolean you plug into a stock if
// block" even though the spec table describes "IR signal received?" that
// way. A value block has no way to inject a statement (IrReceiver.resume())
// into whichever ancestor block happens to be using it -- Blockly's
// generator model only lets a value block return an expression. Baking the
// if/resume pairing into one compound block is the only way to guarantee
// resume() always runs, which is the actual point of the spec's design
// suggestion ("kids shouldn't need to think about buffer management").
// `IR repeat received?` has no such requirement (it's a plain flag read), so
// it stays a normal boolean value block, usable inside the if's body.
Blockly.defineBlocksWithJsonArray([
  {
    type: 'ir_start_receiver',
    message0: 'start IR receiver on pin %1',
    args0: [{ type: 'input_value', name: 'PIN', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    style: 'camp_ir_blocks',
    tooltip: 'Initializes the IR receiver. Runs once, in setup().',
  },
  {
    type: 'ir_if_received',
    message0: 'if IR signal received',
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    nextStatement: null,
    style: 'camp_ir_blocks',
    tooltip:
      'Runs the attached blocks when a new IR signal arrives, then automatically resumes listening for the next one.',
  },
  {
    type: 'ir_get_code',
    message0: 'get IR code %1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'FORMAT',
        options: [
          ['full code', 'RAW'],
          ['command byte', 'COMMAND'],
        ],
      },
    ],
    output: 'Number',
    style: 'camp_ir_blocks',
    tooltip: 'The code from the most recently received IR signal.',
  },
  {
    type: 'ir_repeat_received',
    message0: 'IR repeat received?',
    output: 'Boolean',
    style: 'camp_ir_blocks',
    tooltip: 'True if the most recently received signal was a repeat (e.g. a button held down).',
  },
]);
