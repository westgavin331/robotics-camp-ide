import * as Blockly from 'blockly/core';

// "Motors" blocks: drive a TB6612FNG dual-motor driver with a single fixed
// wiring (this app targets one specific robot chassis, not a general-
// purpose H-bridge block) -- AIN1=2, AIN2=4, BIN1=7, BIN2=8, PWMA=~3,
// PWMB=~5 (see generators/arduino/motors.js). No pin dropdowns, unlike the
// Basic I/O blocks, since there's nothing for a kid to choose.
//
// Motor A drives the right wheel, Motor B the left. The two motors are
// mounted facing opposite directions on the chassis, so the same
// electrical rotation sense drives the robot's two wheels in opposite
// physical directions -- "forward" is therefore counter-clockwise on the
// right motor but clockwise on the left motor.
Blockly.defineBlocksWithJsonArray([
  {
    type: 'motor_right_forward',
    message0: 'move right forward, speed %1',
    args0: [{ type: 'input_value', name: 'SPEED', check: 'Number' }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_motors_blocks',
    tooltip: 'Drive the right motor (A) forward -- counter-clockwise -- at the given speed (0-255).',
  },
  {
    type: 'motor_right_backward',
    message0: 'move right backward, speed %1',
    args0: [{ type: 'input_value', name: 'SPEED', check: 'Number' }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_motors_blocks',
    tooltip: 'Drive the right motor (A) backward -- clockwise -- at the given speed (0-255).',
  },
  {
    type: 'motor_left_forward',
    message0: 'move left forward, speed %1',
    args0: [{ type: 'input_value', name: 'SPEED', check: 'Number' }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_motors_blocks',
    tooltip: 'Drive the left motor (B) forward -- clockwise -- at the given speed (0-255).',
  },
  {
    type: 'motor_left_backward',
    message0: 'move left backward, speed %1',
    args0: [{ type: 'input_value', name: 'SPEED', check: 'Number' }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_motors_blocks',
    tooltip: 'Drive the left motor (B) backward -- counter-clockwise -- at the given speed (0-255).',
  },
]);
