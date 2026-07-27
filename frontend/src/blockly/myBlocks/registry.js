import * as Blockly from 'blockly/core';
import { arduinoGenerator, ARDUINO_RESERVED_WORDS } from '../generators/arduino/core.js';

// "My Blocks" (spec-adjacent addition, not from section 2's table -- Scratch/
// mBlock's custom block system). Unlike everything else in this app, block
// *types* here don't exist until a kid creates them via the "Make a Block"
// dialog, so there's no static blocks/*.js file to define them in -- this
// module builds and registers a matching pair of Blockly block types (a
// "define" hat + a "call" block) plus one reporter block per parameter, for
// every custom block a kid creates.
//
// This registry lives in JS module state, not in the workspace's own
// Blockly.serialization output -- a saved/autosaved project's workspace
// JSON can reference block *types* like "myblock_define_cb3" that don't
// exist yet in a fresh page load or a different device's session.
// restoreCustomBlocks()/resetCustomBlocks() below (used by
// ../projectIO.js) are what make a save portable: they replay this
// registry's state -- same ids, same generated type strings -- *before*
// Blockly.serialization.workspaces.load() ever touches the saved blocks, so
// every reference resolves.
//
// Editing support (updateCustomBlock) is why "define"/"call" are built
// imperatively (Blockly.Blocks[type] = {init(){...}}) instead of the static
// Blockly.defineBlocksWithJsonArray JSON used for every other block in this
// app: re-registering a JSON block's definition only affects instances
// created *after* the change, not ones already sitting in the workspace --
// there's no hook to reshape an existing instance. Every custom block's
// `def` record below is a single mutable object; init() and every generator
// closure read `def.name`/`def.params`/`def.cName` live rather than
// capturing a snapshot, and layoutDefineBlock/appendCallParamInput (used
// both at init() time and by myBlocks/cascade.js during an edit) directly
// call the block-instance-level appendValueInput/removeInput/setFieldValue
// APIs Blockly exposes on any already-constructed block -- the same
// mechanism Blockly's own mutators use internally, just driven by our
// dialog instead of a mutator popup.

// Per-parameter-type metadata: the Blockly connection `check` other blocks
// must match to plug in, the Arduino/C++ type used for the generated
// function's parameter list, the fallback literal when a call site leaves an
// input empty, and the default shadow block dropped into the call site (same
// "always something to click and type, or a sensible default" convention
// used by every other block's toolbox entry in toolbox.js).
export const PARAM_TYPE_INFO = {
  number: {
    check: 'Number',
    cType: 'float',
    defaultCode: '0',
    shadow: { type: 'math_number', fields: { NUM: 0 } },
  },
  text: {
    check: 'String',
    cType: 'String',
    defaultCode: '""',
    // shadow_text (blocks/textShadow.js), not stock `text` -- see its own
    // comment for why a call-site default shouldn't carry the stock text
    // block's quote-icon decoration.
    shadow: { type: 'shadow_text', fields: { TEXT: '' } },
  },
  boolean: {
    check: 'Boolean',
    cType: 'bool',
    defaultCode: 'false',
    shadow: { type: 'logic_boolean', fields: { BOOL: 'TRUE' } },
  },
};

let counter = 0;
// Seeded with Arduino/C++ keywords so a custom block can never be named
// e.g. "loop" or "delay". Every generated function name is added here too
// (see uniqueIdentifier below), so two custom blocks can never collide with
// each other either -- compared lower-cased since C++ is case-sensitive but
// "Jump" and "jump" would still confuse a kid. Recomputed (and re-reserved)
// on every rename too -- see applyDefinitionUpdate -- so a renamed block's
// old identifier is freed back into this set rather than staying reserved
// forever.
const usedIdentifiers = new Set(ARDUINO_RESERVED_WORDS.map((w) => w.toLowerCase()));
const customBlocks = [];

// Bridges Blockly's block-instance-scoped customContextMenu (registered
// once per block type, no per-instance React access) back to BlocklyWorkspace
// -- same idea as workspace.registerButtonCallback for "Make a Block", but
// customContextMenu has no built-in named-callback indirection, so this is a
// simple module-level slot instead. There's only ever one workspace in this
// app, so a singleton is fine (see onEditBlockRequested below).
let editRequestHandler = null;

export function onEditBlockRequested(handler) {
  editRequestHandler = handler;
}

export function getCustomBlocks() {
  return customBlocks;
}

function sanitizeBase(raw) {
  let s = String(raw || '')
    .trim()
    .replace(/[^A-Za-z0-9_]/g, '_');
  if (!/^[A-Za-z_]/.test(s)) s = `_${s}`;
  return s || '_block';
}

