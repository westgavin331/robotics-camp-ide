import * as Blockly from 'blockly/core';

// A Scratch-style theme: saturated primary-color blocks, one hue per
// toolbox category, meant to be used with the 'zelos' renderer (Blockly's
// renderer built specifically to produce Scratch/PictoBlox-style rounded
// puzzle-piece blocks with thick notches).
//
// Colours are Scratch's own real category palette, remapped onto *our*
// category boundaries rather than Blockly's default ones -- e.g. stock
// Blockly puts `controls_if` in the same "logic_blocks" style as
// `logic_compare`, but our toolbox groups if/while/repeat/for into one
// "Control Flow" category separate from "Operators", so those two need
// genuinely different style names (see recolorStockBlocks() in
// blocks/index.js, which is what actually makes that split possible).

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / delta) % 6;
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      default:
        h = (r - g) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toByte = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

// Darkens a hex colour by reducing HSL lightness -- used to derive the
// secondary (shadow-block) and tertiary (border/outline) shades Blockly
// wants for every block style, the same way Blockly's own built-in Zelos
// theme derives its shades from a single primary colour.
function darken(hex, amount) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.max(0, l - amount));
}

function styleFrom(primary) {
  return {
    colourPrimary: primary,
    colourSecondary: darken(primary, 0.045),
    colourTertiary: darken(primary, 0.095),
  };
}

// One style per toolbox category. Custom hardware blocks reference these
// by name directly in their JSON definitions (`style: 'camp_io_blocks'`);
// stock Blockly blocks get remapped onto them via recolorStockBlocks().
export const CATEGORY_COLOURS = {
  io: '#4C97FF', // Scratch "Motion" blue
  sensors: '#5CB1D6', // Scratch "Sensing" cyan -- distinct from I/O's blue
  sound: '#CF63CF', // Scratch "Sound" pink/purple
  ir: '#9966FF', // Scratch "Looks" purple
  serial: '#FFBF00', // Scratch-family gold -- distinct from Control's orange
  control: '#FFAB19', // Scratch "Control" orange
  operators: '#40BF4A', // Scratch "Operators" green
  variables: '#EE7D16', // Scratch "Variables" orange-red -- distinct from Control
  myBlocks: '#FF6680', // Scratch "My Blocks" pink/red
};

export const scratchTheme = Blockly.Theme.defineTheme('scratch_style', {
  name: 'scratch_style',
  base: Blockly.Themes.Classic,
  blockStyles: {
    camp_io_blocks: styleFrom(CATEGORY_COLOURS.io),
    camp_sensors_blocks: styleFrom(CATEGORY_COLOURS.sensors),
    camp_sound_blocks: styleFrom(CATEGORY_COLOURS.sound),
    camp_ir_blocks: styleFrom(CATEGORY_COLOURS.ir),
    camp_serial_blocks: styleFrom(CATEGORY_COLOURS.serial),
    camp_control_blocks: styleFrom(CATEGORY_COLOURS.control),
    camp_operators_blocks: styleFrom(CATEGORY_COLOURS.operators),
    camp_variables_blocks: styleFrom(CATEGORY_COLOURS.variables),
    // Same hue family as Control Flow (this block IS fundamentally a
    // control-flow/entry-point concept) but with the Scratch hat-block cap
    // shape, so it's still immediately recognisable as the special one.
    camp_hat_blocks: { ...styleFrom(CATEGORY_COLOURS.control), hat: 'cap' },
    // "My Blocks" (myBlocks/registry.js): call blocks + parameter reporters
    // use the plain style, the "define" block reuses it with the same 'cap'
    // hat shape as camp_hat_blocks above, for the same reason -- it's a
    // stack entry point, not a normal statement.
    camp_myblocks_blocks: styleFrom(CATEGORY_COLOURS.myBlocks),
    camp_myblocks_hat_blocks: { ...styleFrom(CATEGORY_COLOURS.myBlocks), hat: 'cap' },
  },
  componentStyles: {
    workspaceBackgroundColour: '#F5F7FB',
    // Same tone as the workspace so the toolbox reads as one calm canvas
    // rather than a visibly separate grey panel (Blockly's own default).
    toolboxBackgroundColour: '#F5F7FB',
    toolboxForegroundColour: '#3D3A45',
    flyoutBackgroundColour: '#FFFFFF',
    flyoutForegroundColour: '#6b6375',
    flyoutOpacity: 1,
    scrollbarColour: '#c9ccd6',
    scrollbarOpacity: 0.6,
    insertionMarkerColour: '#4C97FF',
    insertionMarkerOpacity: 0.3,
    markerColour: '#4C97FF',
    cursorColour: '#4C97FF',
  },
  fontStyle: {
    family: "system-ui, 'Segoe UI', Roboto, sans-serif",
    weight: 'bold',
    size: 11,
  },
});
