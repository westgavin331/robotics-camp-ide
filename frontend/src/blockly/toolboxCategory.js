import * as Blockly from 'blockly/core';

// Blockly's default category "swatch" (ToolboxCategory.prototype.addColourBorder_)
// is a flat 8px coloured strip along the row's edge. This subclass swaps it for
// a small rounded colour dot next to the label instead -- registered as an
// override for the stock 'category' toolbox item, so every category defined in
// toolbox.js (including the dynamic "Variables"/"My Blocks" ones) picks it up
// automatically without any per-category change.
class SwatchToolboxCategory extends Blockly.ToolboxCategory {
  createIconDom_() {
    const icon = document.createElement('span');
    icon.classList.add('category-swatch');
    if (this.colour_) icon.style.backgroundColor = this.colour_;
    return icon;
  }

  // No-op: replaces Blockly's default coloured left border with the round
  // swatch dot from createIconDom_ above.
  addColourBorder_() {}

  refreshTheme() {
    super.refreshTheme();
    if (this.iconDom_) this.iconDom_.style.backgroundColor = this.colour_;
  }
}

Blockly.registry.register(
  Blockly.registry.Type.TOOLBOX_ITEM,
  Blockly.ToolboxCategory.registrationName,
  SwatchToolboxCategory,
  true, // allow overriding the built-in 'category' registration
);
