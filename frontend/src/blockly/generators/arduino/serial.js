import { arduinoGenerator as generator } from './core.js';

generator.forBlock['serial_print'] = function (block, gen) {
  const value = gen.valueToCode(block, 'VALUE', gen.ORDER_NONE) || '""';
  gen.addSetup('serial_begin', 'Serial.begin(9600);');
  return `Serial.println(${value});\n`;
};
