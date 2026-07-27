import { arduinoGenerator as generator } from './core.js';

// The one block that lets a kid state a pin's mode explicitly rather than
// have it inferred from io_digital_write/io_digital_read/io_pwm_write below
// -- this is also the only way INPUT_PULLUP ever reaches a pin, since the
// inferring blocks can only ever guess OUTPUT or INPUT. Routed through the
// same requestPinMode() as the inferred guesses (rather than straight to
// addSetup) so precedence between them is resolved once in finish(),
// regardless of which block the generation walk visits first.
generator.forBlock['io_set_pin_mode'] = function (block, gen) {
  const pin = gen.valueToCode(block, 'PIN', gen.ORDER_NONE) || '0';
  const mode = block.getFieldValue('MODE');
  const trimmed = pin.trim();
  if (/^\d+$/.test(trimmed)) {
    gen.requestPinMode(trimmed, mode, true);
    return '';
  }
  // Dynamic pin expression: no literal pin to hoist to setup(), same
  // inline fallback as io_digital_write/io_pwm_write below.
  return `pinMode(${pin}, ${mode});\n`;
};

generator.forBlock['io_digital_write'] = function (block, gen) {
  const pin = gen.valueToCode(block, 'PIN', gen.ORDER_NONE) || '0';
  const state = block.getFieldValue('STATE');
  const pinModeLine = gen.reservePinMode(pin, 'OUTPUT');
  return `${pinModeLine}digitalWrite(${pin}, ${state});\n`;
};

// Digital pins default to INPUT at boot, so pinMode() is only worth hoisting
// to setup() for literal pins (see reservePinMode); for a dynamic pin
// expression we just read it as-is rather than inline a statement in the
// middle of an expression.
generator.forBlock['io_digital_read'] = function (block, gen) {
  const pin = gen.valueToCode(block, 'PIN', gen.ORDER_NONE) || '0';
  gen.reservePinMode(pin, 'INPUT');
  return [`digitalRead(${pin})`, gen.ORDER_UNARY_POSTFIX];
};

generator.forBlock['io_analog_read'] = function (block, gen) {
  const pin = gen.valueToCode(block, 'PIN', gen.ORDER_NONE) || '0';
  return [`analogRead(${pin})`, gen.ORDER_UNARY_POSTFIX];
};

generator.forBlock['io_pwm_write'] = function (block, gen) {
  const pin = gen.valueToCode(block, 'PIN', gen.ORDER_NONE) || '0';
  const value = gen.valueToCode(block, 'VALUE', gen.ORDER_NONE) || '0';
  const pinModeLine = gen.reservePinMode(pin, 'OUTPUT');
  return `${pinModeLine}analogWrite(${pin}, ${value});\n`;
};

// One Servo object per literal pin (so multiple servos on different pins
// each get their own object, attached once in setup()). A dynamic
// (non-literal) pin falls back to a single shared object that re-attaches
// on every write -- functionally correct, just not as clean as the literal
// case.
generator.forBlock['io_servo_write'] = function (block, gen) {
  const pin = gen.valueToCode(block, 'PIN', gen.ORDER_NONE) || '9';
  const angle = gen.valueToCode(block, 'ANGLE', gen.ORDER_NONE) || '90';
  gen.addInclude('include_servo', '#include <Servo.h>');

  const trimmedPin = pin.trim();
  if (/^\d+$/.test(trimmedPin)) {
    const name = `servo_pin${trimmedPin}`;
    gen.definitions_[`servo_${name}`] = `Servo ${name};`;
    gen.addSetup(`servo_attach_${name}`, `${name}.attach(${trimmedPin});`);
    return `${name}.write(${angle});\n`;
  }

  gen.definitions_['servo_dynamic'] = 'Servo servo_dynamic;';
  return `servo_dynamic.attach(${pin});\nservo_dynamic.write(${angle});\n`;
};

generator.forBlock['io_wait'] = function (block, gen) {
  const time = gen.valueToCode(block, 'TIME', gen.ORDER_MULTIPLICATIVE) || '0';
  const unit = block.getFieldValue('UNIT');
  const ms = unit === 'SECONDS' ? `${time} * 1000` : time;
  return `delay(${ms});\n`;
};
