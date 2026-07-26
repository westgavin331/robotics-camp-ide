import * as Blockly from 'blockly/core';
import { arduinoGenerator as generator } from './core.js';

generator.forBlock['controls_repeat_ext'] = function (block, gen) {
  const repeats = gen.valueToCode(block, 'TIMES', gen.ORDER_ASSIGNMENT) || '0';
  let branch = gen.statementToCode(block, 'DO');
  branch = gen.addLoopTrap(branch, block);
  const loopVar = gen.nameDB_.getDistinctName('count', Blockly.Names.NameType.VARIABLE);
  return `for (int ${loopVar} = 0; ${loopVar} < ${repeats}; ${loopVar}++) {\n${branch}}\n`;
};

generator.forBlock['controls_whileUntil'] = function (block, gen) {
  const isUntil = block.getFieldValue('MODE') === 'UNTIL';
  const rawCond = gen.valueToCode(block, 'BOOL', gen.ORDER_NONE) || 'false';
  const cond = isUntil ? `!(${rawCond})` : rawCond;
  let branch = gen.statementToCode(block, 'DO');
  branch = gen.addLoopTrap(branch, block);
  return `while (${cond}) {\n${branch}}\n`;
};

// Mirrors Blockly's own controls_for generators: emit a plain C-style for
// loop when FROM/TO/BY are all numeric literals, otherwise cache the
// (possibly non-constant) bounds in temp variables and pick the loop
// direction at runtime.
generator.forBlock['controls_for'] = function (block, gen) {
  const varName = gen.nameDB_.getName(block.getFieldValue('VAR'), Blockly.Names.NameType.VARIABLE);
  gen.addVariable(varName);
  const fromCode = gen.valueToCode(block, 'FROM', gen.ORDER_ASSIGNMENT) || '0';
  const toCode = gen.valueToCode(block, 'TO', gen.ORDER_ASSIGNMENT) || '0';
  const byCode = gen.valueToCode(block, 'BY', gen.ORDER_ASSIGNMENT) || '1';
  let branch = gen.statementToCode(block, 'DO');
  branch = gen.addLoopTrap(branch, block);

  let code;
  const isNumber = (s) => /^[+-]?\d+(\.\d+)?$/.test(s.trim());

  if (isNumber(fromCode) && isNumber(toCode) && isNumber(byCode)) {
    const up = Number(fromCode) <= Number(toCode);
    const step = Math.abs(Number(byCode));
    code =
      `for (${varName} = ${fromCode}; ${varName} ${up ? '<=' : '>='} ${toCode}; ` +
      `${varName} ${up ? '+=' : '-='} ${step}) {\n${branch}}\n`;
  } else {
    const startVar = gen.nameDB_.getDistinctName(`${varName}_start`, Blockly.Names.NameType.VARIABLE);
    const endVar = gen.nameDB_.getDistinctName(`${varName}_end`, Blockly.Names.NameType.VARIABLE);
    const stepVar = gen.nameDB_.getDistinctName(`${varName}_step`, Blockly.Names.NameType.VARIABLE);
    code =
      `float ${startVar} = ${fromCode};\n` +
      `float ${endVar} = ${toCode};\n` +
      `float ${stepVar} = abs(${byCode});\n` +
      `if (${startVar} > ${endVar}) { ${stepVar} = -${stepVar}; }\n` +
      `for (${varName} = ${startVar}; ${stepVar} >= 0 ? ${varName} <= ${endVar} : ${varName} >= ${endVar}; ` +
      `${varName} += ${stepVar}) {\n${branch}}\n`;
  }
  return code;
};

// Generic meaning, used whenever a forever block is NOT a direct child of
// the "when Arduino Uno starts up" hat -- e.g. nested inside an if, or
// inside another loop. That special top-level case is handled entirely in
// core.js's generateArduinoCode(), which extracts the contents straight
// into void loop() instead of ever calling this.
generator.forBlock['controls_forever'] = function (block, gen) {
  const branch = gen.statementToCode(block, 'DO');
  return `while (true) {\n${branch}}\n`;
};

generator.forBlock['controls_flow_statements'] = function (block) {
  switch (block.getFieldValue('FLOW')) {
    case 'BREAK':
      return 'break;\n';
    case 'CONTINUE':
      return 'continue;\n';
    default:
      return '';
  }
};
