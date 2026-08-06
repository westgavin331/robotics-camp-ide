// Does a project saved BEFORE the ADDRESS field existed still load, and does
// it still generate exactly the sketch it used to?
import { Blockly } from './harness.mjs';
import { loadProject } from '../src/blockly/projectIO.js';
import { generateArduinoCode } from '../src/blockly/generators/arduino/index.js';

function report(name, fn) {
  try {
    console.log(`--- ${name} ---`);
    fn();
  } catch (err) {
    console.log(`FAIL: ${err.constructor.name}: ${err.message}`);
  }
}

// 1. Current-era save: PIN is a dropdown field, no ADDRESS key at all.
report('saved with no ADDRESS field', () => {
  const ws = new Blockly.Workspace();
  loadProject(ws, { version: 1, workspace: { blocks: { languageVersion: 0, blocks: [
    { type: 'arduino_start', x: 0, y: 0, next: { block: { type: 'ir_start_receiver', fields: { PIN: '12' },
      next: { block: { type: 'controls_forever', inputs: { DO: { block: {
        type: 'serial_print', inputs: { VALUE: { block: { type: 'ir_held_command' } } } } } } } } } } },
  ] } } });
  const block = ws.getBlocksByType('ir_start_receiver')[0];
  console.log('ADDRESS field value:', JSON.stringify(block.getFieldValue('ADDRESS')));
  console.log(generateArduinoCode(ws));
});

// 2. Pre-dropdown save: PIN was a plug-in Number socket (projectIO repairs it).
report('pre-dropdown save (PIN as socket), no ADDRESS', () => {
  const ws = new Blockly.Workspace();
  loadProject(ws, { version: 1, workspace: { blocks: { languageVersion: 0, blocks: [
    { type: 'arduino_start', x: 0, y: 0, next: { block: { type: 'ir_start_receiver',
      inputs: { PIN: { block: { type: 'math_number', fields: { NUM: 12 } } } },
      next: { block: { type: 'controls_forever', inputs: { DO: { block: { type: 'ir_if_received' } } } } } } } },
  ] } } });
  const block = ws.getBlocksByType('ir_start_receiver')[0];
  console.log('PIN:', block.getFieldValue('PIN'), ' ADDRESS:', JSON.stringify(block.getFieldValue('ADDRESS')));
  console.log('warning:', block.warning?.getText?.() ?? '(none)');
});

// 3. Field validator: what does the ADDRESS box accept?
report('ADDRESS field validator', () => {
  const ws = new Blockly.Workspace();
  const block = ws.newBlock('ir_start_receiver');
  const field = block.getField('ADDRESS');
  for (const attempt of ['any', 'ANY', '  any  ', '', '0', '255', '65535', '0xEF00', '0XEF00',
                         '65536', '-1', '1.5', 'banana', '0x', 'twelve']) {
    field.setValue(attempt);
    console.log(`  ${JSON.stringify(attempt).padEnd(10)} -> ${JSON.stringify(field.getValue())}`);
    field.setValue('any'); // reset between attempts
  }
});
