import { arduinoGenerator as generator } from './core.js';

function quote(str) {
  return `"${String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

generator.forBlock['text'] = function (block) {
  return [quote(block.getFieldValue('TEXT')), generator.ORDER_ATOMIC];
};

// shadow_text (blocks/textShadow.js) is a quote-icon-free stand-in for
// `text` used only as a default shadow -- same TEXT field, same output, so
// it generates identically.
generator.forBlock['shadow_text'] = generator.forBlock['text'];

// String operations (join / letter of / length of / contains) all go
// through Arduino's String class, since raw char* isn't practical for kids
// to compose. Any value fed in gets wrapped with String(...) so numbers and
// literals both work as operands.
generator.forBlock['text_join'] = function (block, gen) {
  const itemCount = block.itemCount_ || 0;
  if (itemCount === 0) {
    return [quote(''), gen.ORDER_ATOMIC];
  }
  const items = [];
  for (let i = 0; i < itemCount; i++) {
    const value = gen.valueToCode(block, 'ADD' + i, gen.ORDER_NONE) || quote('');
    items.push(`String(${value})`);
  }
  if (items.length === 1) {
    return [items[0], gen.ORDER_UNARY_POSTFIX];
  }
  return [items.join(' + '), gen.ORDER_ADDITIVE];
};

generator.forBlock['text_length'] = function (block, gen) {
  const value = gen.valueToCode(block, 'VALUE', gen.ORDER_NONE) || quote('');
  return [`String(${value}).length()`, gen.ORDER_UNARY_POSTFIX];
};

generator.forBlock['text_isEmpty'] = function (block, gen) {
  const value = gen.valueToCode(block, 'VALUE', gen.ORDER_NONE) || quote('');
  return [`(String(${value}).length() == 0)`, gen.ORDER_ATOMIC];
};

// Blockly's stock text_indexOf returns a position (or -1), which is what
// "contains" from the spec's block list maps to when combined with a
// comparison block (e.g. `indexOf(...) != -1`).
generator.forBlock['text_indexOf'] = function (block, gen) {
  const value = gen.valueToCode(block, 'VALUE', gen.ORDER_NONE) || quote('');
  const find = gen.valueToCode(block, 'FIND', gen.ORDER_NONE) || quote('');
  const method = block.getFieldValue('END') === 'FIRST' ? 'indexOf' : 'lastIndexOf';
  return [`String(${value}).${method}(${find})`, gen.ORDER_UNARY_POSTFIX];
};

generator.forBlock['text_charAt'] = function (block, gen) {
  const where = block.getFieldValue('WHERE') || 'FROM_START';
  const value = gen.valueToCode(block, 'VALUE', gen.ORDER_NONE) || quote('');
  const str = `String(${value})`;

  if (where === 'FIRST') {
    return [`${str}.charAt(0)`, gen.ORDER_UNARY_POSTFIX];
  }
  if (where === 'LAST') {
    return [`${str}.charAt(${str}.length() - 1)`, gen.ORDER_UNARY_POSTFIX];
  }
  if (where === 'RANDOM') {
    return [`${str}.charAt(random(${str}.length()))`, gen.ORDER_UNARY_POSTFIX];
  }
  const at = gen.valueToCode(block, 'AT', gen.ORDER_NONE) || '1';
  if (where === 'FROM_END') {
    return [`${str}.charAt(${str}.length() - (${at}))`, gen.ORDER_UNARY_POSTFIX];
  }
  // FROM_START: Blockly's "letter 1 of" is 1-indexed.
  return [`${str}.charAt((${at}) - 1)`, gen.ORDER_UNARY_POSTFIX];
};
