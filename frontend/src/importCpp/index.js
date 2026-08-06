import { parseCpp } from './parser.js';
import { buildProjectFromCpp } from './program.js';
import { ImportContext, ImportRejected } from './errors.js';

export { ImportRejected } from './errors.js';

// "Import C++" -- upload or paste an Arduino sketch and get back blocks,
// best-effort, for genuinely arbitrary C++ (not just this app's own
// generated output). Real tokenizing/parsing (tree-sitter, see parser.js),
// not regex -- C++ syntax (nested expressions, precedence, matching braces,
// escapes) can't be reliably recognized as text patterns.
//
// Supported subset (checked against every block category this app has):
//   - Basic I/O: digitalWrite/Read, analogRead/Write, servo .attach()+.write()
//     (plus the constrain()-wrapped .read()+delta shape that reads back as
//     "change servo angle by"), wait (delay, both "N seconds" and "N ms" shapes)
//   - Sensors: the exact ultrasonic-distance helper function this app's own
//     generator produces (ping sequence + pulseIn + cm conversion)
//   - Sound: tone()+delay() note pairs and a REST delay(), only in this
//     app's own "beats * 250" shape (see sound.js -- "beats" is this app's
//     own invented tempo unit, not something hand-written code would
//     independently happen to match)
//   - IR Remote: IrReceiver.begin/decode+resume (fused, matching the one
//     shape ir_if_received's own generator produces)/decodedIRData access
//     (command, address, raw)/getProtocolString()/repeat-flag check, plus
//     the two pieces of
//     generated scaffolding that read back as block *settings* rather than
//     blocks: the `const uint16_t irAcceptedAddress` declaration and the
//     `decodedIRData.address ==` guard it feeds (ir_start_receiver's
//     accepted-address field), and the whole two-statement decode/timeout
//     tracker behind "held IR command", whose two globals are claimed as
//     bookkeeping and whose reads become the reporter block
//   - Motors: the fixed TB6612FNG drive sequence -- the right motor's
//     (IN1, IN2, PWM) writes then the left motor's, both at the same speed
//     and in a recognized direction pairing, optionally followed by a
//     delay() and the matching stop for the "for N seconds" blocks -- only
//     on the hard-wired pins and only as a whole six-line group, so any
//     other use of those pins still reads back as plain Basic I/O blocks
//   - Serial: Serial.println (Serial.begin is recognized and silently
//     dropped, like pinMode, since it's implicit in every generated sketch)
//   - Control Flow: if/else if/else, while, for (repeat-N-times shape and
//     the literal-bounds counting shape -- a dynamic/non-literal-bounds for
//     loop is NOT supported), forever (while(true) or while(1)), wait until
//     (a `while (!(cond)) {}` spin over an empty body), break/continue
//   - Operators: all comparison/logic/arithmetic operators, unary negate/
//     not, ternary, the math functions each math block generates (sqrt,
//     abs, round/ceil/floor, fmod or bare %, pow, random -- both this app's
//     own min()/max()-wrapped shape and a bare random(a,b))
//   - Variables: global float/int/double/long/bool/String declarations,
//     get/set, and "x = x + delta" as change-by
//   - Lists: a `float name[N];` array paired with its `byte nameLength = 0;`
//     counter, the nine shared helper functions the Lists blocks generate
//     (matched by whole-body shape, so renaming them is fine) and their call
//     sites, plus `nameLength = 0` as "delete all". N has to be one of the
//     sizes the size dropdown offers. Since the declarations are globals with
//     no position of their own in setup()/loop(), the matching "create list"
//     blocks are placed at the top of setup() on the way back in
//   - My Blocks: void CustomFunction(int/float/String/bool params) {...}
//     and its call sites, in any order relative to each other
//
// Explicitly out of scope (will cause a rejection, not a guess): classes/
// structs (besides the one recognized `Servo` variable pattern), arrays other
// than the one recognized list shape above (indexing one directly, in
// particular, has no block -- the Lists blocks are the only way to touch a
// list), pointers, switch/case, #define macros, non-void custom functions,
// dynamic-bounds for loops, bitwise operators (besides the one fixed
// IR-repeat-flag expression), and anything else with no matching block.
//
// Failure handling: the WHOLE import is rejected (nothing is changed in
// the live workspace) if *anything* can't be confidently recognized --
// never a partial import with silently-dropped or silently-wrong pieces.
// Rejected because: an 8-12 year old (or the counselor helping them) has no
// reliable way to notice "some of my program is quietly missing" by just
// looking at the resulting blocks, whereas "this didn't work, here's
// exactly why, on this line" is something they can act on immediately, and
// it never leaves an in-progress edit half-applied. Every recognizer in
// expressions.js/statements.js/program.js records a specific, line-numbered
// reason the moment it gives up -- importCpp() collects every one of them
// (not just the first) before throwing, so one pass shows the whole
// picture rather than a fix-one-see-the-next loop.
export async function importCpp(sourceText) {
  const tree = await parseCpp(sourceText);
  const ctx = new ImportContext();
  const project = buildProjectFromCpp(tree, ctx);
  if (!project || ctx.hasErrors) {
    throw new ImportRejected(ctx.errors);
  }
  return project;
}
