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
  const pin = block.getFieldValue('PIN');
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

// Ticks a kid would otherwise have to track by hand -- last-held command,
// resets to 0 once nothing's arrived for IR_IDLE_TIMEOUT_TICKS loop
// iterations -- to decide the button was released. Threshold and
// reset-on-signal logic match the by-hand version this replaces exactly,
// just relocated from the kid's own blocks into hidden generator state.
const IR_HELD_COMMAND_VAR = 'irHeldCommand';
const IR_IDLE_TICKS_VAR = 'irIdleTicks';
const IR_IDLE_TIMEOUT_TICKS = 20;

// Reads the tracked variable only -- does NOT call IrReceiver.decode()
// itself. Decoding happens exactly once per loop tick, hoisted to the top
// of loop() via addLoopTop() below, so using this reporter many times in
// one program (e.g. several == comparisons in an if/else-if chain) still
// only polls the receiver once per tick.
generator.forBlock['ir_held_command'] = function (block, gen) {
  gen.addInclude(IR_INCLUDE_KEY, IR_INCLUDE_LINE);
  gen.definitions_[`ir_${IR_HELD_COMMAND_VAR}`] = `int ${IR_HELD_COMMAND_VAR} = 0;`;
  gen.definitions_[`ir_${IR_IDLE_TICKS_VAR}`] = `int ${IR_IDLE_TICKS_VAR} = 0;`;
  gen.addLoopTop(
    'ir_held_command_track',
    `if (IrReceiver.decode()) {\n` +
      `${gen.INDENT}${IR_HELD_COMMAND_VAR} = IrReceiver.decodedIRData.command;\n` +
      `${gen.INDENT}${IR_IDLE_TICKS_VAR} = 0;\n` +
      `${gen.INDENT}IrReceiver.resume();\n` +
      `} else {\n` +
      `${gen.INDENT}${IR_IDLE_TICKS_VAR} = ${IR_IDLE_TICKS_VAR} + 1;\n` +
      `}\n` +
      `if (${IR_IDLE_TICKS_VAR} > ${IR_IDLE_TIMEOUT_TICKS}) {\n` +
      `${gen.INDENT}${IR_HELD_COMMAND_VAR} = 0;\n` +
      `}`,
  );
  return [IR_HELD_COMMAND_VAR, gen.ORDER_ATOMIC];
};
