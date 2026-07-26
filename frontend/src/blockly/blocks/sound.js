import * as Blockly from 'blockly/core';

// "Sound" block (spec section 2). Note names map to frequencies in the
// generator's lookup table (see generators/arduino/sound.js).
const NOTE_OPTIONS = [
  ['C4', 'C4'], ['D4', 'D4'], ['E4', 'E4'], ['F4', 'F4'],
  ['G4', 'G4'], ['A4', 'A4'], ['B4', 'B4'],
  ['C5', 'C5'], ['D5', 'D5'], ['E5', 'E5'], ['F5', 'F5'],
  ['G5', 'G5'], ['A5', 'A5'], ['B5', 'B5'],
  ['C6', 'C6'],
  ['rest', 'REST'],
];

Blockly.defineBlocksWithJsonArray([
  {
    type: 'sound_play_note',
    message0: 'play pin %1 note %2 for %3 beats',
    args0: [
      { type: 'input_value', name: 'PIN', check: 'Number' },
      { type: 'field_dropdown', name: 'NOTE', options: NOTE_OPTIONS },
      { type: 'input_value', name: 'BEATS', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'camp_sound_blocks',
    tooltip: 'Play a note on a piezo buzzer (tone), then wait for it to finish.',
  },
]);