// Turns a kid-chosen name into a valid, collision-free C++ identifier,
// reserving it so nothing else (another custom block, or a variable the kid
// creates later -- see reserveIdentifier in core.js) can reuse it.
function uniqueIdentifier(raw) {
  const base = sanitizeBase(raw);
  let candidate = base;
  let n = 2;
  while (usedIdentifiers.has(candidate.toLowerCase())) {
    candidate = `${base}_${n}`;
    n += 1;
  }
  usedIdentifiers.add(candidate.toLowerCase());
  return candidate;
}

export function paramGetterType(defId, paramId) {
  return `myblock_param_${defId}_${paramId}`;
}

// Rebuilds the "define" hat's label row (the "define <name> <param> <param>"
// text) from the current def.name/def.params. Only touches the row of
// fields -- the body chain hangs off the block's separate nextConnection,
// untouched by input/field manipulation, so this is safe to call on an
// already-built instance with blocks connected underneath it (see
// myBlocks/cascade.js, which calls this on every existing "define" instance
// after an edit). No values are ever plugged into these fields, so there's
// nothing to preserve -- a full tear-down + rebuild each time is simplest.
export function layoutDefineBlock(block, def) {
  if (block.getInput('MAIN')) block.removeInput('MAIN');
  const input = block.appendDummyInput('MAIN');
  input.appendField('define');
  input.appendField(new Blockly.FieldLabel(def.name), 'NAME');
  for (const p of def.params) {
    input.appendField(new Blockly.FieldLabel(p.name), `LABEL_${p.id}`);
  }
  if (block.rendered) block.render();
}

// Appends one parameter's value-input socket to a "call" block instance --
// used both by the call block's own init() (building the full initial set)
// and by myBlocks/cascade.js (adding just the new/changed ones to an
// existing instance without touching sockets that didn't change).
export function appendCallParamInput(block, p) {
  const input = block.appendValueInput(`ARG_${p.id}`).setCheck(PARAM_TYPE_INFO[p.type].check);
  input.appendField(new Blockly.FieldLabel(p.name), `LABEL_${p.id}`);
  return input;
}

// (Re-)registers one parameter's reporter block type + generator. Called for
// every param on every create/edit -- cheap, and for a *kept* param this is
// what makes a freshly-dragged-from-the-flyout getter (after a rename) show
// the current name; already-*placed* getter instances are relabelled
// directly by myBlocks/cascade.js instead, since re-registering a type only
// affects instances built after the change (see the module comment above).
function registerGetterType(def, p) {
  const getterType = paramGetterType(def.id, p.id);
  Blockly.defineBlocksWithJsonArray([
    {
      type: getterType,
      message0: '%1',
      args0: [{ type: 'field_label', name: 'LABEL', text: p.name }],
      output: PARAM_TYPE_INFO[p.type].check,
      style: 'camp_myblocks_blocks',
      tooltip: `The "${def.name}" block's "${p.name}" input.`,
    },
  ]);
  // Closes over the param object itself (not a copy of its cName) -- kept
  // params are mutated in place on edit (see applyDefinitionUpdate), so this
  // stays correct after a rename with no need to ever reassign it.
  arduinoGenerator.forBlock[getterType] = function () {
    return [p.cName, arduinoGenerator.ORDER_ATOMIC];
  };
}

function editBlockMenuItem(def) {
  return {
    text: 'Edit Block',
    enabled: true,
    callback: () => editRequestHandler && editRequestHandler(def.id),
  };
}

