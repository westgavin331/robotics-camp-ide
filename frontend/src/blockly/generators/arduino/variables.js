import * as Blockly from 'blockly/core';
import { arduinoGenerator as generator } from './core.js';

function getVarName(block, gen) {
  const name = gen.nameDB_.getName(block.getFieldValue('VAR'), Blockly.Names.NameType.VARIABLE);
  gen.addVariable(name);
  return name;
}

generator.forBlock['variables_get'] = function (block, gen) {
  return [getVarName(block, gen), gen.ORDER_ATOMIC];
};

generator.forBlock['variables_set'] = function (block, gen) {
  const name = getVarName(block, gen);
  const value = gen.valueToCode(block, 'VALUE', gen.ORDER_ASSIGNMENT) || '0';
  return `${name} = ${value};\n`;
};

// "change [item] by [1]" -- the Variables get/set/change block from the spec.
generator.forBlock['math_change'] = function (block, gen) {
  const name = getVarName(block, gen);
  const delta = gen.valueToCode(block, 'DELTA', gen.ORDER_ADDITIVE) || '0';
  return `${name} = ${name} + ${delta};\n`;
};
