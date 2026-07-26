import * as Blockly from 'blockly/core';

// Stock Blockly blocks come with their own built-in style names
// (logic_blocks, loop_blocks, math_blocks, text_blocks, variable_blocks),
// but those don't line up with *our* toolbox categories -- e.g. Blockly
// puts `controls_if` in "logic_blocks" alongside `logic_compare`, while our
// toolbox splits them into separate "Control Flow" and "Operators"
// categories that need genuinely different colours. Theme block-style
// overrides alone can't do that split (they key on the shared style name,
// which both blocks reference), so instead each listed block type's own
// init() is wrapped to force our own style immediately after Blockly's
// default setup runs. This affects every instance -- flyout previews and
// workspace blocks alike -- since both go through the same init().
const STOCK_BLOCK_STYLES = {
  // Control Flow
  controls_if: 'camp_control_blocks',
  controls_whileUntil: 'camp_control_blocks',
  controls_repeat_ext: 'camp_control_blocks',
  controls_for: 'camp_control_blocks',
  controls_flow_statements: 'camp_control_blocks',
  // Operators (logic + math + text, grouped per spec section 2)
  logic_compare: 'camp_operators_blocks',
  logic_operation: 'camp_operators_blocks',
  logic_negate: 'camp_operators_blocks',
  logic_boolean: 'camp_operators_blocks',
  logic_ternary: 'camp_operators_blocks',
  math_arithmetic: 'camp_operators_blocks',
  math_single: 'camp_operators_blocks',
  math_round: 'camp_operators_blocks',
  math_modulo: 'camp_operators_blocks',
  math_random_int: 'camp_operators_blocks',
  text: 'camp_operators_blocks',
  text_join: 'camp_operators_blocks',
  text_length: 'camp_operators_blocks',
  text_isEmpty: 'camp_operators_blocks',
  text_indexOf: 'camp_operators_blocks',
  text_charAt: 'camp_operators_blocks',
  // Variables
  variables_get: 'camp_variables_blocks',
  variables_set: 'camp_variables_blocks',
  math_change: 'camp_variables_blocks',
};

export function recolorStockBlocks() {
  for (const [type, styleName] of Object.entries(STOCK_BLOCK_STYLES)) {
    const definition = Blockly.Blocks[type];
    if (!definition || typeof definition.init !== 'function' || definition.campRecoloredStyle) {
      continue;
    }
    const originalInit = definition.init;
    definition.init = function patchedInit(...args) {
      originalInit.apply(this, args);
      this.setStyle(styleName);
    };
    definition.campRecoloredStyle = styleName;
  }
}
