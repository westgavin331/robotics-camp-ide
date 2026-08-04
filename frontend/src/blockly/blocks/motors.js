import * as Blockly from 'blockly/core';

// The TB6612FNG's fixed wiring, in one place. generators/arduino/motors.js
// turns these into the actual digitalWrite/analogWrite calls and warnings.js
// flags any pin dropdown a kid points at one of them -- both import from
// here rather than keeping a copy, since PWMA moving 3 -> 6 otherwise has to
// be chased through several files at once, and missing one is silent.
//
// PWMA is pin 6 and NOT pin 3, deliberately: pin 3 is driven by Timer2,
// which is the same timer IRremote reconfigures for its 50us receive tick,
// so with the IR receiver running analogWrite() on pin 3 stopped producing
// the duty cycle it was asked for and motor A had no usable speed control.
// Pins 5 and 6 are both on Timer0, which IRremote leaves alone.
//
// (src/importCpp/statements.js keeps its own copy on purpose -- see the
// comment there -- so the importer never has to pull in the Blockly tree.)
export const RIGHT_MOTOR_PINS = { in1: 2, in2: 4, pwm: 6 }; // motor A
export const LEFT_MOTOR_PINS = { in1: 7, in2: 8, pwm: 5 }; // motor B

export const MOTOR_PINS = new Set([
  ...Object.values(RIGHT_MOTOR_PINS),
  ...Object.values(LEFT_MOTOR_PINS),
]);

// "Motors" blocks: drive a TB6612FNG dual-motor driver with a single fixed
// wiring (this app targets one specific robot chassis, not a general-
// purpose H-bridge block) -- AIN1=2, AIN2=4, BIN1=7, BIN2=8, PWMA=~6,
// PWMB=~5 (see generators/arduino/motors.js, which explains why PWMA is on
// pin 6 rather than the more obvious pin 3). No pin dropdowns, unlike the
// Basic I/O blocks, since there's nothing for a kid to choose.
//
// Every block here moves *both* motors at once -- a kid thinks in terms of
// the robot going forward or turning, not in terms of two independent
// wheels. Motor A drives the right wheel, Motor B the left; the two are
// mounted facing opposite directions on the chassis, so the same electrical
// rotation sense drives the robot's two wheels in opposite physical
// directions (see generators/arduino/motors.js for the resulting mapping).
//
// The blocks come in two flavours: the "for N seconds" ones run and then
// stop on their own, and the "set ..." ones just leave the motors running
// until something else changes them -- so a kid can steer from inside their
// own forever loop / IR handler without every block fighting to stop.
Blockly.defineBlocksWithJsonArray([
  {
    type: 'motor_drive_for',
    message0: 'move %1 at speed %2 for %3 seconds',
    args0: [
      {
        type: 'field_dropdown',
        name: 'DIR',
        options: [
          ['forward', 'FORWARD'],
          ['backward', 'BACKWARD'],
        ],
      },
      { type: 'input_value', name: 'SPEED', check: 'Number' },
      { type: 'input_value', name: 'TIME', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_motors_blocks',
    tooltip: 'Drive both motors the same way at the given speed (0-255) for the given number of seconds, then stop them.',
  },
  {
    type: 'motor_turn_for',
    message0: 'turn %1 at speed %2 for %3 seconds',
    args0: [
      {
        type: 'field_dropdown',
        name: 'DIR',
        options: [
          ['left', 'LEFT'],
          ['right', 'RIGHT'],
        ],
      },
      { type: 'input_value', name: 'SPEED', check: 'Number' },
      { type: 'input_value', name: 'TIME', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_motors_blocks',
    tooltip: 'Spin the robot in place at the given speed (0-255) for the given number of seconds, then stop -- the two wheels drive in opposite directions.',
  },
  {
    type: 'motor_set_drive',
    message0: 'set speed %1 to %2',
    args0: [
      {
        type: 'field_dropdown',
        name: 'DIR',
        options: [
          ['forward', 'FORWARD'],
          ['backward', 'BACKWARD'],
        ],
      },
      { type: 'input_value', name: 'SPEED', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_motors_blocks',
    tooltip: 'Start both motors going that way at the given speed (0-255) and leave them running -- nothing stops them until another Motors block does.',
  },
  {
    type: 'motor_set_turn',
    message0: 'set turn %1 speed to %2',
    args0: [
      {
        type: 'field_dropdown',
        name: 'DIR',
        options: [
          ['left', 'LEFT'],
          ['right', 'RIGHT'],
        ],
      },
      { type: 'input_value', name: 'SPEED', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_motors_blocks',
    tooltip: 'Start the robot spinning in place at the given speed (0-255) and leave it spinning -- nothing stops it until another Motors block does.',
  },
  {
    type: 'motor_stop',
    message0: 'stop motors',
    previousStatement: null,
    nextStatement: null,
    style: 'camp_motors_blocks',
    tooltip: 'Stop both motors right away.',
  },
]);
