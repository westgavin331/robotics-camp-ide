// The 4-block diagnostic a kid would build, plus its round trip.
import { codeFor, sketch, Blockly } from './harness.mjs';
import { tryImport } from './tryImport.mjs';
import { loadProject } from '../src/blockly/projectIO.js';
import { generateArduinoCode } from '../src/blockly/generators/arduino/index.js';

const cases = {
  'protocol only (the 4-block probe)': sketch(
    [{ type: 'ir_start_receiver', fields: { PIN: '12' } }],
    [{ type: 'ir_if_received', inputs: { DO: { block: {
      type: 'serial_print', inputs: { VALUE: { block: { type: 'ir_protocol_name' } } },
    } } } }],
  ),
  'protocol + address + repeat flag (full survey)': sketch(
    [{ type: 'ir_start_receiver', fields: { PIN: '12' } }],
    [{ type: 'ir_if_received', inputs: { DO: { block: {
      type: 'serial_print', inputs: { VALUE: { block: { type: 'ir_protocol_name' } } },
      next: { block: {
        type: 'serial_print', inputs: { VALUE: { block: { type: 'ir_get_code', fields: { FORMAT: 'ADDRESS' } } } },
        next: { block: {
          type: 'serial_print', inputs: { VALUE: { block: { type: 'ir_repeat_received' } } },
        } },
      } },
    } } } }],
  ),
  'protocol probe with filtering on (must still compile sensibly)': sketch(
    [{ type: 'ir_start_receiver', fields: { PIN: '12', ADDRESS: '0xEF00' } }],
    [{ type: 'ir_if_received', inputs: { DO: { block: {
      type: 'serial_print', inputs: { VALUE: { block: { type: 'ir_protocol_name' } } },
    } } } }],
  ),
};

let failures = 0;
for (const [name, state] of Object.entries(cases)) {
  const original = codeFor(state);
  console.log(`\n${'='.repeat(66)}\n${name}\n${'='.repeat(66)}\n${original}`);
  const r = await tryImport(original);
  if (!r.ok) {
    failures += 1;
    console.log('ROUND TRIP: REJECTED -- ' + r.errors.map((e) => `line ${e.line}: ${e.message}`).join(' / '));
    continue;
  }
  const ws = new Blockly.Workspace();
  loadProject(ws, r.project);
  const again = generateArduinoCode(ws);
  if (again === original) console.log('ROUND TRIP: ok');
  else { failures += 1; console.log('ROUND TRIP: DIFFERS\n' + again); }
}

// Type safety: the String-typed reporter must not be pluggable into math.
const ws = new Blockly.Workspace();
const protocol = ws.newBlock('ir_protocol_name');
const math = ws.newBlock('math_arithmetic');
const numeric = ws.newBlock('ir_get_code');
const socket = math.getInput('A').connection;
const checker = ws.connectionChecker;
console.log('\nType check:');
console.log('  ir_protocol_name -> math_arithmetic A :',
  checker.canConnect(socket, protocol.outputConnection, false) ? 'ALLOWED (bad)' : 'blocked (correct)');
console.log('  ir_get_code      -> math_arithmetic A :',
  checker.canConnect(socket, numeric.outputConnection, false) ? 'allowed (correct)' : 'BLOCKED (bad)');
console.log('  ir_protocol_name -> serial_print VALUE:',
  checker.canConnect(ws.newBlock('serial_print').getInput('VALUE').connection, protocol.outputConnection, false)
    ? 'allowed (correct)' : 'BLOCKED (bad)');

console.log(`\n${failures === 0 ? 'ALL OK' : failures + ' FAILURE(S)'}`);
