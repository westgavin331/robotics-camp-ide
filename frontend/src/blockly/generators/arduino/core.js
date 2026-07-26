import * as Blockly from 'blockly/core';

// Custom Blockly code generator that emits an Arduino .ino sketch (C++) instead
// of any of Blockly's built-in target languages. Block-specific translations
// live in the sibling files (logic.js, loops.js, math.js, text.js, variables.js)
// and register themselves onto `arduinoGenerator.forBlock`.
export const arduinoGenerator = new Blockly.Generator('Arduino');

// Operator precedence, lowest to highest. valueToCode() uses this to decide
// whether a nested expression needs parentheses around it.
arduinoGenerator.ORDER_ATOMIC = 0; // literals, variables, function calls
arduinoGenerator.ORDER_UNARY_POSTFIX = 1;
arduinoGenerator.ORDER_UNARY_PREFIX = 2; // ! -
arduinoGenerator.ORDER_MULTIPLICATIVE = 3; // * / %
arduinoGenerator.ORDER_ADDITIVE = 4; // + -
arduinoGenerator.ORDER_RELATIONAL = 5; // < <= > >=
arduinoGenerator.ORDER_EQUALITY = 5; // == !=
arduinoGenerator.ORDER_LOGICAL_AND = 6; // &&
arduinoGenerator.ORDER_LOGICAL_OR = 7; // ||
arduinoGenerator.ORDER_CONDITIONAL = 8; // ?:
arduinoGenerator.ORDER_ASSIGNMENT = 9; // =
arduinoGenerator.ORDER_NONE = 99;

// Arduino/C++ keywords and core API names that generated variable names must
// not collide with.
const RESERVED_WORDS = [
  'setup', 'loop', 'if', 'else', 'for', 'while', 'do', 'switch', 'case',
  'break', 'continue', 'return', 'goto', 'void', 'int', 'float', 'double',
  'long', 'short', 'char', 'byte', 'boolean', 'bool', 'String', 'const',
  'static', 'struct', 'class', 'true', 'false', 'HIGH', 'LOW', 'INPUT',
  'OUTPUT', 'INPUT_PULLUP', 'digitalWrite', 'digitalRead', 'analogWrite',
  'analogRead', 'delay', 'delayMicroseconds', 'millis', 'micros', 'pinMode',
  'Serial', 'random', 'randomSeed', 'constrain', 'min', 'max', 'abs', 'sqrt',
  'pow', 'map', 'tone', 'noTone', 'pulseIn', 'attachInterrupt',
  'detachInterrupt',
].join(',');

arduinoGenerator.init = function init(workspace) {
  // #include lines, kept separate from definitions_ and always emitted first
  // so a block that both #includes a library and declares an instance of one
  // of its types (e.g. Servo) can never emit them in the wrong order.
  this.includes_ = Object.create(null);
  // Global variable/object declarations, keyed so repeated blocks referencing
  // the same variable/pin only emit one declaration.
  this.definitions_ = Object.create(null);
  // Lines contributed to setup(), keyed the same way as definitions_.
  this.setups_ = Object.create(null);

  this.nameDB_ = new Blockly.Names(RESERVED_WORDS);
  this.nameDB_.setVariableMap(workspace.getVariableMap());
};

// Registers a workspace variable so it gets a global `float` declaration.
// All variables are declared as float for this stage: Blockly variables are
// untyped, and float is the simplest single type that covers both whole
// numbers and decimals without per-variable type inference. This is a known
// simplification -- assigning a string/text result to a variable will not
// produce a compilable sketch until typed variables are added later.
arduinoGenerator.addVariable = function addVariable(name) {
  this.definitions_['var_' + name] = `float ${name};`;
};

arduinoGenerator.addInclude = function addInclude(key, includeLine) {
  this.includes_[key] = includeLine;
};

arduinoGenerator.addSetup = function addSetup(key, line) {
  this.setups_[key] = line;
};

