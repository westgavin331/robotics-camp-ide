import { getCustomBlocks, paramGetterType } from './registry.js';

// registry.js's unregisterCustomBlock() only touches the data model -- this
// is the other half: finding/removing the actual workspace instances of a
// custom block before (findCallSitesElsewhere) and during (disposeAllInstances)
// its deletion.

// A call block sitting anywhere inside the definition's own "define" hat ->
// body chain (including nested inside expressions/other statements there,
// e.g. a recursive call, or this def calling a different custom block) isn't
// a call *site* in the sense that matters here -- disposing the hat already
// takes it down along with the rest of the body (see registry.js's dispose
// override). Only a call block found *outside* every hat's own descendants
// counts as "this block is actually being used elsewhere".
function ownBodyBlocks(workspace, def) {
  const body = new Set();
  for (const block of workspace.getAllBlocks(false)) {
    if (block.type !== def.defineType) continue;
    for (const descendant of block.getDescendants(false)) body.add(descendant);
  }
  return body;
}

// Human-readable "where" for a call site, for the confirmation dialog's
// blocked-deletion message -- named after the custom block whose own body
// it's nested in, or "in your program" for anywhere else (top-level, inside
// a loop/if, etc.), since a kid doesn't need (or want) a literal block-tree
// dump to understand roughly where to go looking.
function describeLocation(block) {
  const root = block.getRootBlock();
  const owningDef = getCustomBlocks().find((d) => d.defineType === root.type);
  return owningDef ? `inside the "${owningDef.name}" block` : 'in your program';
}

// Every place `def` is actually called from outside its own body -- deleting
// the definition would strand these (they'd reference a Blockly block type
// that no longer exists), so the caller should block deletion and show this
// list rather than delete out from under them.
export function findCallSitesElsewhere(workspace, def) {
  const body = ownBodyBlocks(workspace, def);
  return workspace
    .getAllBlocks(false)
    .filter((block) => block.type === def.callType && !body.has(block))
    .map((block) => ({ id: block.id, location: describeLocation(block) }));
}

// Disposes every trace of `def` from the workspace: its "define" hat(s) --
// which, per registry.js's dispose override, take their whole body down
// with them -- plus any parameter-getter reporters left anywhere else (a
// getter only makes sense while the block it belongs to still exists; one
// dragged out of the body and abandoned elsewhere is disposed too rather
// than left pointing at a definition that's gone). Callers must have already
// confirmed findCallSitesElsewhere() is empty; this does not check for or
// remove call sites itself.
export function disposeAllInstances(workspace, def) {
  for (const block of workspace.getAllBlocks(false)) {
    if (block.type === def.defineType && !block.disposed) block.dispose(false);
  }
  for (const p of def.params) {
    const getterType = paramGetterType(def.id, p.id);
    for (const block of workspace.getAllBlocks(false)) {
      if (block.type === getterType && !block.disposed) block.dispose(false);
    }
  }
}
