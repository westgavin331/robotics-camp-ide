// Workspace-level warnings that don't affect codegen, only what's shown on
// the block itself. First (only, so far) case: "if IR signal received"
// shares a loop with a block that blocks execution (a wait, or a tone that
// plays-to-completion via its own delay -- see sound.js). NEC repeat frames
// arrive roughly every 110ms while a remote button is held; IrReceiver.decode()
// has to be called again inside that window to catch each one, and a
// blocking block sitting in the same loop stalls the whole loop() body,
// IR check included, for as long as it runs.

const LOOP_BLOCK_TYPES = new Set([
  'controls_forever',
  'controls_repeat_ext',
  'controls_whileUntil',
  'controls_for',
]);

const BLOCKING_BLOCK_TYPES = new Set(['io_wait', 'sound_play_note']);

const IR_HOLD_WARNING =
  'A wait or sound block in this loop might cause the remote to miss button holds.';

// Blockly keeps warnings on a block in an id-keyed map, and clearing with no
// id at all means "remove every warning on this block", not just this one --
// which would silently wipe the outdated-block warning projectIO.js puts on
// a repaired block (sound_play_note is both in BLOCKING_BLOCK_TYPES below
// and a block whose pin can need repairing). Keying this warning keeps the
// two independent.
const IR_HOLD_WARNING_ID = 'irHold';

// Every loop-like block instance that (indirectly) contains `block`, i.e.
// would have to finish its current iteration before `block` runs again.
// getSurroundParent() is what makes this skip over statement-chain siblings
// and only report actual containing blocks (a block's DO/ELSE/etc. input).
function getLoopAncestors(block) {
  const ancestors = new Set();
  let parent = block.getSurroundParent();
  while (parent) {
    if (LOOP_BLOCK_TYPES.has(parent.type)) ancestors.add(parent);
    parent = parent.getSurroundParent();
  }
  return ancestors;
}

function shareLoopAncestor(setA, setB) {
  for (const block of setA) {
    if (setB.has(block)) return true;
  }
  return false;
}

// Called on every workspace change (see BlocklyWorkspace.jsx). Cheap enough
// to run unconditionally -- typical workspaces have a handful of blocks --
// so this just re-evaluates from scratch rather than tracking a diff.
export function updateIrHoldWarnings(workspace) {
  const allBlocks = workspace.getAllBlocks(false);
  const irBlocks = allBlocks.filter((block) => block.type === 'ir_if_received');
  const blockingBlocks = allBlocks.filter((block) => BLOCKING_BLOCK_TYPES.has(block.type));

  // Clear first: a block that had the warning last time but no longer
  // qualifies (e.g. the wait block got dragged out of the loop) needs it
  // removed, not just left stale.
  for (const block of irBlocks) block.setWarningText(null, IR_HOLD_WARNING_ID);
  for (const block of blockingBlocks) block.setWarningText(null, IR_HOLD_WARNING_ID);

  if (irBlocks.length === 0 || blockingBlocks.length === 0) return;

  for (const irBlock of irBlocks) {
    const irLoops = getLoopAncestors(irBlock);
    if (irLoops.size === 0) continue;

    for (const blockingBlock of blockingBlocks) {
      const blockingLoops = getLoopAncestors(blockingBlock);
      if (!shareLoopAncestor(irLoops, blockingLoops)) continue;

      irBlock.setWarningText(IR_HOLD_WARNING, IR_HOLD_WARNING_ID);
      blockingBlock.setWarningText(IR_HOLD_WARNING, IR_HOLD_WARNING_ID);
    }
  }
}
