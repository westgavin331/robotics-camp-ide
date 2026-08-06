import { arduinoGenerator as generator } from './core.js';
import { parseIrAddress, IR_ADDRESS_ANY } from '../../blocks/ir.js';

const IR_INCLUDE_KEY = 'include_irremote';
const IR_INCLUDE_LINE = '#include <IRremote.hpp>';

// --- Remote address filtering ------------------------------------------------
//
// The accepted address is configured on `ir_start_receiver` (see
// blocks/ir.js) but enforced by the blocks that actually consume frames, so
// every consumer has to read a field belonging to a different block. That's
// the only arrangement that matches what the hardware does: IrReceiver.begin()
// takes no address argument -- the library hands over every frame it decodes
// regardless of sender, and filtering is purely something the sketch does
// afterwards. One receiver, one configured address, honoured everywhere.
//
// Looked up from the workspace on each call rather than cached on the
// generator: a generation run sees a frozen workspace, and workspaces here
// are small enough that a scan per IR block is not worth the staleness risk
// of a cache that init() would have to remember to clear.
export const IR_ADDRESS_VAR = 'irAcceptedAddress';

function configuredAddress(block) {
  for (const receiver of block.workspace.getBlocksByType('ir_start_receiver', false)) {
    const parsed = parseIrAddress(receiver.getFieldValue('ADDRESS'));
    if (parsed !== null && parsed !== IR_ADDRESS_ANY) return receiver.getFieldValue('ADDRESS').trim();
  }
  return null;
}

// Declared by every block that references it, not just by ir_start_receiver,
// so the constant can never go missing -- a receiver block sitting
// unconnected in the workspace still configures the address, but its own
// generator function never runs.
function declareAddress(gen, addressText) {
  gen.definitions_[`ir_${IR_ADDRESS_VAR}`] = `const uint16_t ${IR_ADDRESS_VAR} = ${addressText};`;
}

// Wraps `body` in the address check when filtering is on, and returns it
// unchanged when it isn't -- so a workspace left on "any" generates exactly
// the sketch it generated before this option existed.
//
// `body` is expected to be already indented one level (it goes inside a
// brace either way); the guard re-indents it a second level when it applies.
function withAddressGuard(block, gen, body) {
  const addressText = configuredAddress(block);
  if (addressText === null) return body;
  declareAddress(gen, addressText);
  // prefixLines() indents a blank body into a stray indent-only line, which
  // would push the closing brace out of alignment -- an empty "if IR signal
  // received" is a perfectly normal half-built program, so it gets braces
  // that still line up.
  const guarded = body.trim() === '' ? '' : gen.prefixLines(body, gen.INDENT);
  return (
    `${gen.INDENT}if (IrReceiver.decodedIRData.address == ${IR_ADDRESS_VAR}) {\n` +
    guarded +
    `${gen.INDENT}}\n`
  );
}

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
  // Emitted even with no consumer block in the workspace, so the configured
  // address survives a View Code / Import C++ round trip on its own.
  const addressText = configuredAddress(block);
  if (addressText !== null) declareAddress(gen, addressText);
  return '';
};

// See the comment in blocks/ir.js for why this owns the if AND the resume()
// call, instead of "IR signal received?" being a plain boolean.
//
// resume() stays OUTSIDE the address guard: a frame from another robot's
// remote still has to be released or the receiver never listens again. A
// non-matching frame is dropped exactly as if nothing but resume() had
// happened, which is the point -- it is not reported to the kid's blocks as
// a received-but-unrecognized signal.
generator.forBlock['ir_if_received'] = function (block, gen) {
  gen.addInclude(IR_INCLUDE_KEY, IR_INCLUDE_LINE);
  const branch = withAddressGuard(block, gen, gen.statementToCode(block, 'DO'));
  return `if (IrReceiver.decode()) {\n${branch}${gen.INDENT}IrReceiver.resume();\n}\n`;
};

generator.forBlock['ir_get_code'] = function (block, gen) {
  gen.addInclude(IR_INCLUDE_KEY, IR_INCLUDE_LINE);
  const format = block.getFieldValue('FORMAT');
  const FIELDS = {
    COMMAND: 'IrReceiver.decodedIRData.command',
    ADDRESS: 'IrReceiver.decodedIRData.address',
    RAW: 'IrReceiver.decodedIRData.decodedRawData',
  };
  return [FIELDS[format] ?? FIELDS.RAW, gen.ORDER_ATOMIC];
};

