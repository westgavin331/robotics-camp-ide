import { PARAM_TYPE_INFO, paramGetterType, layoutDefineBlock, appendCallParamInput } from './registry.js';

// registry.js's updateCustomBlock() only updates the data model (`def`) --
// it can't reach into the workspace itself. This is the other half: given
// the diff that call returned, find every already-placed instance of this
// custom block (define hat, call blocks, parameter getters -- anywhere in
// the workspace, not just top-level, since calls/getters are routinely
// nested inside expressions/bodies) and reshape each one to match, without
// disturbing anything that didn't change.
//
// Freshly-dragged instances from the "My Blocks" flyout need none of this:
// the flyout's dynamic category (toolboxCategory.js) rebuilds its contents
// from the live `def` every time it's opened, and each block's own init()
// (registry.js) reads `def` live too, so a new drag always reflects the
// current signature automatically.
export function applyEditCascade(workspace, def, diff) {
  const allBlocks = workspace.getAllBlocks(false);

  for (const block of allBlocks) {
    if (block.type === def.defineType) {
      layoutDefineBlock(block, def);
    }
  }

  for (const block of allBlocks) {
    if (block.type !== def.callType) continue;
    updateCallBlock(block, def, diff);
  }

  for (const p of def.params) {
    const getterType = paramGetterType(def.id, p.id);
    for (const block of allBlocks) {
      if (block.type !== getterType) continue;
      if (block.getField('LABEL')) block.setFieldValue(p.name, 'LABEL');
      if (diff.typeChangedParamIds.has(p.id)) {
        // A getter's connection check is fixed to its param's type at
        // registration time -- if the type changed, whatever it was
        // plugged into may no longer accept it. Simplest safe move:
        // update the check for future connections and unplug it now,
        // rather than risk leaving an invalid connection in place.
        block.outputConnection.setCheck([PARAM_TYPE_INFO[p.type].check]);
        block.outputConnection.disconnect();
      }
    }
  }

  // Removed params: per the "auto-strip" choice (see the summary given to
  // the user), any reporter block reading a now-gone parameter is disposed
  // outright rather than left dangling with a stale/invalid reference.
  for (const pid of diff.removedParamIds) {
    const getterType = paramGetterType(def.id, pid);
    for (const block of allBlocks) {
      if (block.type === getterType) block.dispose(false);
    }
  }
}

function updateCallBlock(block, def, diff) {
  if (block.getField('NAME')) block.setFieldValue(def.name, 'NAME');

  // Sockets that no longer correspond to any current parameter (removed, or
  // retyped -- see registry.js's applyDefinitionUpdate for why a type
  // change is treated the same as remove+add) are torn down first. Removing
  // a value input disconnects whatever was plugged into it -- a kid's own
  // block is left floating in the workspace rather than deleted; the
  // default shadow that's normally there instead is simply discarded, same
  // as Blockly already does for any orphaned shadow.
  for (const pid of [...diff.removedParamIds, ...diff.typeChangedParamIds]) {
    if (block.getInput(`ARG_${pid}`)) block.removeInput(`ARG_${pid}`);
  }

  // Parameters that kept both their identity and type: relabel only: the
  // whole point is that whatever's plugged into these sockets is left
  // completely untouched.
  for (const p of def.params) {
    if (diff.keptParamIds.has(p.id) && !diff.typeChangedParamIds.has(p.id) && block.getField(`LABEL_${p.id}`)) {
      block.setFieldValue(p.name, `LABEL_${p.id}`);
    }
  }

  // New sockets (brand new params, or retyped ones rebuilt fresh above):
  // appended at the end and given the same default shadow a toolbox drag
  // would have, so the block never looks broken/empty.
  for (const p of def.params) {
    const needsFreshInput = diff.addedParamIds.has(p.id) || diff.typeChangedParamIds.has(p.id);
    if (needsFreshInput && !block.getInput(`ARG_${p.id}`)) {
      const input = appendCallParamInput(block, p);
      connectDefaultShadow(block.workspace, input, p.type);
    }
  }

  if (block.rendered) block.render();
}

function connectDefaultShadow(workspace, input, type) {
  const info = PARAM_TYPE_INFO[type];
  const shadowBlock = workspace.newBlock(info.shadow.type);
  shadowBlock.setShadow(true);
  for (const [fieldName, value] of Object.entries(info.shadow.fields || {})) {
    shadowBlock.setFieldValue(String(value), fieldName);
  }
  if (workspace.rendered) {
    shadowBlock.initSvg();
    shadowBlock.render();
  }
  input.connection.connect(shadowBlock.outputConnection);
}
