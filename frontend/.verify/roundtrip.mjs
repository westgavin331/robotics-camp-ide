// Generates a sketch from a simulated workspace, imports it back, regenerates
// from the imported project, and checks the two sketches are identical.
import { codeFor, sketch, Blockly } from './harness.mjs';
import { tryImport } from './tryImport.mjs';
import { loadProject } from '../src/blockly/projectIO.js';
import { generateArduinoCode } from '../src/blockly/generators/arduino/index.js';

const cases = {
  'any (default) -- held command': sketch(
    [{ type: 'ir_start_receiver', fields: { PIN: '12' } }],
    [{ type: 'serial_print', inputs: { VALUE: { block: { type: 'ir_held_command' } } } }],
  ),
  'filtered decimal -- held command': sketch(
    [{ type: 'ir_start_receiver', fields: { PIN: '12', ADDRESS: '255' } }],
    [{ type: 'serial_print', inputs: { VALUE: { block: { type: 'ir_held_command' } } } }],
  ),
  'filtered hex -- if received + command byte': sketch(
    [{ type: 'ir_start_receiver', fields: { PIN: '12', ADDRESS: '0xEF00' } }],
    [{ type: 'ir_if_received', inputs: { DO: { block: {
      type: 'serial_print', inputs: { VALUE: { block: { type: 'ir_get_code', fields: { FORMAT: 'COMMAND' } } } },
    } } } }],
  ),
  'address discovery (any + print address)': sketch(
    [{ type: 'ir_start_receiver', fields: { PIN: '12' } }],
    [{ type: 'ir_if_received', inputs: { DO: { block: {
      type: 'serial_print', inputs: { VALUE: { block: { type: 'ir_get_code', fields: { FORMAT: 'ADDRESS' } } } },
    } } } }],
  ),
  'filtered -- if received, empty body': sketch(
    [{ type: 'ir_start_receiver', fields: { PIN: '12', ADDRESS: '0x1FE' } }],
    [{ type: 'ir_if_received' }],
  ),
  'filtered receiver, no consumer': sketch(
    [{ type: 'ir_start_receiver', fields: { PIN: '12', ADDRESS: '4' } }],
    [],
  ),
  'unfiltered -- if received + repeat flag': sketch(
    [{ type: 'ir_start_receiver', fields: { PIN: '12' } }],
    [{ type: 'ir_if_received', inputs: { DO: { block: {
      type: 'serial_print', inputs: { VALUE: { block: { type: 'ir_repeat_received' } } },
    } } } }],
  ),
  'filtered -- held command drives motors': sketch(
    [{ type: 'ir_start_receiver', fields: { PIN: '12', ADDRESS: '0' } }],
    [{ type: 'controls_if', inputs: {
      IF0: { block: { type: 'logic_compare', fields: { OP: 'EQ' }, inputs: {
        A: { block: { type: 'ir_held_command' } },
        B: { block: { type: 'math_number', fields: { NUM: 24 } } },
      } } },
      DO0: { block: { type: 'motor_set_drive', fields: { DIR: 'FORWARD' }, inputs: {
        SPEED: { block: { type: 'math_number', fields: { NUM: 200 } } },
      } } },
    } }],
  ),
};

let failures = 0;
for (const [name, state] of Object.entries(cases)) {
  const original = codeFor(state);
  const result = await tryImport(original);
  if (!result.ok) {
    failures += 1;
    console.log(`FAIL (import rejected)  ${name}`);
    for (const e of result.errors) console.log(`    line ${e.line}: ${e.message}`);
    continue;
  }
  const ws = new Blockly.Workspace();
  loadProject(ws, result.project);
  const regenerated = generateArduinoCode(ws);
  if (regenerated === original) {
    console.log(`ok                      ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL (code differs)     ${name}`);
    console.log('--- original ---\n' + original + '--- regenerated ---\n' + regenerated);
  }
}
console.log(`\n${failures === 0 ? 'ALL ROUND-TRIPS OK' : failures + ' FAILURE(S)'}`);
