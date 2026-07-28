import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import * as Blockly from 'blockly/core';
import * as En from 'blockly/msg/en';
import 'blockly/blocks';
import '../blockly/blocks/index.js';
import { toolbox } from '../blockly/toolbox.js';
import { scratchTheme } from '../blockly/theme.js';
// Side-effect only: registers the rounded colour-dot swatch category (see
// that file) in place of Blockly's default flat-bar category rendering.
import '../blockly/toolboxCategory.js';
import { registerVariablesCategory } from '../blockly/registerVariablesCategory.js';
import { registerMyBlocksCategory } from '../blockly/myBlocks/toolboxCategory.js';
import {
  registerCustomBlock,
  updateCustomBlock,
  getCustomBlocks,
  onEditBlockRequested,
  onDeleteBlockRequested,
  unregisterCustomBlock,
} from '../blockly/myBlocks/registry.js';
import { applyEditCascade } from '../blockly/myBlocks/cascade.js';
import { findCallSitesElsewhere, disposeAllInstances } from '../blockly/myBlocks/deleteBlock.js';
import { generateArduinoCode } from '../blockly/generators/arduino/index.js';
import { updateIrHoldWarnings } from '../blockly/warnings.js';
import {
  serializeProject,
  loadProject,
  saveAutosave,
  scheduleAutosaveWrite,
  loadAutosaveIfPresent,
} from '../blockly/projectIO.js';
import MakeBlockDialog from './MakeBlockDialog.jsx';
import DeleteBlockDialog from './DeleteBlockDialog.jsx';

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

