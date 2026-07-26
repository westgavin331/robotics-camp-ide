import { arduinoGenerator as generator } from './core.js';

const IR_INCLUDE_KEY = 'include_irremote';
const IR_INCLUDE_LINE = '#include <IRremote.hpp>';

// Always runs once, in setup(), regardless of where the block sits in the
// workspace -- this stage has no dedicated "setup only" area of the canvas
// (see core.js), so like pinMode hoisting, this block contributes nothing
// to its own position in loop() and instead registers a setup() line as a
// side effect. Keyed by a fixed name so a second copy of the block (which
// shouldn't normally happen -- there's only one receiver) just overwrites
// rather than emitting IrReceiver.begin() twice.
generator.forBlock['ir_start_receiver'] = function (block, gen) {
  const pin = gen.valueToCode(block, 'PIN', gen.ORDER_NONE) || '0';
  gen.addInclude(IR_INCLUDE_KEY, IR_INCLUDE_LINE);
  gen.addSetup('ir_receiver_begin', `IrReceiver.begin(${pin}, ENABLE_LED_FEEDBACK);`);
  return '';
};

// See the comment in blocks/ir.js for why this owns the if AND the resume()
// call, instead of "IR signal received?" being a plain boolean.
generator.forBlock['ir_if_received'] = function (block, gen) {
  gen.addInclude(IR_INCLUDE_KEY, IR_INCLUDE_LINE);
  const branch = gen.statementToCode(block, 'DO');
  return `if (IrReceiver.decode()) {\n${branch}${gen.INDENT}IrReceiver.resume();\n}\n`;
};

generator.forBlock['ir_get_code'] = function (block, gen) {
  gen.addInclude(IR_INCLUDE_KEY, IR_INCLUDE_LINE);
  const format = block.getFieldValue('FORMAT');
  const expr =
    format === 'COMMAND' ? 'IrReceiver.decodedIRData.command' : 'IrReceiver.decodedIRData.decodedRawData';
  return [expr, gen.ORDER_ATOMIC];
};

generator.forBlock['ir_repeat_received'] = function (block, gen) {
  gen.addInclude(IR_INCLUDE_KEY, IR_INCLUDE_LINE);
  return ['(IrReceiver.decodedIRData.flags & IRDATA_FLAGS_IS_REPEAT)', gen.ORDER_ATOMIC];
};
