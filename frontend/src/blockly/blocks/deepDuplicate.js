import * as Blockly from 'blockly/core';

// Blockly's stock right-click "Duplicate" (registered under the fixed id
// "blockDuplicate" in Blockly.ContextMenuRegistry.registry, alongside our
// own "Edit Block" additions in myBlocks/registry.js -- see its module
// comment) only clones the clicked block plus whatever's nested inside it
// (an if/forever's body, a value plugged into an input): its callback calls
// `block.toCopyData()` with no argument, and BlockSvg#toCopyData's
// `addNextBlocks` parameter defaults to false. Scratch/mBlock duplicate the
// clicked block's entire downward stack too (everything chained via next-
// connections below it), while still leaving whatever it's nested *inside*
// (e.g. a surrounding forever loop) untouched -- toCopyData(true) already
// gives exactly that: it walks nested inputs and the next-chain outward
// from the clicked block, never upward/outward to its parent.
//
// There's no per-block-type hook for this (unlike "Edit Block", which is
// specific to our own My Blocks block types) -- the stock item is global,
// so this replaces it wholesale: same displayText/preconditionFn/scopeType/
// weight/shortcut as Blockly's own, only the callback differs.
const DUPLICATE_ID = 'blockDuplicate';

export function overrideDuplicateForStacks() {
  const registry = Blockly.ContextMenuRegistry.registry;
  const existing = registry.getItem(DUPLICATE_ID);
  // Defensive: if Blockly hasn't registered its default "Duplicate" yet (or
  // ever) for some reason, leave things alone rather than throw -- better a
  // missed override than a crash during block setup.
  if (!existing || existing.campDeepDuplicate) return;

  registry.unregister(DUPLICATE_ID);
  registry.register({
    ...existing,
    callback(scope) {
      const block = scope.block;
      if (!block) return;
      const copyData = block.toCopyData(true);
      if (copyData) Blockly.clipboard.paste(copyData, block.workspace);
    },
    campDeepDuplicate: true,
  });
}
