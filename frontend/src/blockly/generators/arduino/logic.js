import { arduinoGenerator as generator } from './core.js';

generator.forBlock['controls_if'] = function (block, gen) {
  let n = 0;
  let code = '';
  let branchCode;
  let conditionCode;
  do {
    conditionCode = gen.valueToCode(block, 'IF' + n, gen.ORDER_NONE) || 'false';
    branchCode = gen.statementToCode(block, 'DO' + n);
    code += (n === 0 ? 'if (' : 'else if (') + conditionCode + ') {\n' + branchCode + '}\n';
    n += 1;
  } while (block.getInput('IF' + n));

  if (block.getInput('ELSE')) {
    branchCode = gen.statementToCode(block, 'ELSE');
    code += 'else {\n' + branchCode + '}\n';
  }
  return code;
};

generator.forBlock['logic_compare'] = function (block, gen) {
  const OPERATORS = {
    EQ: '==',
    NEQ: '!=',
    LT: '<',
    LTE: '<=',
    GT: '>',
    GTE: '>=',
  };
  const op = OPERATORS[block.getFieldValue('OP')];
  const order = gen.ORDER_EQUALITY;
  const a = gen.valueToCode(block, 'A', order) || '0';
  const b = gen.valueToCode(block, 'B', order) || '0';
  return [`${a} ${op} ${b}`, order];
};

generator.forBlock['logic_operation'] = function (block, gen) {
  const op = block.getFieldValue('OP') === 'AND' ? '&&' : '||';
  const order = op === '&&' ? gen.ORDER_LOGICAL_AND : gen.ORDER_LOGICAL_OR;
  const a = gen.valueToCode(block, 'A', order) || 'false';
  const b = gen.valueToCode(block, 'B', order) || 'false';
  return [`${a} ${op} ${b}`, order];
};

generator.forBlock['logic_negate'] = function (block, gen) {
  const order = gen.ORDER_UNARY_PREFIX;
  const value = gen.valueToCode(block, 'BOOL', order) || 'false';
  return [`!${value}`, order];
};

generator.forBlock['logic_boolean'] = function (block) {
  return [block.getFieldValue('BOOL') === 'TRUE' ? 'true' : 'false', generator.ORDER_ATOMIC];
};

generator.forBlock['logic_ternary'] = function (block, gen) {
  const order = gen.ORDER_CONDITIONAL;
  const cond = gen.valueToCode(block, 'IF', order) || 'false';
  const thenVal = gen.valueToCode(block, 'THEN', order) || '0';
  const elseVal = gen.valueToCode(block, 'ELSE', order) || '0';
  return [`${cond} ? ${thenVal} : ${elseVal}`, order];
};
