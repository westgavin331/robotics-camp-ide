import * as Blockly from 'blockly/core';
import { getCustomBlocks, restoreCustomBlocks, resetCustomBlocks } from './myBlocks/registry.js';

// A "project" bundles the two things needed to fully reconstruct an
// editable workspace: Blockly's own serialization of the blocks/variables,
// plus a snapshot of the "My Blocks" custom block registry (session-only
// JS state that Blockly's serialization knows nothing about -- see
// myBlocks/registry.js's module comment). Used identically by both layers:
// the localStorage autosave below, and the named backend save/load in
// api/projects.js.
export function serializeProject(workspace) {
  return {
    version: 1,
    workspace: Blockly.serialization.workspaces.save(workspace) || {},
    customBlocks: getCustomBlocks().map((def) => ({
      id: def.id,
      name: def.name,
      cName: def.cName,
      nextParamSeq: def.nextParamSeq,
      params: def.params.map((p) => ({ id: p.id, name: p.name, type: p.type, cName: p.cName })),
    })),
  };
}

// Replaces the entire current workspace with `project` -- custom block
// types are restored *before* the workspace state that references them is
// loaded (see registry.js's restoreCustomBlocks for why the order matters),
// and resetCustomBlocks() first ensures this is a clean replace, not a
// merge with whatever custom blocks existed before this call.
export function loadProject(workspace, project) {
  resetCustomBlocks();
  restoreCustomBlocks(project?.customBlocks || []);
  workspace.clear();
  if (project?.workspace && Object.keys(project.workspace).length > 0) {
    Blockly.serialization.workspaces.load(project.workspace, workspace);
  }
}

// --- Layer 1: same-device autosave (localStorage) --------------------------
//
// Safety net for an accidental reload or closing/reopening the browser on
// the same machine -- not the cross-device save (see api/projects.js for
// that). Debounced so a drag (which fires many BLOCK_MOVE events) doesn't
// hammer localStorage; a handful of explicit call sites (creating/editing a
// custom block, loading a named project) also call saveAutosave() directly
// and immediately, since those aren't part of the regular change-listener
// stream that debouncing is meant to smooth out.
const AUTOSAVE_KEY = 'roboticsCampAutosave';
const AUTOSAVE_DEBOUNCE_MS = 800;
let autosaveTimer = null;

export function saveAutosave(workspace) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(serializeProject(workspace)));
  } catch (err) {
    // A safety net that fails shouldn't interrupt a kid's session -- private
    // browsing / a full localStorage quota are the realistic causes here.
    console.warn('Autosave failed:', err);
  }
}

export function scheduleAutosaveWrite(workspace) {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    saveAutosave(workspace);
  }, AUTOSAVE_DEBOUNCE_MS);
}

// Returns the autosaved project, or null if there isn't one / it's corrupt
// (e.g. an old, incompatible schema) -- either way, the caller should just
// start from an empty workspace rather than surface this to a kid.
export function loadAutosaveIfPresent() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Autosaved project was corrupt, starting fresh:', err);
    return null;
  }
}
