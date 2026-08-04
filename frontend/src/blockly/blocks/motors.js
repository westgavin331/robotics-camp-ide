import * as Blockly from 'blockly/core';

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
