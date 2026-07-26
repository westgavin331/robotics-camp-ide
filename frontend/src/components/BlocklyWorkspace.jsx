import { useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly/core';
import * as En from 'blockly/msg/en';
import 'blockly/blocks';
import '../blockly/blocks/index.js';
import { toolbox } from '../blockly/toolbox.js';
import { scratchTheme } from '../blockly/theme.js';
import { registerVariablesCategory } from '../blockly/registerVariablesCategory.js';
import { registerMyBlocksCategory } from '../blockly/myBlocks/toolboxCategory.js';
import { registerCustomBlock, getCustomBlocks } from '../blockly/myBlocks/registry.js';
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
  const [showMakeBlockDialog, setShowMakeBlockDialog] = useState(false);

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
    registerMyBlocksCategory(workspace, () => setShowMakeBlockDialog(true));

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
    };
    // Runs once: workspace is injected imperatively and torn down on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Registers the new block's types (registry.js) then drops a fresh
  // "define" hat onto the canvas, same as Scratch/mBlock do right after
  // "Make a Block" -- the kid lands straight on the empty definition ready
  // to drag blocks into it, rather than having to go find it in the flyout.
  function handleCreateBlock(spec) {
    const workspace = workspaceRef.current;
    const def = registerCustomBlock(spec);
    if (workspace) {
      const block = workspace.newBlock(def.defineType);
      block.initSvg();
      block.render();
      block.moveBy(480, 30 + (getCustomBlocks().length - 1) * 160);
      // Belt-and-suspenders: newBlock() should already fire a BLOCK_CREATE
      // event the regenerate() listener above reacts to, but the new
      // function needs to show up in View Code immediately regardless of
      // that internal Blockly behaviour, not on the next unrelated edit.
      onCodeChange(generateArduinoCode(workspace));
    }
    setShowMakeBlockDialog(false);
  }

  return (
    <>
      <div ref={blocklyDivRef} className="blockly-workspace" />
      {showMakeBlockDialog && (
        <MakeBlockDialog onCreate={handleCreateBlock} onCancel={() => setShowMakeBlockDialog(false)} />
      )}
    </>
  );
}
