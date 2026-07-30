import { arduinoGenerator as generator } from './core.js';

// TB6612FNG wiring is fixed for this app's one robot chassis, so these are
// plain constants rather than block fields (see blocks/motors.js).
const AIN1 = 2;
const AIN2 = 4;
const BIN1 = 7;
const BIN2 = 8;
const PWMA = 3;
const PWMB = 5;

// IN1=HIGH/IN2=LOW spins a motor clockwise, IN1=LOW/IN2=HIGH spins it
// counter-clockwise (standard TB6612FNG direction truth table). Each block
// just picks the HIGH/LOW pair for its motor's "forward"/"backward", per
// the mounting-direction mapping described in blocks/motors.js.
function driveMotor(gen, in1Pin, in2Pin, pwmPin, in1State, in2State, speedCode) {
  gen.reservePinMode(in1Pin, 'OUTPUT');
  gen.reservePinMode(in2Pin, 'OUTPUT');
  gen.reservePinMode(pwmPin, 'OUTPUT');
  return (
    `digitalWrite(${in1Pin}, ${in1State});\n` +
    `digitalWrite(${in2Pin}, ${in2State});\n` +
    `analogWrite(${pwmPin}, ${speedCode});\n`
  );
}

generator.forBlock['motor_right_forward'] = function (block, gen) {
  const speed = gen.valueToCode(block, 'SPEED', gen.ORDER_NONE) || '0';
  return driveMotor(gen, AIN1, AIN2, PWMA, 'LOW', 'HIGH', speed);
};

generator.forBlock['motor_right_backward'] = function (block, gen) {
  const speed = gen.valueToCode(block, 'SPEED', gen.ORDER_NONE) || '0';
  return driveMotor(gen, AIN1, AIN2, PWMA, 'HIGH', 'LOW', speed);
};

generator.forBlock['motor_left_forward'] = function (block, gen) {
  const speed = gen.valueToCode(block, 'SPEED', gen.ORDER_NONE) || '0';
  return driveMotor(gen, BIN1, BIN2, PWMB, 'HIGH', 'LOW', speed);
};

generator.forBlock['motor_left_backward'] = function (block, gen) {
  const speed = gen.valueToCode(block, 'SPEED', gen.ORDER_NONE) || '0';
  return driveMotor(gen, BIN1, BIN2, PWMB, 'LOW', 'HIGH', speed);
};
