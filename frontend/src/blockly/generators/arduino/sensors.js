import { arduinoGenerator as generator } from './core.js';

// "Raw" per the spec: just pulseIn(), no automatic pin setup -- kids who
// need the pin configured a particular way (e.g. INPUT_PULLUP) do that
// themselves with an io_digital_read/write block first.
generator.forBlock['sensor_pulse_read'] = function (block, gen) {
  const pin = gen.valueToCode(block, 'PIN', gen.ORDER_NONE) || '0';
  const state = block.getFieldValue('STATE');
  const timeout = gen.valueToCode(block, 'TIMEOUT', gen.ORDER_NONE) || '1000000';
  return [`pulseIn(${pin}, ${state}, ${timeout})`, gen.ORDER_UNARY_POSTFIX];
};

// The "higher-level wrapper" the spec calls for: trigger pulse + pulseIn +
// cm conversion, all inside one reusable helper function (emitted once via
// provideFunction_) so this can still be used as a plain value expression
// even though building the reading takes several statements.
generator.forBlock['sensor_read_distance'] = function (block, gen) {
  const trig = gen.valueToCode(block, 'TRIG', gen.ORDER_NONE) || '0';
  const echo = gen.valueToCode(block, 'ECHO', gen.ORDER_NONE) || '0';

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
