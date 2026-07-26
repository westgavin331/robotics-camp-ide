import { arduinoGenerator as generator } from './core.js';

generator.forBlock['math_number'] = function (block, gen) {
  const num = Number(block.getFieldValue('NUM'));
  const order = num < 0 ? gen.ORDER_UNARY_PREFIX : gen.ORDER_ATOMIC;
  return [String(num), order];
};

generator.forBlock['math_arithmetic'] = function (block, gen) {
  const OPERATORS = {
    ADD: [' + ', gen.ORDER_ADDITIVE],
    MINUS: [' - ', gen.ORDER_ADDITIVE],
    MULTIPLY: [' * ', gen.ORDER_MULTIPLICATIVE],
    DIVIDE: [' / ', gen.ORDER_MULTIPLICATIVE],
    POWER: [null, gen.ORDER_UNARY_POSTFIX],
  };
  const tuple = OPERATORS[block.getFieldValue('OP')];
  const [opText, order] = tuple;

  if (block.getFieldValue('OP') === 'POWER') {
    const a = gen.valueToCode(block, 'A', gen.ORDER_NONE) || '0';
    const b = gen.valueToCode(block, 'B', gen.ORDER_NONE) || '0';
    return [`pow(${a}, ${b})`, order];
  }
  const a = gen.valueToCode(block, 'A', order) || '0';
  const b = gen.valueToCode(block, 'B', order) || '0';
  return [`${a}${opText}${b}`, order];
};

generator.forBlock['math_single'] = function (block, gen) {
  const op = block.getFieldValue('OP');
  const order = gen.ORDER_UNARY_POSTFIX;
  if (op === 'NEG') {
    const arg = gen.valueToCode(block, 'NUM', gen.ORDER_UNARY_PREFIX) || '0';
    return [`-${arg}`, gen.ORDER_UNARY_PREFIX];
  }
  const arg = gen.valueToCode(block, 'NUM', gen.ORDER_NONE) || '0';
  const CALLS = {
    ABS: 'abs',
    ROOT: 'sqrt',
    LN: 'log',
    LOG10: 'log10',
    EXP: 'exp',
  };
  if (op === 'POW10') {
    return [`pow(10, ${arg})`, order];
  }
  const fn = CALLS[op] || 'abs';
  return [`${fn}(${arg})`, order];
};

generator.forBlock['math_round'] = function (block, gen) {
  const op = block.getFieldValue('OP');
  const arg = gen.valueToCode(block, 'NUM', gen.ORDER_NONE) || '0';
  const CALLS = { ROUND: 'round', ROUNDUP: 'ceil', ROUNDDOWN: 'floor' };
  return [`${CALLS[op] || 'round'}(${arg})`, gen.ORDER_UNARY_POSTFIX];
};

// Arduino's `%` only works on integers; fmod() handles the float variables
// this stage always declares, so it's the correct general-purpose choice.
generator.forBlock['math_modulo'] = function (block, gen) {
  const a = gen.valueToCode(block, 'DIVIDEND', gen.ORDER_NONE) || '0';
  const b = gen.valueToCode(block, 'DIVISOR', gen.ORDER_NONE) || '1';
  return [`fmod(${a}, ${b})`, gen.ORDER_UNARY_POSTFIX];
};

// min()/max() are Arduino core macros, so a..b (in either order) works
// directly without a custom helper.
generator.forBlock['math_random_int'] = function (block, gen) {
  const a = gen.valueToCode(block, 'FROM', gen.ORDER_NONE) || '0';
  const b = gen.valueToCode(block, 'TO', gen.ORDER_NONE) || '0';
  return [`random(min(${a}, ${b}), max(${a}, ${b}) + 1)`, gen.ORDER_UNARY_POSTFIX];
};
