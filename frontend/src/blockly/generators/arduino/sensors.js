import { arduinoGenerator as generator } from './core.js';

// The "higher-level wrapper" the spec calls for: trigger pulse + pulseIn +
// cm conversion, all inside one reusable helper function (emitted once via
// provideFunction_) so this can still be used as a plain value expression
// even though building the reading takes several statements.
generator.forBlock['sensor_read_distance'] = function (block, gen) {
  const trig = block.getFieldValue('TRIG');
  const echo = block.getFieldValue('ECHO');

  // pulseIn gets an explicit 60ms timeout (vs. Arduino's 1s default) since
  // this sensor's max range is ~5m -- a real echo never takes anywhere near
  // 1s, so there's no reason a missed ping should stall the loop that long.
  // NOTE: this is deliberately generous, not tight -- the AVR core's pulseIn
  // shares its timeout budget across ALL its internal wait phases (clearing
  // any stale pulse, waiting for the new one to start, AND measuring it),
  // not just "waiting to start" like the reference docs imply (see
  // arduino/Arduino#3112), so a too-tight timeout can silently truncate
  // long-distance readings well before the nominal timeout value.
  // The trailing delay(60) enforces the sensor's required recycle time
  // between trigger pulses (HC-SR04 datasheet: ~60ms) so back-to-back calls
  // from a tight loop can't retrigger it before the previous ping/echo has
  // fully settled -- without this, every other call catches the sensor
  // mid-cycle and gets a bogus 0.
  const fnName = gen.provideFunction_('readDistanceCM', [
    `float ${gen.FUNCTION_NAME_PLACEHOLDER_}(int trigPin, int echoPin) {`,
    '  pinMode(trigPin, OUTPUT);',
    '  pinMode(echoPin, INPUT);',
    '  digitalWrite(trigPin, LOW);',
    '  delayMicroseconds(2);',
    '  digitalWrite(trigPin, HIGH);',
    '  delayMicroseconds(10);',
    '  digitalWrite(trigPin, LOW);',
    '  long duration = pulseIn(echoPin, HIGH, 60000);',
    '  delay(60);',
    '  return duration * 0.034 / 2;',
    '}',
  ]);

  return [`${fnName}(${trig}, ${echo})`, gen.ORDER_UNARY_POSTFIX];
};
