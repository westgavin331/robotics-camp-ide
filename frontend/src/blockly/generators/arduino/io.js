import { arduinoGenerator as generator } from './core.js';

generator.forBlock['io_digital_write'] = function (block, gen) {
  const pin = block.getFieldValue('PIN');
  const state = block.getFieldValue('STATE');
  gen.reservePinMode(pin, 'OUTPUT');
  return `digitalWrite(${pin}, ${state});\n`;
};

// INPUT_PULLUP rather than plain INPUT: a pin used only for reading and
// left floating (nothing wired to it) reads noise, and pull-up is the
// safer default for a beginner-facing tool -- a kid who's actually wired an
// external pull-down/pull-up resistor is an edge case this stage doesn't
// need to support.
generator.forBlock['io_digital_read'] = function (block, gen) {
  const pin = block.getFieldValue('PIN');
  gen.reservePinMode(pin, 'INPUT_PULLUP');
  return [`digitalRead(${pin})`, gen.ORDER_UNARY_POSTFIX];
};

generator.forBlock['io_analog_read'] = function (block, gen) {
  const pin = block.getFieldValue('PIN');
  return [`analogRead(${pin})`, gen.ORDER_UNARY_POSTFIX];
};

generator.forBlock['io_pwm_write'] = function (block, gen) {
  const pin = block.getFieldValue('PIN');
  const value = gen.valueToCode(block, 'VALUE', gen.ORDER_NONE) || '0';
  gen.reservePinMode(pin, 'OUTPUT');
  return `analogWrite(${pin}, ${value});\n`;
};

// One Servo object per pin, attached once in setup(), so multiple servos on
// different pins each get their own object. Shared by both servo blocks:
// either one on its own is enough to declare and attach that pin's servo.
function servoObject(pin, gen) {
  gen.addInclude('include_servo', '#include <Servo.h>');
  const name = `servo_pin${pin}`;
  gen.definitions_[`servo_${name}`] = `Servo ${name};`;
  gen.addSetup(`servo_attach_${name}`, `${name}.attach(${pin});`);
  return name;
}

generator.forBlock['io_servo_write'] = function (block, gen) {
  const pin = block.getFieldValue('PIN');
  const angle = gen.valueToCode(block, 'ANGLE', gen.ORDER_NONE) || '90';
  return `${servoObject(pin, gen)}.write(${angle});\n`;
};

// Nothing here tracks the current angle per pin (no equivalent of
// reservePinMode's bookkeeping), because the Servo object already is that
// state: read() gives back the value passed to the last write(), and a servo
// that hasn't been written yet reads as the library's 90-degree default. A
// mirror variable kept alongside it could only ever drift from the real thing.
//
// constrain() isn't just tidiness -- Servo::write() reads any value of 544 or
// more as a pulse width in microseconds instead of an angle, so a delta that
// pushed the total that far would stop being interpreted as an angle at all.
// Being an Arduino core macro, it does expand the delta expression three
// times, so a delta with side effects (a random, a distance reading) runs
// three times -- the same tradeoff math_random_int's min()/max() already
// makes, and the reason to prefer it over a helper function is the same: the
// generated line stays something a kid can read in View Code.
generator.forBlock['io_servo_change'] = function (block, gen) {
  const pin = block.getFieldValue('PIN');
  const delta = gen.valueToCode(block, 'DELTA', gen.ORDER_ADDITIVE) || '0';
  const name = servoObject(pin, gen);
  return `${name}.write(constrain(${name}.read() + ${delta}, 0, 180));\n`;
};

generator.forBlock['io_wait'] = function (block, gen) {
  const time = gen.valueToCode(block, 'TIME', gen.ORDER_MULTIPLICATIVE) || '0';
  const unit = block.getFieldValue('UNIT');
  const ms = unit === 'SECONDS' ? `${time} * 1000` : time;
  return `delay(${ms});\n`;
};