// Builds the imperative "define" and "call" Blockly block types for a brand
// new custom block record and wires up their Arduino generators. Both
// generators close over `def` itself and read `def.name`/`def.params`/
// `def.cName` live at generation time, not a snapshot -- so an edit
// (applyDefinitionUpdate, which mutates `def` in place) never requires
// re-registering them.
function registerDefineAndCallTypes(def) {
  Blockly.Blocks[def.defineType] = {
    init() {
      this.setStyle('camp_myblocks_hat_blocks');
      // Hat shape (see forever.js/hat.js for the same pattern): nothing
      // connects above, blocks defining the body stack directly below,
      // rather than nesting inside a C-shape.
      this.setNextStatement(true, null);
      this.setTooltip(() => `Defines what the "${def.name}" block does. Drag blocks in below to build it.`);
      layoutDefineBlock(this, def);
    },
    customContextMenu(options) {
      options.unshift(editBlockMenuItem(def));
    },
  };

  Blockly.Blocks[def.callType] = {
    init() {
      this.setStyle('camp_myblocks_blocks');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip(() => `Runs the "${def.name}" block you made.`);
      this.appendDummyInput('MAIN').appendField(new Blockly.FieldLabel(def.name), 'NAME');
      for (const p of def.params) {
        appendCallParamInput(this, p);
      }
    },
    customContextMenu(options) {
      options.unshift(editBlockMenuItem(def));
    },
  };

  // Not reached via the normal blockToCode/statementToCode chain-walk --
  // this hat is a top-level block with no previous connection, a sibling of
  // arduino_start rather than part of its chain. generateArduinoCode()
  // (core.js) calls this directly for every myblock_define_* top block it
  // finds, before walking arduino_start's own chain.
  arduinoGenerator.forBlock[def.defineType] = function (block, gen) {
    let body = '';
    let child = block.getNextBlock();
    while (child) {
      body += gen.blockToCode(child, true);
      child = child.getNextBlock();
    }
    const bodyIndented = body ? gen.prefixLines(body, gen.INDENT) : '';
    const paramList = def.params.map((p) => `${PARAM_TYPE_INFO[p.type].cType} ${p.cName}`).join(', ');
    gen.functions_[`fn_${def.id}`] = `void ${def.cName}(${paramList}) {\n${bodyIndented}}`;
    return '';
  };

  arduinoGenerator.forBlock[def.callType] = function (block, gen) {
    const args = def.params.map((p) => {
      const info = PARAM_TYPE_INFO[p.type];
      return gen.valueToCode(block, `ARG_${p.id}`, gen.ORDER_ATOMIC) || info.defaultCode;
    });
    return `${def.cName}(${args.join(', ')});\n`;
  };
}

// Applies a name/param-list change to `def` in place (shared by both
// creation -- where every param is "new" -- and editing). `params` entries
// are `{ origId, name, type }`; `origId` is an existing param's id when this
// row represents that same param (possibly renamed/retyped), or null/absent
// for a brand new param. Returns a diff describing what changed, which
// myBlocks/cascade.js uses to update already-placed workspace instances:
//   - keptParamIds: same identity as before (relabel only, connections untouched)
//   - typeChangedParamIds: same identity, different type (old socket/getter
//     usage can't safely carry over -- treated like remove-then-add)
//   - addedParamIds: brand new identity
//   - removedParamIds: existed before, not present in the new list at all
//
// The block's own cName and every param's cName are recomputed on *every*
// call, not just at creation -- even though these are internal C++
// identifiers a kid never directly edits, "View Code" is user-facing, and a
// generated `void Blink_Twice(float pin)` that still says `pin` after the
// kid renamed that input to `ledPin` in the dialog would read as a bug. The
// old block-level cName is freed from usedIdentifiers first so a rename
// that round-trips back to the same sanitized text (or frees up a name
// another block can now take) doesn't get needlessly suffixed; params only
// need to stay unique among themselves + reserved words (see
// uniqueIdentifier/sanitizeBase above), recomputed fresh each call in
// dialog-row order, which keeps them stable whenever nothing actually
// changed (same names in the same order sanitize the same way).
function applyDefinitionUpdate(def, { name, params }) {
  if (def.cName) usedIdentifiers.delete(def.cName.toLowerCase());
  def.cName = uniqueIdentifier(name);
  arduinoGenerator.reserveIdentifier(def.cName);
  def.name = name;

  const oldParamsById = new Map(def.params.map((p) => [p.id, p]));
  const keptParamIds = new Set();
  const addedParamIds = new Set();
  const typeChangedParamIds = new Set();

  const seenCNames = new Set(ARDUINO_RESERVED_WORDS.map((w) => w.toLowerCase()));
  const resolvedParams = [];
  for (const rawP of params) {
    const old = rawP.origId ? oldParamsById.get(rawP.origId) : null;

    const base = sanitizeBase(rawP.name) || 'param';
    let candidate = base;
    let n = 2;
    while (seenCNames.has(candidate.toLowerCase())) {
      candidate = `${base}_${n}`;
      n += 1;
    }
    seenCNames.add(candidate.toLowerCase());

    if (old) {
      keptParamIds.add(old.id);
      if (old.type !== rawP.type) typeChangedParamIds.add(old.id);
      // Mutated in place, same object identity -- the getter generator
      // closure above (and the define/call generators, via def.params)
      // pick this up automatically, no re-registration needed.
      old.name = rawP.name;
      old.type = rawP.type;
      old.cName = candidate;
      resolvedParams.push(old);
    } else {
      const newParam = { id: `p${def.nextParamSeq++}`, name: rawP.name, type: rawP.type, cName: candidate };
      addedParamIds.add(newParam.id);
      resolvedParams.push(newParam);
    }
  }

  const removedParamIds = new Set([...oldParamsById.keys()].filter((id) => !keptParamIds.has(id)));

  def.params = resolvedParams;

  // Covers rename/retype for every surviving param (kept or just-added) so
  // a *fresh* drag from the flyout after this edit shows the current name;
  // already-placed instances are handled separately by cascade.js.
  for (const p of resolvedParams) {
    registerGetterType(def, p);
  }

  return { removedParamIds, addedParamIds, typeChangedParamIds, keptParamIds };
}

