import { arduinoGenerator as generator } from './core.js';

// Standard note frequencies (Hz). REST plays silence.
const NOTE_FREQUENCIES = {
  C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494,
  C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, B5: 988,
  C6: 1047,
  REST: 0,
};

// tone()'s duration is in milliseconds, but the block speaks in "beats" --
// this is the fixed tempo that converts one to the other (1 beat = 250ms,
// i.e. 240 BPM quarter notes). There's no tempo block in this stage, so it's
// just a constant.
const BEAT_DURATION_MS = 250;

generator.forBlock['sound_play_note'] = function (block, gen) {
  const pin = gen.valueToCode(block, 'PIN', gen.ORDER_NONE) || '8';
  const beats = gen.valueToCode(block, 'BEATS', gen.ORDER_MULTIPLICATIVE) || '1';
  const note = block.getFieldValue('NOTE');
  const freq = Object.prototype.hasOwnProperty.call(NOTE_FREQUENCIES, note)
    ? NOTE_FREQUENCIES[note]
    : 0;
  const durationMs = `(${beats} * ${BEAT_DURATION_MS})`;

  if (freq === 0) {
    return `delay(${durationMs});\n`;
  }
  // tone() returns immediately, so the matching delay makes this block play
  // to completion before the next one starts -- otherwise notes would
  // overlap or get cut off.
  return `tone(${pin}, ${freq}, ${durationMs});\ndelay(${durationMs});\n`;
};
