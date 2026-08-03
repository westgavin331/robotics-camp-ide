import { arduinoGenerator as generator } from './core.js';

// TB6612FNG wiring is fixed for this app's one robot chassis, so these are
// plain constants rather than block fields (see blocks/motors.js).
const RIGHT = { in1: 2, in2: 4, pwm: 3 }; // motor A
const LEFT = { in1: 7, in2: 8, pwm: 5 }; // motor B

// IN1=HIGH/IN2=LOW spins a motor clockwise, IN1=LOW/IN2=HIGH spins it
// counter-clockwise (standard TB6612FNG direction truth table). The two
// motors face opposite ways on the chassis, so driving the robot forward
// means turning the right motor counter-clockwise and the left one
// clockwise -- and a spin-in-place means giving both motors the *same*
// electrical direction, which is why the two turn rows below are the ones
// with matching pairs.
const MOVEMENTS = {
  FORWARD: { right: ['LOW', 'HIGH'], left: ['HIGH', 'LOW'] },
  BACKWARD: { right: ['HIGH', 'LOW'], left: ['LOW', 'HIGH'] },
  RIGHT: { right: ['HIGH', 'LOW'], left: ['HIGH', 'LOW'] }, // right wheel back, left wheel forward
  LEFT: { right: ['LOW', 'HIGH'], left: ['LOW', 'HIGH'] }, // right wheel forward, left wheel back
};

function driveMotor(gen, motor, in1State, in2State, speedCode) {
  gen.reservePinMode(motor.in1, 'OUTPUT');
  gen.reservePinMode(motor.in2, 'OUTPUT');
  gen.reservePinMode(motor.pwm, 'OUTPUT');
  return (
    `digitalWrite(${motor.in1}, ${in1State});\n` +
    `digitalWrite(${motor.in2}, ${in2State});\n` +
    `analogWrite(${motor.pwm}, ${speedCode});\n`
  );
}

// The right motor's three lines then the left motor's three, always in that
// order -- importCpp/statements.js recognizes exactly this shape to turn the
// code back into one of these blocks.
function driveBoth(gen, dir, speedCode) {
  const move = MOVEMENTS[dir];
  return (
    driveMotor(gen, RIGHT, move.right[0], move.right[1], speedCode) +
    driveMotor(gen, LEFT, move.left[0], move.left[1], speedCode)
  );
}

// Both direction pins LOW is the TB6612's "stop" state; the PWM write to 0
// makes it a full stop regardless of what the driver was doing before.
function stopBoth(gen) {
  return driveMotor(gen, RIGHT, 'LOW', 'LOW', '0') + driveMotor(gen, LEFT, 'LOW', 'LOW', '0');
}

// The timed blocks stop themselves; the "set" ones deliberately don't, so a
// kid can leave the motors running across their own loop/wait blocks.
function timedMove(block, gen) {
  const dir = block.getFieldValue('DIR');
  const speed = gen.valueToCode(block, 'SPEED', gen.ORDER_NONE) || '0';
  const time = gen.valueToCode(block, 'TIME', gen.ORDER_MULTIPLICATIVE) || '0';
  return driveBoth(gen, dir, speed) + `delay(${time} * 1000);\n` + stopBoth(gen);
}

function untimedMove(block, gen) {
  const dir = block.getFieldValue('DIR');
  const speed = gen.valueToCode(block, 'SPEED', gen.ORDER_NONE) || '0';
  return driveBoth(gen, dir, speed);
}

generator.forBlock['motor_drive_for'] = timedMove;
generator.forBlock['motor_turn_for'] = timedMove;
generator.forBlock['motor_set_drive'] = untimedMove;
generator.forBlock['motor_set_turn'] = untimedMove;

generator.forBlock['motor_stop'] = function (block, gen) {
  return stopBoth(gen);
};
