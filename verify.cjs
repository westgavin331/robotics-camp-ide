// Replays the repair against the ACTUAL saved projects in Mongo (read-only),
// using the real block definitions, and reports what each one loads as.
const { readFileSync } = require('node:fs');
// Full entry point: core + standard blocks + the en locale (setLocale), so
// stock blocks' %{BKY_...} message placeholders actually resolve.
const Blockly = require('blockly');
const { MongoClient } = require('mongodb');

// Real pin option lists (frontend/src/blockly/blocks/pinFields.js).
const PWM_PINS = [3, 5, 6, 9, 10, 11];
const DIGITAL_PIN_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 2).map((p) => [PWM_PINS.includes(p) ? `~${p}` : `${p}`, `${p}`]);
const PWM_PIN_OPTIONS = PWM_PINS.map((p) => [`~${p}`, `${p}`]);
const ANALOG_PIN_OPTIONS = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'].map((p) => [p, p]);

Blockly.defineBlocksWithJsonArray([
  { type: 'io_digital_write', message0: 'set digital pin %1 to %2', args0: [{ type: 'field_dropdown', name: 'PIN', options: DIGITAL_PIN_OPTIONS }, { type: 'field_dropdown', name: 'STATE', options: [['HIGH', 'HIGH'], ['LOW', 'LOW']] }], previousStatement: null, nextStatement: null },
  { type: 'io_digital_read', message0: 'read digital pin %1', args0: [{ type: 'field_dropdown', name: 'PIN', options: DIGITAL_PIN_OPTIONS }], output: 'Number' },
  { type: 'io_analog_read', message0: 'read analog pin %1', args0: [{ type: 'field_dropdown', name: 'PIN', options: ANALOG_PIN_OPTIONS }], output: 'Number' },
  { type: 'io_pwm_write', message0: 'set PWM pin %1 to %2', args0: [{ type: 'field_dropdown', name: 'PIN', options: PWM_PIN_OPTIONS }, { type: 'input_value', name: 'VALUE', check: 'Number' }], previousStatement: null, nextStatement: null },
  { type: 'io_servo_write', message0: 'set servo pin %1 to %2', args0: [{ type: 'field_dropdown', name: 'PIN', options: DIGITAL_PIN_OPTIONS }, { type: 'input_value', name: 'ANGLE', check: 'Number' }], previousStatement: null, nextStatement: null },
  { type: 'io_wait', message0: 'wait %1 seconds', args0: [{ type: 'input_value', name: 'TIME', check: 'Number' }], previousStatement: null, nextStatement: null },
  { type: 'ir_start_receiver', message0: 'start IR receiver on pin %1', args0: [{ type: 'field_dropdown', name: 'PIN', options: DIGITAL_PIN_OPTIONS }], previousStatement: null, nextStatement: null },
  { type: 'ir_if_received', message0: 'if IR signal received', message1: '%1', args1: [{ type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null },
  { type: 'ir_get_code', message0: 'get IR code %1', args0: [{ type: 'field_dropdown', name: 'FORMAT', options: [['full code', 'RAW'], ['command byte', 'COMMAND']] }], output: 'Number' },
  { type: 'arduino_start', message0: 'when the robot starts', nextStatement: null },
  { type: 'controls_forever', message0: 'forever %1', args0: [{ type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null },
  { type: 'serial_print', message0: 'print %1', args0: [{ type: 'input_value', name: 'VALUE' }], previousStatement: null, nextStatement: null },
  { type: 'shadow_text', message0: '%1', args0: [{ type: 'field_input', name: 'TEXT', text: '' }], output: 'String' },
]);

// ---- code under test, copied verbatim from projectIO.js ----
const OUTDATED_BLOCK_WARNING =
  'This block was saved by an older version of the app, and its pin setting ' +
  "couldn't be carried over. Pick the right pin from the dropdown.";
const OUTDATED_BLOCK_WARNING_ID = 'outdatedBlock';

function pinValueFromRemovedSocket(block, name, socketState) {
  const field = block.getField(name);
  if (!field || typeof field.getOptions !== 'function') return null;
  const saved = socketState?.block || socketState?.shadow;
  const savedNumber = saved?.fields?.NUM;
  if (typeof savedNumber !== 'number') return null;
  const offered = new Set(field.getOptions().map(([, optionValue]) => optionValue));
  for (const candidate of [String(savedNumber), `A${savedNumber}`]) {
    if (offered.has(candidate)) return candidate;
  }
  return null;
}

function loadWorkspaceState(workspace, savedState) {
  const state = JSON.parse(JSON.stringify(savedState));
  const needsAttention = new Set();
  for (let pass = 0; pass < 500; pass++) {
    try {
      Blockly.serialization.workspaces.load(state, workspace);
      break;
    } catch (err) {
      if (!(err instanceof Blockly.serialization.exceptions.MissingConnection)) throw err;
      const blockState = err.state;
      const liveInputs = new Set(err.block.inputList.map((input) => input.name));
      const stale = Object.keys(blockState.inputs || {}).filter((name) => !liveInputs.has(name));
      if (stale.length === 0) throw err;
      for (const name of stale) {
        const recovered = pinValueFromRemovedSocket(err.block, name, blockState.inputs[name]);
        if (recovered === null) needsAttention.add(blockState.id);
        else {
          blockState.fields = blockState.fields || {};
          blockState.fields[name] = recovered;
        }
        delete blockState.inputs[name];
      }
      workspace.clear();
    }
  }
  for (const id of needsAttention) {
    workspace.getBlockById(id)?.setWarningText(OUTDATED_BLOCK_WARNING, OUTDATED_BLOCK_WARNING_ID);
  }
}
// ---- end code under test ----

const warned = new Map();
Blockly.Block.prototype.setWarningText = function (text, id = '') { warned.set(this.id, [text, id]); };

// Custom "My Blocks" types are registered at runtime from the project's own
// customBlocks list -- mirror just enough of registry.js to define them.
function defineCustomBlocks(customBlocks) {
  for (const def of customBlocks || []) {
    const params = def.params || [];
    Blockly.defineBlocksWithJsonArray([
      // A hat whose body is its *next* chain (registry.js:217 setNextStatement),
      // not a statement input.
      { type: `myblock_define_${def.id}`, message0: `to ${def.name}`, nextStatement: null },
      { type: `myblock_call_${def.id}`, message0: `${def.name}${params.map((_, i) => ` %${i + 1}`).join('')}`, args0: params.map((p) => ({ type: 'input_value', name: `ARG_${p.id}` })), previousStatement: null, nextStatement: null },
      ...params.map((p) => ({ type: `myblock_param_${def.id}_${p.id}`, message0: p.name, output: null })),
    ]);
  }
}

(async () => {
  const env = readFileSync('/Users/GavinWest/robotics-camp-ide/backend/.env', 'utf8');
  const uri = env.split('\n').find((l) => l.trim().startsWith('MONGODB_URI=')).slice('MONGODB_URI='.length).trim().replace(/^["']|["']$/g, '');
  const client = new MongoClient(uri);
  await client.connect();
  const docs = await client.db('robotics_camp').collection('projects').find({}).toArray();

  let ok = 0, failed = 0;
  for (const doc of docs) {
    warned.clear();
    defineCustomBlocks(doc.customBlocks);
    const ws = new Blockly.Workspace();
    try {
      loadWorkspaceState(ws, doc.workspace);
      const pins = [];
      for (const b of ws.getAllBlocks(false)) {
        const v = b.getFieldValue?.('PIN');
        if (v != null) pins.push(`${b.type}=${v}`);
      }
      const flags = warned.size ? `  WARNED x${warned.size}` : '';
      console.log(`LOADS  ${doc.name}  (${ws.getAllBlocks(false).length} blocks)${flags}`);
      if (pins.length) console.log(`         pins: ${pins.join(', ')}`);
      ok++;
    } catch (e) {
      console.log(`ERROR  ${doc.name}: ${e.constructor.name}: ${e.message}`);
      failed++;
    }
  }
  console.log(`\n${ok} load, ${failed} fail`);
  await client.close();
})();
