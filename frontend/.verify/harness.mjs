// Headless verification harness. Loads the REAL block definitions and the
// REAL Arduino generator (no copies), builds a workspace from Blockly
// serialization state, and returns the generated sketch.
import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import * as En from 'blockly/msg/en';
import '../src/blockly/blocks/index.js';
import { generateArduinoCode } from '../src/blockly/generators/arduino/index.js';

Blockly.setLocale(En.default ?? En);

export function workspaceFor(state) {
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(state, ws);
  return ws;
}

export function codeFor(state) {
  return generateArduinoCode(workspaceFor(state));
}

// Sugar for building the standard hat -> setup blocks -> forever chain.
export function sketch(setupBlocks, loopBlocks) {
  const chain = [...setupBlocks, { type: 'controls_forever', inputs: loopBlocks.length ? { DO: { block: chainOf(loopBlocks) } } : {} }];
  return { blocks: { languageVersion: 0, blocks: [{ type: 'arduino_start', x: 0, y: 0, next: { block: chainOf(chain) } }] } };
}

export function chainOf(blocks) {
  const copies = blocks.map((b) => ({ ...b }));
  for (let i = 0; i < copies.length - 1; i += 1) copies[i].next = { block: copies[i + 1] };
  return copies[0];
}

export { Blockly, generateArduinoCode };
