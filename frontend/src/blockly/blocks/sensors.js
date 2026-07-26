import * as Blockly from 'blockly/core';

// "Sensors" blocks (spec section 2, Day 5). `sensor_pulse_read` is the raw
// pulseIn() wrapper; `sensor_read_distance` is the higher-level ultrasonic
// wrapper the spec calls out separately (trigger pulse + pulseIn + cm math).
Blockly.defineBlocksWithJsonArray([
  {
    type: 'sensor_pulse_read',
    message0: 'read pulse pin %1 state %2 timeout %3 µs',
    args0: [
      { type: 'input_value', name: 'PIN', check: 'Number' },
      {
        type: 'field_dropdown',
        name: 'STATE',
        options: [
          ['HIGH', 'HIGH'],
          ['LOW', 'LOW'],
        ],
      },
      { type: 'input_value', name: 'TIMEOUT', check: 'Number' },
    ],
    inputsInline: true,
    output: 'Number',
    style: 'camp_sensors_blocks',
    tooltip: 'Measure how long a pin stays HIGH or LOW, in microseconds (pulseIn).',
  },
  {
    type: 'sensor_read_distance',
    message0: 'read distance (cm) trig pin %1 echo pin %2',
    args0: [
      { type: 'input_value', name: 'TRIG', check: 'Number' },
      { type: 'input_value', name: 'ECHO', check: 'Number' },
    ],
    inputsInline: true,
    output: 'Number',
    style: 'camp_sensors_blocks',
    tooltip: 'Ultrasonic distance sensor (e.g. HC-SR04): sends a trigger pulse and converts the echo to centimeters.',
  },
]);