// Hoists a `pinMode(pin, mode)` call to setup() when the pin is a literal
// number, deduplicated by pin+mode so the same pin is never configured
// twice. When the pin is a dynamic expression (a variable or another block),
// there's no single setup-time value to hoist, so the caller gets an inline
// statement to run immediately before using the pin instead. Returns ''
// for the hoisted case (the setup() line was already registered as a
// side effect) or a `pinMode(...);\n` string for the inline case.
arduinoGenerator.reservePinMode = function reservePinMode(pinCode, mode) {
  const trimmed = pinCode.trim();
  if (/^\d+$/.test(trimmed)) {
    this.addSetup(`pinMode_${trimmed}_${mode}`, `pinMode(${trimmed}, ${mode});`);
    return '';
  }
  return `pinMode(${pinCode}, ${mode});\n`;
};

arduinoGenerator.scrub_ = function scrub_(block, code, opt_thisOnly) {
  const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
  const nextCode = opt_thisOnly ? '' : this.blockToCode(nextBlock);
  return code + nextCode;
};

// Assembles the final .ino text: #includes, global variable declarations,
// then setup() and loop(). setupCode/loopCode are the two buckets
// generateArduinoCode() below sorts the entry-point hat's children into;
// this only handles final assembly, not the sorting itself.
arduinoGenerator.finish = function finish(setupCode, loopCode) {
  const includes = Object.values(this.includes_);
  const definitions = Object.values(this.definitions_);
  const hoistedSetupLines = Object.values(this.setups_);

  const includesText = includes.length ? `${includes.join('\n')}\n\n` : '';
  const defsText = definitions.length ? `${definitions.join('\n')}\n\n` : '';

  // Hoisted lines (pinMode, Servo.attach, IrReceiver.begin, Serial.begin --
  // anything a block registered as a setup-time side effect via addSetup())
  // always run before the kid's own explicit setup blocks, regardless of
  // which blocks originally triggered them or where in the chain they sit.
  const fullSetupCode = hoistedSetupLines.length ? `${hoistedSetupLines.join('\n')}\n${setupCode}` : setupCode;
  const setupBody = fullSetupCode ? this.prefixLines(fullSetupCode, this.INDENT) : '';
  // loopCode comes from statementToCode() (see generateArduinoCode below),
  // which already indents its result one level for use inside braces --
  // indenting it again here would double it up.
  const loopBody = loopCode;

  return (
    `${includesText}${defsText}` +
    `void setup() {\n${setupBody}}\n\n` +
    `void loop() {\n${loopBody}}\n`
  );
};

// "when Arduino Uno starts up" (arduino_start) is the single required entry
// point -- see blocks/hat.js. Blocks not connected underneath it (including
// every block in the workspace, if there's no hat at all) are ignored
// entirely, not swept into loop() the way top-level blocks used to be.
//
// This deliberately doesn't use Blockly's own workspaceToCode(), which just
// concatenates every top-level block's code -- that has no way to express
// "ignore everything except one specific block's chain" or "this one child
// block's contents go to a different function than its siblings". Instead
// it walks the hat's own next-chain by hand: a direct child that's a
// `controls_forever` block has its contents (not the block itself) pulled
// into loop(); every other direct child's own code goes into setup(). A
// forever block anywhere else (nested inside an if, or inside another
// loop) is untouched by this walk and falls through to its normal
// generator in loops.js, which emits a genuine `while (true)`.
export function generateArduinoCode(workspace) {
  arduinoGenerator.init(workspace);

  const hatBlock = workspace.getTopBlocks(true).find((block) => block.type === 'arduino_start');
  if (!hatBlock) {
    return arduinoGenerator.finish('', '');
  }

  let setupCode = '';
  let loopCode = '';
  let child = hatBlock.getNextBlock();
  while (child) {
    if (child.type === 'controls_forever') {
      loopCode += arduinoGenerator.statementToCode(child, 'DO');
    } else {
      // opt_thisOnly=true: this block's own code only, not its next
      // sibling's too -- the surrounding while loop is what advances the
      // chain, since siblings can land in different buckets.
      setupCode += arduinoGenerator.blockToCode(child, true);
    }
    child = child.getNextBlock();
  }

  return arduinoGenerator.finish(setupCode, loopCode);
}
