import * as Blockly from 'blockly/core';

// Two flyout-only tweaks, both plain instance properties/methods Blockly's
// own VerticalFlyout already exposes for exactly this kind of override --
// nothing here reaches into private state.
//
// 1. getFlyoutScale(): defaults to `this.targetWorkspace.scale` -- the
//    flyout's own blocks are rendered at whatever zoom level the main
//    workspace is currently at, by design ("By default, this matches the
//    target workspace scale, but this can be overridden", per Blockly's own
//    docs on that method). That's the wrong behaviour for a kids' IDE: the
//    flyout is a picking/browsing tool, not part of the zoomable canvas, so
//    its blocks should always render at one fixed, predictable size
//    regardless of how far the kid has zoomed the workspace in or out.
//
// 2. GAP_Y (constructor): the vertical space between consecutive flyout
//    blocks, see below.
//
// Note: the flyout's *width* is already computed from its widest block's
// content (Flyout.reflowInternal_, native Blockly behaviour) -- it isn't
// overridden here. A flyout for a category with only one or two narrow
// blocks looking like "a big empty panel" was a colour-contrast issue
// (flyoutBackgroundColour and workspaceBackgroundColour were nearly
// identical in theme.js, so the correctly-sized flyout had no visible edge
// against the canvas behind it), fixed there instead of here.
class FixedScaleFlyout extends Blockly.VerticalFlyout {
  constructor(workspaceOptions) {
    super(workspaceOptions);
    // GAP_Y is the vertical space Blockly puts between consecutive flyout
    // blocks -- a plain instance property (set in the base Flyout
    // constructor as 3x its corner radius, 24px by default), reassignable
    // here same as any other field. A modest cut, not a drastic one: this
    // only closes up the gaps *between* blocks so more fit without
    // scrolling -- each block's own rendered size (and so its tap target)
    // is completely untouched.
    this.GAP_Y = 12;
  }

  getFlyoutScale() {
    return 1;
  }
}

export { FixedScaleFlyout };
