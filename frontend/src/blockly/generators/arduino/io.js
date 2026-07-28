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
// different pins each get their own object.
generator.forBlock['io_servo_write'] = function (block, gen) {
  const pin = block.getFieldValue('PIN');
  const angle = gen.valueToCode(block, 'ANGLE', gen.ORDER_NONE) || '90';
  gen.addInclude('include_servo', '#include <Servo.h>');

  const name = `servo_pin${pin}`;
  gen.definitions_[`servo_${name}`] = `Servo ${name};`;
  gen.addSetup(`servo_attach_${name}`, `${name}.attach(${pin});`);
  return `${name}.write(${angle});\n`;
};

generator.forBlock['io_wait'] = function (block, gen) {
  const time = gen.valueToCode(block, 'TIME', gen.ORDER_MULTIPLICATIVE) || '0';
  const unit = block.getFieldValue('UNIT');
  const ms = unit === 'SECONDS' ? `${time} * 1000` : time;
  return `delay(${ms});\n`;
};
