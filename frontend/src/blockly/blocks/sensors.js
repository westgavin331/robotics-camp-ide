import * as Blockly from 'blockly/core';
import { DIGITAL_PIN_OPTIONS } from './pinFields.js';

// "Sensors" blocks (spec section 2, Day 5). `sensor_read_distance` is the
// higher-level ultrasonic wrapper the spec calls out (trigger pulse +
// pulseIn + cm math). "trig"/"echo" match the labels printed right on the
// physical sensor (e.g. HC-SR04), so kids can wire by matching words instead
// of translating jargon -- the first field must still be wired to the
// sender pin, the second to the receiver pin.
Blockly.defineBlocksWithJsonArray([
  {
    type: 'sensor_read_distance',
    message0: 'distance (cm) trig pin %1 echo pin %2',
    args0: [
      { type: 'field_dropdown', name: 'TRIG', options: DIGITAL_PIN_OPTIONS },
      { type: 'field_dropdown', name: 'ECHO', options: DIGITAL_PIN_OPTIONS },
    ],
    inputsInline: true,
    output: 'Number',
    style: 'camp_sensors_blocks',
    tooltip: 'Ultrasonic distance sensor (e.g. HC-SR04): sends a trigger pulse and converts the echo to centimeters.',
  },
]);
