import * as Blockly from 'blockly/core';

// Stock Blockly's `text` block bakes in a pair of quote-mark FieldImages
// alongside its FieldTextInput (that's Blockly's own default, not something
// this app added), and recolorStock.js repaints every `text` instance --
// including shadow copies -- to the Operators category's green. That's the
// right look for the real, intentionally-dragged "text" reporter in the
// Operators flyout, but wrong for the invisible default filler dropped into
// a text-typed socket (serial_print's VALUE, text_length's VALUE, "My
// Blocks" text parameters, etc.) -- those should look as unobtrusive as the
// math_number shadows already used everywhere else (see toolbox.js).
//
// So: a second, deliberately quote-less block, used ONLY as a shadow
// default. `style: 'math_blocks'` is not a typo -- math_number is never
// listed in recolorStock.js's STOCK_BLOCK_STYLES, so it just renders with
// Blockly's stock default style, which is exactly the "plain white oval"
// look being matched here; reusing that exact style name guarantees the
// same rendering rather than guessing at a new colour that merely looks
// similar.
Blockly.defineBlocksWithJsonArray([
  {
    type: 'shadow_text',
    message0: '%1',
    args0: [{ type: 'field_input', name: 'TEXT', text: '' }],
    output: 'String',
    style: 'math_blocks',
    tooltip: 'A piece of text.',
  },
]);
