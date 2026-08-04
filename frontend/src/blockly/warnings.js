// Workspace-level warnings that don't affect codegen, only what's shown on
// the block itself. Two cases so far, both surfaced through
// updateWorkspaceWarnings() at the bottom of this file:
//
//   1. An IR block that polls the receiver ("if IR signal received", or
//      "held IR command", whose decode() is hoisted to the top of loop() --
//      see generators/arduino/ir.js) shares a loop with a block that blocks
//      execution (a wait, or a tone that plays-to-completion via its own
//      delay -- see sound.js). NEC repeat frames arrive roughly every 110ms
//      while a remote button is held; IrReceiver.decode() has to be called
//      again inside that window to catch each one, and a blocking block
//      sitting in the same loop stalls the whole loop() body, IR check
//      included, for as long as it runs.
//
//      This matters more for "held IR command" than it looks: its idle
//      timeout is a wall-clock 150ms, so a wait long enough to miss a repeat
//      frame doesn't just delay the read, it makes the command read back as
//      0 ("released") while the button is still physically held.
//
//   2. The workspace's lists have been sized past what an Uno can spare.
//
import { LIST_ITEM_BYTES, LIST_LENGTH_BYTES, DEFAULT_LIST_SIZE } from './blocks/lists.js';

const LOOP_BLOCK_TYPES = new Set([
  'controls_forever',
  'controls_repeat_ext',
  'controls_whileUntil',
  'controls_for',
]);

const BLOCKING_BLOCK_TYPES = new Set(['io_wait', 'sound_play_note']);

// Blocks whose generated code polls the IR receiver, and so cares how often
// loop() comes back around. `ir_held_command` is a reporter rather than a
// statement, and the decode() it registers actually runs at the top of
// loop() rather than at the block's own position -- so strictly, ANY
// blocking block in the same loop() body delays it, not only one sharing a
// loop ancestor with wherever the reporter happens to be plugged in. The
// shared-ancestor test below is used for both anyway: it catches every
// realistic arrangement (the reporter is virtually always read inside the
// same forever loop it's polled from), and staying with one rule keeps this
// from claiming a precision it can't act on.
const IR_POLLING_BLOCK_TYPES = new Set(['ir_if_received', 'ir_held_command']);

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
function updateIrHoldWarnings(workspace) {
  const allBlocks = workspace.getAllBlocks(false);
  const irBlocks = allBlocks.filter((block) => IR_POLLING_BLOCK_TYPES.has(block.type));
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

// --- List memory budget ----------------------------------------------------
//
// Every list is a fixed-size global array, sized at compile time (see
// blocks/lists.js), which is exactly what makes this checkable here: the
// cost of a workspace's lists is fully known before anything is uploaded.
//
// The Uno has 2048 bytes of SRAM, and a robot sketch has already spent a lot
// of it before a single list exists -- roughly 200 bytes for Serial's two
// 64-byte buffers, 250-450 for IRremote's raw-tick buffer, ~50 for Servo, 4
// per workspace variable -- and the stack needs a few hundred bytes of
// headroom it can grow into. That leaves on the order of 900-1100 bytes
// genuinely spare, so 600 is a threshold a kid can cross by making three
// 50-item lists without doing anything obviously unreasonable, while still
// leaving real room underneath it.
//
// Deliberately a warning and not a hard cap: running out of RAM depends on
// which libraries a particular sketch pulls in, so a fixed limit would be
// wrong in both directions. The point is to turn "the robot started acting
// strangely" into something visible on the workspace beforehand.
const LIST_MEMORY_BUDGET_BYTES = 600;
const LIST_MEMORY_WARNING_ID = 'listMemory';

const LIST_BLOCK_TYPES = new Set([
  'list_create',
  'list_add',
  'list_delete',
  'list_delete_all',
  'list_insert',
  'list_replace',
  'list_item',
  'list_length',
  'list_contains',
]);

// Mirrors what the generator actually emits, which is the only number worth
// warning about: one entry per list *referenced anywhere*, at the size its
// list_create block gives it, or the default size if it has no create block
// (a list used without being created still compiles, and still costs RAM).
function measureLists(listBlocks) {
  const lists = new Map();
  for (const block of listBlocks) {
    const varId = block.getFieldValue('LIST');
    if (!varId) continue;
    if (!lists.has(varId)) {
      lists.set(varId, { size: DEFAULT_LIST_SIZE, anchor: block });
    }
    const entry = lists.get(varId);
    if (block.type === 'list_create') {
      entry.size = Number(block.getFieldValue('SIZE'));
      // Prefer the create block as the place to hang the warning -- it's the
      // one with the size dropdown, i.e. the block a kid can actually act on.
      entry.anchor = block;
    }
  }
  let totalBytes = 0;
  for (const entry of lists.values()) {
    totalBytes += entry.size * LIST_ITEM_BYTES + LIST_LENGTH_BYTES;
  }
  return { lists, totalBytes };
}

function updateListMemoryWarnings(workspace) {
  const listBlocks = workspace.getAllBlocks(false).filter((block) => LIST_BLOCK_TYPES.has(block.type));
  // Cleared unconditionally first, for the same reason as the IR warning
  // above: a workspace that has just dropped below the budget needs the
  // warning taken off, not left stale.
  for (const block of listBlocks) block.setWarningText(null, LIST_MEMORY_WARNING_ID);
  if (listBlocks.length === 0) return;

  const { lists, totalBytes } = measureLists(listBlocks);
  if (totalBytes <= LIST_MEMORY_BUDGET_BYTES) return;

  const message =
    `These lists need about ${totalBytes} bytes of the Arduino's 2048 bytes of memory. ` +
    'Past roughly 600 there may not be enough left for everything else, and the robot ' +
    'can start behaving strangely. Try smaller list sizes, or fewer lists.';
  for (const entry of lists.values()) {
    entry.anchor.setWarningText(message, LIST_MEMORY_WARNING_ID);
  }
}

// Single entry point for everything in this file -- callers (see
// BlocklyWorkspace.jsx, which re-runs this on every workspace change) don't
// need to know which individual checks exist.
export function updateWorkspaceWarnings(workspace) {
  updateIrHoldWarnings(workspace);
  updateListMemoryWarnings(workspace);
}
