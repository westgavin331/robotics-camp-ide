import { useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly/core';
import * as En from 'blockly/msg/en';
import 'blockly/blocks';
import '../blockly/blocks/index.js';
import { toolbox } from '../blockly/toolbox.js';
import { scratchTheme } from '../blockly/theme.js';
import { registerVariablesCategory } from '../blockly/registerVariablesCategory.js';
import { registerMyBlocksCategory } from '../blockly/myBlocks/toolboxCategory.js';
import {
  registerCustomBlock,
  updateCustomBlock,
  getCustomBlocks,
  onEditBlockRequested,
} from '../blockly/myBlocks/registry.js';
import { applyEditCascade } from '../blockly/myBlocks/cascade.js';
import { generateArduinoCode } from '../blockly/generators/arduino/index.js';
import MakeBlockDialog from './MakeBlockDialog.jsx';

// Blockly.Msg is empty until a locale is loaded -- stock block definitions
// (controls_if, logic_compare, etc.) read their field labels from it, and
// Blockly.inject() crashes trying to resolve message references without one.
Blockly.setLocale(En);

// Event types that actually change the generated program. Selection,
// viewport pan/zoom, and click events fire constantly and don't affect code.
const REGENERATE_ON = new Set([
  Blockly.Events.BLOCK_CHANGE,
  Blockly.Events.BLOCK_CREATE,
  Blockly.Events.BLOCK_DELETE,
  Blockly.Events.BLOCK_MOVE,
  Blockly.Events.VAR_CREATE,
  Blockly.Events.VAR_DELETE,
  Blockly.Events.VAR_RENAME,
]);

export default function BlocklyWorkspace({ onCodeChange }) {
  const blocklyDivRef = useRef(null);
  const workspaceRef = useRef(null);
  // null = closed; {mode: 'create'} | {mode: 'edit', defId}
  const [dialogState, setDialogState] = useState(null);

  useEffect(() => {
    const workspace = Blockly.inject(blocklyDivRef.current, {
      toolbox,
      theme: scratchTheme,
      renderer: 'zelos',
      grid: { spacing: 20, length: 3, colour: '#dcdfe8', snap: true },
      zoom: { controls: true, wheel: true, startScale: 1 },
      trashcan: true,
    });
    workspaceRef.current = workspace;

    registerVariablesCategory(workspace);
    registerMyBlocksCategory(workspace, () => setDialogState({ mode: 'create' }));
    // Right-click "Edit Block" (registry.js's customContextMenu, on both the
    // "define" hat and "call" block types) has no per-instance React access,
    // so it calls back through this module-level bridge instead.
    onEditBlockRequested((defId) => setDialogState({ mode: 'edit', defId }));

    const regenerate = (event) => {
      if (!REGENERATE_ON.has(event.type)) return;
      onCodeChange(generateArduinoCode(workspace));
    };

    workspace.addChangeListener(regenerate);
    onCodeChange(generateArduinoCode(workspace));

    // Watches the container's own size, not just window resize -- toggling
    // "Hide Tools"/"View Code" or dragging the hardware panel's resize
    // handle changes how much space this element gets without the window
    // itself resizing, and Blockly needs svgResize() to recompute its
    // viewport/scrollbars whenever that happens. requestAnimationFrame
    // coalesces the many rapid-fire callbacks a drag produces into one
    // resize per frame.
    let rafId = null;
    const resizeObserver = new ResizeObserver(() => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        Blockly.svgResize(workspace);
      });
    });
    resizeObserver.observe(blocklyDivRef.current);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      workspace.dispose();
      workspaceRef.current = null;
      onEditBlockRequested(null);
    };
    // Runs once: workspace is injected imperatively and torn down on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Registers the new block's types (registry.js) then drops a fresh
  // "define" hat onto the canvas, same as Scratch/mBlock do right after
  // "Make a Block" -- the kid lands straight on the empty definition ready
  // to drag blocks into it, rather than having to go find it in the flyout.
  function handleCreate(spec) {
    const workspace = workspaceRef.current;
    const def = registerCustomBlock(spec);
    if (workspace) {
      const block = workspace.newBlock(def.defineType);
      block.initSvg();
      block.render();
      block.moveBy(480, 30 + (getCustomBlocks().length - 1) * 160);
      onCodeChange(generateArduinoCode(workspace));
    }
    setDialogState(null);
  }

  // Updates the def in place (registry.js), then reshapes every already-
  // placed instance -- define hat(s), call blocks, parameter getters -- to
  // match (cascade.js). Freshly-dragged flyout instances need no cascade;
  // they already read the live def at construction time.
  function handleEditSave(defId, spec) {
    const workspace = workspaceRef.current;
    const { def, diff } = updateCustomBlock(defId, spec);
    if (workspace) {
      applyEditCascade(workspace, def, diff);
      onCodeChange(generateArduinoCode(workspace));
    }
    setDialogState(null);
  }

  const editingDef =
    dialogState?.mode === 'edit' ? getCustomBlocks().find((d) => d.id === dialogState.defId) : null;

  return (
    <>
      <div ref={blocklyDivRef} className="blockly-workspace" />
      {dialogState?.mode === 'create' && <MakeBlockDialog onSubmit={handleCreate} onCancel={() => setDialogState(null)} />}
      {dialogState?.mode === 'edit' && editingDef && (
        <MakeBlockDialog
          initial={editingDef}
          onSubmit={(spec) => handleEditSave(dialogState.defId, spec)}
          onCancel={() => setDialogState(null)}
        />
      )}
    </>
  );
}
