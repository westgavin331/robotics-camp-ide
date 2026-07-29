import * as Blockly from 'blockly/core';
import { DIGITAL_PIN_OPTIONS } from './pinFields.js';

// "Sensors" blocks (spec section 2, Day 5). `sensor_read_distance` is the
// higher-level ultrasonic wrapper the spec calls out (trigger pulse +
// pulseIn + cm math). The visible label uses "ping"/"listen" instead of the
// trig/echo jargon printed on the physical sensor -- the PIN field names
// stay TRIG/ECHO internally since the generator and importCpp both key off
// them, and the first field must still be wired to the sender pin, the
// second to the receiver pin.
Blockly.defineBlocksWithJsonArray([
  {
    type: 'sensor_read_distance',
    message0: 'distance (cm) ping pin %1 listen pin %2',
    args0: [
      { type: 'field_dropdown', name: 'TRIG', options: DIGITAL_PIN_OPTIONS },
      { type: 'field_dropdown', name: 'ECHO', options: DIGITAL_PIN_OPTIONS },
    ],
    inputsInline: true,
    output: 'Number',
    style: 'camp_sensors_blocks',
    tooltip: 'Ultrasonic distance sensor (e.g. HC-SR04): sends a ping pulse out one pin and times how long the echo takes to come back on the other.',
  },
]);
