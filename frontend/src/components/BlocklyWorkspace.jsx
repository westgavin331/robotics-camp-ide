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
import { FixedScaleFlyout } from '../blockly/fixedScaleFlyout.js';
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
  // Session-only (resets on reload): whether the currently-open category's
  // block flyout is hidden. The category list itself (Basic I/O, Sensors,
  // etc.) is never affected by this -- only the flyout of draggable blocks
  // that pops out next to it.
  const [flyoutCollapsed, setFlyoutCollapsed] = useState(false);
  // Toolbox's rendered width, and the bottom edge of its actual rendered
  // category rows (px, relative to the wrapper), measured once after
  // inject purely to dock the toggle arrow against the category list.
  // Blockly stretches the toolbox's own DOM element to 100% height
  // regardless of how many categories it holds, so positioning from the
  // *element's* bottom would land the arrow far below the visible list --
  // measuring the last category row directly is what actually hugs it.
  const [toolboxWidth, setToolboxWidth] = useState(0);
  const [categoryListBottom, setCategoryListBottom] = useState(0);

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
      // Documented plugin-injection slot (Blockly resolves the toolbox's
      // flyout class from options.plugins.flyoutsVerticalToolbox, falling
      // back to its own default) -- keeps the flyout's blocks a fixed size
      // regardless of workspace zoom (see fixedScaleFlyout.js).
      plugins: { flyoutsVerticalToolbox: FixedScaleFlyout },
    });
    workspaceRef.current = workspace;

    // A category's flyout always stays open across multiple block drags now
    // (no more per-session toggle) -- setAutoClose is a real, public Flyout
    // property/setter ("does the flyout automatically close when a block is
    // created"), not a custom workaround.
    workspace.getFlyout()?.setAutoClose(false);

    // Measured purely to dock the flyout-toggle arrow against the category
    // list (see App.css) -- the toolbox itself is never resized here.
    const toolboxEl = workspace.getToolbox()?.HtmlDiv;
    if (toolboxEl) {
      setToolboxWidth(toolboxEl.getBoundingClientRect().width);
      const rows = toolboxEl.querySelectorAll('.blocklyToolboxCategoryContainer');
      const lastRow = rows[rows.length - 1];
      if (lastRow && blocklyDivRef.current) {
        const wrapperTop = blocklyDivRef.current.getBoundingClientRect().top;
        setCategoryListBottom(lastRow.getBoundingClientRect().bottom - wrapperTop);
      }
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
      if (event.type === Blockly.Events.TOOLBOX_ITEM_SELECT) {
        // Clicking a category always opens its flyout (normal Blockly
        // behaviour, independent of the arrow button) -- resync so the
        // arrow's icon never claims "flyout hidden" when it's actually open.
        setFlyoutCollapsed(false);
        return;
      }
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

  // Shows/hides the currently-open category's flyout -- the toolbox (Basic
  // I/O, Sensors, etc.) is never touched here, only the flyout of draggable
  // blocks next to it.
  //  - collapse: just hide it (Flyout.hide()).
  //  - expand: re-shows the still-selected category's flyout with no fresh
  //    click needed. Selection itself (which category is "current") lives
  //    on the toolbox and is untouched by hide(), so
  //    toolbox.getSelectedItem() still points at whatever was open before
  //    collapsing; feeding its contents straight into flyout.show() is the
  //    same thing Toolbox.refreshSelection() does internally, just called
  //    directly rather than through that helper's extra guard conditions
  //    (isSelectable()/getContents().length) that add indirection without
  //    changing anything for the categories this toolbox actually has.
  function toggleFlyout() {
    const workspace = workspaceRef.current;
    const toolbox = workspace?.getToolbox();
    const flyout = toolbox?.getFlyout();
    if (!toolbox || !flyout) return;

    const collapsing = !flyoutCollapsed;
    setFlyoutCollapsed(collapsing);

    if (collapsing) {
      flyout.hide();
    } else {
      const selected = toolbox.getSelectedItem();
      if (selected) flyout.show(selected.getContents());
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
          className={`flyout-toggle${flyoutCollapsed ? ' is-collapsed' : ''}`}
          style={{ left: toolboxWidth / 2, top: categoryListBottom + 12 }}
          aria-expanded={!flyoutCollapsed}
          title={flyoutCollapsed ? 'Show blocks' : 'Hide blocks'}
          onClick={toggleFlyout}
        >
          <span aria-hidden="true">{flyoutCollapsed ? '▶' : '◀'}</span>
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