// Registers a brand new custom block: builds its "define"/"call" Blockly
// block types and wires up Arduino code generation, then applies the
// initial name/params (every incoming param is necessarily "new" here,
// since def.params starts empty). Returns the definition record -- the Make
// a Block dialog uses `defineType` to drop a fresh instance of the hat onto
// the workspace right after creation.
export function registerCustomBlock({ name, params }) {
  const id = `cb${(counter += 1)}`;
  const def = {
    id,
    name: '',
    cName: '',
    params: [],
    nextParamSeq: 0,
    defineType: `myblock_define_${id}`,
    callType: `myblock_call_${id}`,
  };
  customBlocks.push(def);
  registerDefineAndCallTypes(def);
  applyDefinitionUpdate(def, { name, params: params.map((p) => ({ ...p, origId: null })) });
  return def;
}

// Edits an existing custom block's name/params. Returns `{ def, diff }` --
// `def` is the same (now-updated) record `getCustomBlocks()` already
// returns; `diff` is passed to myBlocks/cascade.js's applyEditCascade to
// bring already-placed workspace instances in line with the new shape.
export function updateCustomBlock(defId, { name, params }) {
  const def = customBlocks.find((d) => d.id === defId);
  const diff = applyDefinitionUpdate(def, { name, params });
  return { def, diff };
}

// Wipes every custom block this session knows about -- called by
// ../projectIO.js immediately before restoring a project (autosave or a
// named Load), since "load a project" means *replace* the workspace
// entirely, not merge into whatever was already there. Without this, custom
// blocks from before the load would (a) keep cluttering the My Blocks
// flyout for a project that doesn't use them, and (b) risk id collisions
// with the just-loaded project's own "cb1", "cb2", ... ids, which are only
// unique *within* a single save, not globally.
//
// Doesn't (and can't cleanly) unregister the actual Blockly.Blocks[type]
// entries or their generators from Blockly's own global registry -- those
// are simply left orphaned, unreachable through the toolbox or
// getCustomBlocks() once removed from `customBlocks` here, and harmless to
// leave behind for the rest of the session.
export function resetCustomBlocks() {
  customBlocks.length = 0;
  counter = 0;
  usedIdentifiers.clear();
  for (const w of ARDUINO_RESERVED_WORDS) usedIdentifiers.add(w.toLowerCase());
}

// Re-registers a previously-saved set of custom block definitions under
// their *original* ids/type strings (unlike registerCustomBlock, which
// always mints a fresh identity) -- so a loaded workspace's block instances,
// which hard-reference type strings like "myblock_call_cb3", resolve
// correctly. Expected to run against an empty registry (see
// resetCustomBlocks) immediately before Blockly.serialization.workspaces
// .load(); skips any id already present so calling it twice (e.g. a
// double-invoked effect) is harmless rather than duplicating entries.
export function restoreCustomBlocks(savedDefs) {
  for (const saved of savedDefs) {
    if (customBlocks.some((d) => d.id === saved.id)) continue;

    const def = {
      id: saved.id,
      name: saved.name,
      cName: saved.cName,
      nextParamSeq: saved.nextParamSeq ?? saved.params.length,
      params: saved.params.map((p) => ({ ...p })),
      defineType: `myblock_define_${saved.id}`,
      callType: `myblock_call_${saved.id}`,
    };
    customBlocks.push(def);
    registerDefineAndCallTypes(def);
    for (const p of def.params) registerGetterType(def, p);
    arduinoGenerator.reserveIdentifier(def.cName);
    usedIdentifiers.add(def.cName.toLowerCase());

    // Keeps ids/cNames minted *after* this restore (a kid making a brand
    // new custom block post-load) from ever colliding with a restored one.
    const n = Number(String(saved.id).replace(/^cb/, ''));
    if (Number.isFinite(n) && n > counter) counter = n;
  }
}
