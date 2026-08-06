import * as Blockly from 'blockly/core';
import { DIGITAL_PIN_OPTIONS } from './pinFields.js';

// --- Remote address filtering ------------------------------------------------
//
// Every IR frame carries an address alongside its command byte (NEC: a
// 16-bit device address, IRremote exposes it as
// IrReceiver.decodedIRData.address -- see generators/arduino/ir.js). Two
// robots in the same room with different remotes will see each other's
// signals, so a sumo match needs each robot to answer only its own remote.
//
// The field is a free-text box rather than a dropdown because an address is
// whatever a particular remote happens to send -- there's no fixed list to
// offer. Kids find theirs empirically: drop "start IR receiver" (left on
// `any`), then "if IR signal received" -> "print [get IR code: remote
// address] to serial", upload, press a button, and read the number off the
// Monitor tab.
export const IR_ADDRESS_ANY = 'any';

// Parses an ADDRESS field's text into either IR_ADDRESS_ANY (no filtering)
// or a number. Returns null for anything that isn't one of those, which is
// what makes this usable as both the field validator and the generator's
// reader -- neither has to re-derive the other's idea of what's legal.
//
// Hex is accepted because remote addresses are usually written that way in
// datasheets and tutorials (0xEF00), and decimal because that's what the
// "print the address to serial" discovery flow above actually prints.
export function parseIrAddress(text) {
  const trimmed = String(text ?? '').trim();
  if (trimmed === '' || trimmed.toLowerCase() === IR_ADDRESS_ANY) return IR_ADDRESS_ANY;
  const isHex = /^0[xX][0-9a-fA-F]+$/.test(trimmed);
  if (!isHex && !/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  // The field is uint16_t on the Arduino side, so anything wider than that
  // could never match a real frame.
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) return null;
  return value;
}

// Keeps what the kid typed (0xEF00 stays hex in the generated sketch, which
// is how they'd have read it off a datasheet) while canonicalizing the
// "no filtering" case, so ADDRESS only ever serializes as `any` or a
// well-formed literal.
function validateIrAddress(text) {
  const parsed = parseIrAddress(text);
  if (parsed === null) return null;
  return parsed === IR_ADDRESS_ANY ? IR_ADDRESS_ANY : String(text).trim();
}

// defineBlocksWithJsonArray has no way to express a field validator, so it's
// attached through the extension mechanism instead -- the supported hook for
// "run this against each new instance of the block".
Blockly.Extensions.register('ir_address_field_validator', function () {
  this.getField('ADDRESS').setValidator(validateIrAddress);
});

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
    message0: 'start IR receiver on pin %1 accepting address %2',
    args0: [
      { type: 'field_dropdown', name: 'PIN', options: DIGITAL_PIN_OPTIONS },
      { type: 'field_input', name: 'ADDRESS', text: IR_ADDRESS_ANY },
    ],
    previousStatement: null,
    nextStatement: null,
    style: 'camp_ir_blocks',
    extensions: ['ir_address_field_validator'],
    tooltip:
      'Initializes the IR receiver. Runs once, in setup(). Leave the address on "any" ' +
      'to react to every remote in range. Set it to one remote\'s address (find it by ' +
      'printing "get IR code: remote address" to serial) and every other remote is ' +
      'ignored -- which is what keeps two robots in a match from driving each other.',
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
          ['remote address', 'ADDRESS'],
        ],
      },
    ],
    output: 'Number',
    style: 'camp_ir_blocks',
    tooltip:
      'The code from the most recently received IR signal. "remote address" is which ' +
      'remote sent it -- print that to serial to find out what address your own remote ' +
      "uses, then type it into the \"start IR receiver\" block's address box.",
  },
  // Deliberately NOT a fourth option on `get IR code`, which is typed
  // Number: this reports a *name* ("NEC", "Sony"), so it needs a String
  // output or it would happily plug into a math block.
  //
  // Diagnostic rather than something a robot program would use, and it
  // answers one specific question: whether a given remote's held-button
  // repeats carry the sender's address. Standard NEC repeats do not (they're
  // a fixed, address-less frame), which is what lets two robots in a match
  // confuse each other; NEC2, Sony, RC5/RC6 and Kaseikyo all resend the full
  // frame instead, address included, and are immune.
  {
    type: 'ir_protocol_name',
    message0: 'IR remote protocol',
    output: 'String',
    style: 'camp_ir_blocks',
    tooltip:
      'The name of the protocol the last IR signal used ("NEC", "NEC2", "Sony", ...). ' +
      'HOLD a button down while watching the Monitor: NEC and NEC2 look identical on ' +
      "the first press and only tell themselves apart on the repeats, so it's the held " +
      'reading that matters. "NEC" means this remote\'s repeats carry no address and two ' +
      'robots can steal each other\'s held buttons; anything else means they can\'t.',
  },
  {
    type: 'ir_repeat_received',
    message0: 'IR repeat received?',
    output: 'Boolean',
    style: 'camp_ir_blocks',
    tooltip: 'True if the most recently received signal was a repeat (e.g. a button held down).',
  },
  {
    type: 'ir_held_command',
    message0: 'held IR command',
    output: 'Number',
    style: 'camp_ir_blocks',
    tooltip:
      "The command byte of the most recently received IR signal, or 0 if no signal has arrived recently (the button was released). Replaces the by-hand pattern of tracking a last-command variable and an idle-timeout counter yourself -- use this instead of 'get IR code' when you want to know what's currently being held down.",
  },
]);
