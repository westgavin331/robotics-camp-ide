import * as Blockly from 'blockly/core';
import { arduinoGenerator, ARDUINO_RESERVED_WORDS } from '../generators/arduino/core.js';

// "My Blocks" (spec-adjacent addition, not from section 2's table -- Scratch/
// mBlock's custom block system). Unlike everything else in this app, block
// *types* here don't exist until a kid creates them via the "Make a Block"
// dialog, so there's no static blocks/*.js file to define them in -- this
// module builds and registers a matching pair of Blockly block types (a
// "define" hat + a "call" block) plus one reporter block per parameter, for
// every custom block a kid creates. Session-only: this registry lives in JS
// module state, not in the workspace's own serialized XML/JSON, so a page
// reload loses it (matches the ask -- full save/load isn't required yet).

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
// "Jump" and "jump" would still confuse a kid.
const usedIdentifiers = new Set(ARDUINO_RESERVED_WORDS.map((w) => w.toLowerCase()));
const customBlocks = [];

export function getCustomBlocks() {
  return customBlocks;
}

// Blockly's JSON message format treats bare `%` as the start of a
// placeholder reference -- a block or parameter named e.g. "50% speed"
// would otherwise crash block creation.
function escapeMessage(text) {
  return String(text).replace(/%/g, '%%');
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

// Registers a new custom block: builds the Blockly block definitions for its
// "define" hat, its "call" block, and one reporter block per parameter (used
// to read that parameter's value from inside the definition's own body), and
// wires up Arduino code generation for all of them. Returns the definition
// record -- the Make a Block dialog uses `defineType` to drop a fresh
// instance of the hat onto the workspace right after creation.
export function registerCustomBlock({ name, params }) {
  const id = `cb${(counter += 1)}`;
  const cName = uniqueIdentifier(name);
  arduinoGenerator.reserveIdentifier(cName);

  // Param C names only need to be unique from each other (they're function-
  // local) and from reserved words (so the body can still call e.g. delay()
  // even if a param is loosely related) -- not from other custom blocks or
  // from workspace variables, which a local parameter legally shadows.
  const seenParamNames = new Set(ARDUINO_RESERVED_WORDS.map((w) => w.toLowerCase()));
  const resolvedParams = params.map((p, i) => {
    const base = sanitizeBase(p.name) || `param${i}`;
    let candidate = base;
    let n = 2;
    while (seenParamNames.has(candidate.toLowerCase())) {
      candidate = `${base}_${n}`;
      n += 1;
    }
    seenParamNames.add(candidate.toLowerCase());
    return { id: `p${i}`, name: p.name, type: p.type, cName: candidate };
  });

  const defineType = `myblock_define_${id}`;
  const callType = `myblock_call_${id}`;
  const displayName = escapeMessage(name);

  const defineArgs = resolvedParams.map((p) => ({
    type: 'field_label_serializable',
    name: `LABEL_${p.id}`,
    text: escapeMessage(p.name),
  }));
  const defineMessage = ['define', displayName, ...resolvedParams.map((_, i) => `%${i + 1}`)].join(' ');

  const callArgs = resolvedParams.map((p) => ({
    type: 'input_value',
    name: `ARG_${p.id}`,
    check: PARAM_TYPE_INFO[p.type].check,
  }));
  const callMessage = [displayName, ...resolvedParams.map((_, i) => `%${i + 1}`)].join(' ');

  const paramGetterDefs = resolvedParams.map((p) => ({
    type: paramGetterType(id, p.id),
    message0: escapeMessage(p.name),
    output: PARAM_TYPE_INFO[p.type].check,
    style: 'camp_myblocks_blocks',
    tooltip: `The "${name}" block's "${p.name}" input.`,
  }));

  Blockly.defineBlocksWithJsonArray([
    {
      type: defineType,
      message0: defineMessage,
      args0: defineArgs,
      // Hat shape (see forever.js/hat.js for the same pattern): nothing
      // connects above, blocks defining the body stack directly below,
      // rather than nesting inside a C-shape.
      nextStatement: null,
      style: 'camp_myblocks_hat_blocks',
      tooltip: `Defines what the "${name}" block does. Drag blocks in below to build it.`,
    },
    {
      type: callType,
      message0: callMessage,
      args0: callArgs,
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      style: 'camp_myblocks_blocks',
      tooltip: `Runs the "${name}" block you made.`,
    },
    ...paramGetterDefs,
  ]);

  const paramList = resolvedParams.map((p) => `${PARAM_TYPE_INFO[p.type].cType} ${p.cName}`).join(', ');

  // Not reached via the normal blockToCode/statementToCode chain-walk --
  // this hat is a top-level block with no previous connection, a sibling of
  // arduino_start rather than part of its chain. generateArduinoCode()
  // (core.js) calls this directly for every myblock_define_* top block it
  // finds, before walking arduino_start's own chain.
  arduinoGenerator.forBlock[defineType] = function (block, gen) {
    let body = '';
    let child = block.getNextBlock();
    while (child) {
      body += gen.blockToCode(child, true);
      child = child.getNextBlock();
    }
    const bodyIndented = body ? gen.prefixLines(body, gen.INDENT) : '';
    gen.functions_[`fn_${id}`] = `void ${cName}(${paramList}) {\n${bodyIndented}}`;
    return '';
  };

  arduinoGenerator.forBlock[callType] = function (block, gen) {
    const args = resolvedParams.map((p) => {
      const info = PARAM_TYPE_INFO[p.type];
      return gen.valueToCode(block, `ARG_${p.id}`, gen.ORDER_ATOMIC) || info.defaultCode;
    });
    return `${cName}(${args.join(', ')});\n`;
  };

  for (const p of resolvedParams) {
    const getterType = paramGetterType(id, p.id);
    // The getter just emits the C++ parameter's own name -- valid because it
    // only ever makes sense (and is only offered in the toolbox) inside the
    // body of the one function that declares that parameter.
    arduinoGenerator.forBlock[getterType] = function () {
      return [p.cName, arduinoGenerator.ORDER_ATOMIC];
    };
  }

  const def = { id, name, cName, params: resolvedParams, defineType, callType };
  customBlocks.push(def);
  return def;
}
