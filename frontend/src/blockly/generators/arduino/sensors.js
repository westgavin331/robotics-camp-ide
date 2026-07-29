import { arduinoGenerator as generator } from './core.js';

// The "higher-level wrapper" the spec calls for: trigger pulse + pulseIn +
// cm conversion, all inside one reusable helper function (emitted once via
// provideFunction_) so this can still be used as a plain value expression
// even though building the reading takes several statements.
generator.forBlock['sensor_read_distance'] = function (block, gen) {
  const trig = block.getFieldValue('TRIG');
  const echo = block.getFieldValue('ECHO');

  const fnName = gen.provideFunction_('readDistanceCM', [
    `float ${gen.FUNCTION_NAME_PLACEHOLDER_}(int trigPin, int echoPin) {`,
    '  pinMode(trigPin, OUTPUT);',
    '  pinMode(echoPin, INPUT);',
    '  digitalWrite(trigPin, LOW);',
    '  delayMicroseconds(2);',
    '  digitalWrite(trigPin, HIGH);',
    '  delayMicroseconds(10);',
    '  digitalWrite(trigPin, LOW);',
    '  long duration = pulseIn(echoPin, HIGH);',
    '  return duration * 0.034 / 2;',
    '}',
  ]);

  return [`${fnName}(${trig}, ${echo})`, gen.ORDER_UNARY_POSTFIX];
};