// getProtocolString() returns a __FlashStringHelper* on AVR (the name lives
// in PROGMEM, not RAM -- IRReceive.hpp:2424), which Serial.println already
// has an overload for, so this needs no conversion to be printable.
generator.forBlock['ir_protocol_name'] = function (block, gen) {
  gen.addInclude(IR_INCLUDE_KEY, IR_INCLUDE_LINE);
  return ['IrReceiver.getProtocolString()', gen.ORDER_ATOMIC];
};

generator.forBlock['ir_repeat_received'] = function (block, gen) {
  gen.addInclude(IR_INCLUDE_KEY, IR_INCLUDE_LINE);
  return ['(IrReceiver.decodedIRData.flags & IRDATA_FLAGS_IS_REPEAT)', gen.ORDER_ATOMIC];
};

// Bookkeeping a kid would otherwise have to do by hand -- hold on to the
// last command received, and drop back to 0 once nothing has arrived for a
// while, which is what "the button was released" looks like from here.
//
// The idle timeout is a DURATION, deliberately, not a count of loop
// iterations. A held NEC button re-sends a repeat frame roughly every 110ms,
// so anything measuring the gap in loop passes is really measuring loop
// speed: at a typical few-tens-of-microseconds per iteration an
// iteration-counted timeout expires within a fraction of a millisecond of
// each frame, and the "held" command reads 0 for ~99% of the time the button
// is physically down. Worse, it silently starts working as the loop gets
// slower, so adding blocks appears to fix it.
//
// 150ms clears the 110ms repeat interval with enough margin for loop jitter.
// Raising it toward ~250ms would also ride out a single dropped repeat frame,
// at the cost of the motors coasting a little longer after a release.
//
// millis() is unsigned, so the subtraction below stays correct across the
// ~49-day rollover -- do not rewrite it as `millis() > last + timeout`.
const IR_HELD_COMMAND_VAR = 'irHeldCommand';
const IR_LAST_SIGNAL_VAR = 'irLastSignalMs';
const IR_IDLE_TIMEOUT_MS = 150;

// Reads the tracked variable only -- does NOT call IrReceiver.decode()
// itself. Decoding happens exactly once per loop tick, hoisted to the top
// of loop() via addLoopTop() below, so using this reporter many times in
// one program (e.g. several == comparisons in an if/else-if chain) still
// only polls the receiver once per tick.
generator.forBlock['ir_held_command'] = function (block, gen) {
  gen.addInclude(IR_INCLUDE_KEY, IR_INCLUDE_LINE);
  gen.definitions_[`ir_${IR_HELD_COMMAND_VAR}`] = `int ${IR_HELD_COMMAND_VAR} = 0;`;
  gen.definitions_[`ir_${IR_LAST_SIGNAL_VAR}`] = `unsigned long ${IR_LAST_SIGNAL_VAR} = 0;`;
  // Only the two tracking assignments sit inside the address guard. resume()
  // stays outside it (another remote's frame still has to be released), and
  // so does the idle timeout -- that measures "how long since a frame *we
  // accept* arrived", which is exactly what should keep counting up while
  // someone else's remote is the only thing transmitting.
  const tracked =
    `${gen.INDENT}${IR_HELD_COMMAND_VAR} = IrReceiver.decodedIRData.command;\n` +
    `${gen.INDENT}${IR_LAST_SIGNAL_VAR} = millis();\n`;
  gen.addLoopTop(
    'ir_held_command_track',
    `if (IrReceiver.decode()) {\n` +
      withAddressGuard(block, gen, tracked) +
      `${gen.INDENT}IrReceiver.resume();\n` +
      `}\n` +
      `if (millis() - ${IR_LAST_SIGNAL_VAR} > ${IR_IDLE_TIMEOUT_MS}) {\n` +
      `${gen.INDENT}${IR_HELD_COMMAND_VAR} = 0;\n` +
      `}`,
  );
  return [IR_HELD_COMMAND_VAR, gen.ORDER_ATOMIC];
};