// Exposes an imperative handle (getSnapshot/applyProject) rather than
// lifting the Blockly workspace instance itself up to App.jsx -- App owns
// the Save/Load *dialogs* (they live in the header, like every other
// top-level control), but actually reading/writing workspace state has to
// go through Blockly's own API, which only this component holds a
// reference to (workspaceRef).
const BlocklyWorkspace = forwardRef(function BlocklyWorkspace({ onCodeChange }, ref) {
  const blocklyDivRef = useRef(null);
  const workspaceRef = useRef(null);
  // null = closed; {mode: 'create'} | {mode: 'edit', defId} | {mode: 'delete', defId, usages}
  const [dialogState, setDialogState] = useState(null);
  // Session-only (resets on reload): whether the category sidebar is
  // slid out of view to reclaim width for the block canvas.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Toolbox's natural rendered width in px, measured once after inject --
  // needed (as state, so the toggle button's position re-renders once this
  // is known) so the collapse/expand animation below has an explicit pixel
  // value to transition to/from ("auto" doesn't transition).
  const [toolboxWidth, setToolboxWidth] = useState(0);

  // Shared by applyProject (a real Load) and newProject (New button) below --
  // both mean "replace the whole workspace", just with or without saved data
  // to restore. loadProject() itself handles the "no data" case (project ==
  // null): it still calls resetCustomBlocks(), so a fresh project never
  // carries over "My Blocks" definitions from whatever was open before.
  function replaceWorkspace(project) {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    loadProject(workspace, project);
    onCodeChange(generateArduinoCode(workspace));
    updateIrHoldWarnings(workspace);
    // Immediate, not debounced -- a kid who loads/clears a project and closes
    // the laptop before making any further edits should still find it that
    // way next time, not the state from before.
    saveAutosave(workspace);
  }

  useImperativeHandle(ref, () => ({
    getSnapshot: () => serializeProject(workspaceRef.current),
    applyProject: replaceWorkspace,
    newProject: () => replaceWorkspace(null),
    // Lets App.jsx's "New" button skip its confirmation dialog when there's
    // nothing on the canvas to lose -- getTopBlocks(false) is cheap (no
    // ordering work) since only presence/absence matters here.
    isWorkspaceEmpty: () => {
      const workspace = workspaceRef.current;
      return !workspace || workspace.getTopBlocks(false).length === 0;
    },
  }));

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

    // A category's flyout always stays open across multiple block drags now
    // (no more per-session toggle) -- setAutoClose is a real, public Flyout
    // property/setter ("does the flyout automatically close when a block is
    // created"), not a custom workaround.
    workspace.getFlyout()?.setAutoClose(false);

    // Locks in an explicit pixel width on the toolbox's own DOM node (its
    // natural width is otherwise content-driven/"auto", which CSS can't
    // transition) so toggleSidebar() below has a real px-to-px value to
    // animate between when collapsing/expanding.
    const toolboxEl = workspace.getToolbox()?.HtmlDiv;
    if (toolboxEl) {
      const width = toolboxEl.getBoundingClientRect().width;
      toolboxEl.style.width = `${width}px`;
      setToolboxWidth(width);
    }

    registerVariablesCategory(workspace);
    registerMyBlocksCategory(workspace, () => setDialogState({ mode: 'create' }));
    // Right-click "Edit Block" (registry.js's customContextMenu, on both the
    // "define" hat and "call" block types) has no per-instance React access,
    // so it calls back through this module-level bridge instead.
    onEditBlockRequested((defId) => setDialogState({ mode: 'edit', defId }));
    // Same bridge for "Delete Block" -- usages are computed once, right when
    // the dialog opens, rather than live in the dialog's render: the modal
    // overlay blocks workspace interaction while it's open, so the workspace
    // can't change out from under this snapshot before the kid acts on it.
    onDeleteBlockRequested((defId) => {
      const def = getCustomBlocks().find((d) => d.id === defId);
      const usages = def && workspace ? findCallSitesElsewhere(workspace, def) : [];
      setDialogState({ mode: 'delete', defId, usages });
    });

    // Same-device safety net: restore before wiring the change listener
    // below, so reconstructing the saved blocks doesn't itself get treated
    // as "new changes" needing yet another autosave write.
    const autosaved = loadAutosaveIfPresent();
    if (autosaved) {
      try {
        loadProject(workspace, autosaved);
      } catch (err) {
        // Corrupt/incompatible autosave data -- start from an empty
        // workspace rather than leave the app stuck on a crash.
        console.warn('Failed to restore autosaved project, starting fresh:', err);
      }
    }

    const regenerate = (event) => {
      if (!REGENERATE_ON.has(event.type)) return;
      onCodeChange(generateArduinoCode(workspace));
      updateIrHoldWarnings(workspace);
      scheduleAutosaveWrite(workspace);
    };

    workspace.addChangeListener(regenerate);
    onCodeChange(generateArduinoCode(workspace));
    updateIrHoldWarnings(workspace);

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
      onDeleteBlockRequested(null);
    };
    // Runs once: workspace is injected imperatively and torn down on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Milliseconds the CSS width/opacity transition on .blocklyToolbox takes
  // (see App.css) -- kept as one constant so the two stay in sync, since the
  // Blockly-side bookkeeping below (setVisible/resize) must only happen
  // after the slide finishes, not mid-animation.
  const SIDEBAR_TRANSITION_MS = 220;

  // Slides the category sidebar out of/into view. Blockly's own
  // Toolbox.setVisible() is a hard display:none/block toggle with no
  // transition, so the actual sliding is plain CSS on the toolbox's own DOM
  // node (toolboxEl.style.width, set to an explicit px value above); this
  // just choreographs that CSS change around Blockly's own visibility/layout
  // bookkeeping so neither fights the other:
  //  - collapse: close any open flyout (nothing to show against a hidden
  //    sidebar), start the CSS slide-out, then once it's finished tell
  //    Blockly the toolbox is actually hidden and let it recompute layout
  //    (workspace.resize()) so the canvas reclaims the freed width.
  //  - expand: tell Blockly the toolbox is visible again *first* (so the
  //    element is display:block, not display:none, before we try to
  //    transition it -- a transition can't play on a non-rendered element),
  //    force a layout flush so that starting state is actually registered,
  //    then start the CSS slide-in and resize again once it's finished.
  function toggleSidebar() {
    const workspace = workspaceRef.current;
    const toolbox = workspace?.getToolbox();
    const toolboxEl = toolbox?.HtmlDiv;
    if (!workspace || !toolbox || !toolboxEl) return;

    const collapsing = !sidebarCollapsed;
    setSidebarCollapsed(collapsing);

    if (collapsing) {
      toolbox.getFlyout()?.hide();
      toolboxEl.classList.add('is-collapsed');
      toolboxEl.style.width = '0px';
      window.setTimeout(() => {
        toolbox.setVisible(false);
        workspace.resize();
      }, SIDEBAR_TRANSITION_MS);
    } else {
      toolbox.setVisible(true);
      void toolboxEl.offsetWidth; // force layout flush -- see comment above
      toolboxEl.classList.remove('is-collapsed');
      toolboxEl.style.width = `${toolboxWidth}px`;
      window.setTimeout(() => {
        workspace.resize();
      }, SIDEBAR_TRANSITION_MS);
    }
  }

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
      updateIrHoldWarnings(workspace);
      saveAutosave(workspace);
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
      updateIrHoldWarnings(workspace);
      saveAutosave(workspace);
    }
    setDialogState(null);
  }

  // Disposes every workspace instance of this def (its "define" hat --
  // which per registry.js's dispose override takes its whole body down too
  // -- plus any stray parameter getters) then unregisters the def itself
  // (registry.js), so it's gone from the toolbox flyout as well. Only
  // reachable from the confirm phase of DeleteBlockDialog, which only
  // offers it when findCallSitesElsewhere() came back empty -- deletion
  // is never attempted while the block is still in use elsewhere.
  function handleDeleteConfirm(defId) {
    const workspace = workspaceRef.current;
    const def = getCustomBlocks().find((d) => d.id === defId);
    if (workspace && def) {
      disposeAllInstances(workspace, def);
      unregisterCustomBlock(defId);
      onCodeChange(generateArduinoCode(workspace));
      updateIrHoldWarnings(workspace);
      saveAutosave(workspace);
    }
    setDialogState(null);
  }

  // "Show me" on a blocked-deletion usage row -- scrolls/zooms to the call
  // site and selects it (a lasting highlight, unlike a momentary
  // highlightBlock flash) so a kid can actually find and remove it.
  function locateBlock(blockId) {
    const workspace = workspaceRef.current;
    const block = workspace?.getBlockById(blockId);
    if (!block) return;
    workspace.centerOnBlock(blockId);
    block.select();
  }

  const editingDef =
    dialogState?.mode === 'edit' ? getCustomBlocks().find((d) => d.id === dialogState.defId) : null;
  const deletingDef =
    dialogState?.mode === 'delete' ? getCustomBlocks().find((d) => d.id === dialogState.defId) : null;

  return (
    <>
      <div className="blockly-workspace-wrapper">
        <div ref={blocklyDivRef} className="blockly-workspace" />
        <button
          type="button"
          className={`sidebar-toggle${sidebarCollapsed ? ' is-collapsed' : ''}`}
          style={{ left: sidebarCollapsed ? 0 : toolboxWidth }}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? 'Show block categories' : 'Hide block categories'}
          onClick={toggleSidebar}
        >
          <span aria-hidden="true">{sidebarCollapsed ? '▶' : '◀'}</span>
        </button>
      </div>
      {dialogState?.mode === 'create' && <MakeBlockDialog onSubmit={handleCreate} onCancel={() => setDialogState(null)} />}
      {dialogState?.mode === 'edit' && editingDef && (
        <MakeBlockDialog
          initial={editingDef}
          onSubmit={(spec) => handleEditSave(dialogState.defId, spec)}
          onCancel={() => setDialogState(null)}
        />
      )}
      {dialogState?.mode === 'delete' && deletingDef && (
        <DeleteBlockDialog
          def={deletingDef}
          usages={dialogState.usages}
          onLocate={locateBlock}
          onConfirm={() => handleDeleteConfirm(dialogState.defId)}
          onCancel={() => setDialogState(null)}
        />
      )}
    </>
  );
});

export default BlocklyWorkspace;
