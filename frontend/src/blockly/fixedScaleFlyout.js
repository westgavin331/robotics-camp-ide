import * as Blockly from 'blockly/core';

// Blockly's default Flyout.getFlyoutScale() returns `this.targetWorkspace.scale`
// -- the flyout's own blocks are rendered at whatever zoom level the main
// workspace is currently at, by design ("By default, this matches the target
// workspace scale, but this can be overridden", per Blockly's own docs on
// that method). That's the wrong behaviour for a kids' IDE: the flyout is a
// picking/browsing tool, not part of the zoomable canvas, so its blocks
// should always render at one fixed, predictable size regardless of how far
// the kid has zoomed the workspace in or out.
class FixedScaleFlyout extends Blockly.VerticalFlyout {
  getFlyoutScale() {
    return 1;
  }
}

export { FixedScaleFlyout };
