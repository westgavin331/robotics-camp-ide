import * as Blockly from 'blockly/core';
import { DIGITAL_PIN_OPTIONS, ANALOG_PIN_OPTIONS, PWM_PIN_OPTIONS } from './pinFields.js';

// "Basic I/O" blocks (spec section 2, Day 1-2). Pin numbers are fixed
// dropdowns (see pinFields.js) rather than connectable Number inputs, so a
// pin choice is always a valid, board-appropriate literal.
Blockly.defineBlocksWithJsonArray([
  {
    type: 'io_digital_write',
    message0: 'set digital pin %1 to %2',
    args0: [
      { type: 'field_dropdown', name: 'PIN', options: DIGITAL_PIN_OPTIONS },
      {
        type: 'field_dropdown',
        name: 'STATE',
        options: [
          ['HIGH', 'HIGH'],
          ['LOW', 'LOW'],
        ],
      },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_io_blocks',
    tooltip: 'Set a digital pin HIGH or LOW (digitalWrite).',
  },
  {
    type: 'io_digital_read',
    message0: 'read digital pin %1',
    args0: [{ type: 'field_dropdown', name: 'PIN', options: DIGITAL_PIN_OPTIONS }],
    inputsInline: true,
    output: 'Number',
    style: 'camp_io_blocks',
    tooltip: 'Read a digital pin (digitalRead). Returns HIGH (1) or LOW (0).',
  },
  {
    type: 'io_analog_read',
    message0: 'read analog pin %1',
    args0: [{ type: 'field_dropdown', name: 'PIN', options: ANALOG_PIN_OPTIONS }],
    inputsInline: true,
    output: 'Number',
    style: 'camp_io_blocks',
    tooltip: 'Read an analog pin (analogRead). Returns 0-1023.',
  },
  {
    type: 'io_pwm_write',
    message0: 'set PWM pin %1 to %2',
    args0: [
      { type: 'field_dropdown', name: 'PIN', options: PWM_PIN_OPTIONS },
      { type: 'input_value', name: 'VALUE', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_io_blocks',
    tooltip: 'Set a PWM pin to a value 0-255 (analogWrite). Only the PWM-capable pins (marked ~) are offered.',
  },
  {
    type: 'io_servo_write',
    message0: 'set servo pin %1 angle %2',
    args0: [
      { type: 'field_dropdown', name: 'PIN', options: DIGITAL_PIN_OPTIONS },
      { type: 'input_value', name: 'ANGLE', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_io_blocks',
    tooltip: 'Set a servo (0-180 degrees). Needs the Servo library.',
  },
  {
    type: 'io_wait',
    message0: 'wait %1 %2',
    args0: [
      { type: 'input_value', name: 'TIME', check: 'Number' },
      {
        type: 'field_dropdown',
        name: 'UNIT',
        options: [
          ['seconds', 'SECONDS'],
          ['ms', 'MS'],
        ],
      },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_io_blocks',
    tooltip: 'Pause the program (delay).',
  },
]);
