# Robotics Camp Block-Coding Web IDE — MVP Spec

Derived from the 10-day Maeser Robotics Camp curriculum + your block screenshots. Goal: a Scratch/PictoBlox-style web editor that generates Arduino C++, compiles it, uploads it to an Arduino Uno, and gives kids a live serial monitor.

---

## 1. Architecture recommendation

**Don't build this from zero — fork Ardublockly.** It's an open-source project (Google Blockly + Arduino code generation + compile/upload pipeline) that already solves ~70% of this problem: Blockly workspace → Arduino C++ string → arduino-cli compile → upload. You'd be adding a custom block set (IR remote, ultrasonic, servo, motor driver, sound) and a browser-based serial monitor, not building a compiler pipeline from scratch.

**Core stack:**
- **Frontend:** Blockly (the actual Google library MIT's Scratch descendant + PictoBlox are built on). You define custom blocks in JS + a code generator function per block that emits the matching Arduino C++ line(s).
- **Compile:** a small backend service running `arduino-cli compile --fqbn arduino:avr:uno`, with `Servo` and `IRremote` libraries pre-installed. Browser sends the generated `.ino` text, backend returns a `.hex`.
- **Upload + Serial Monitor: Path A — pure browser WebSerial API.** Decided: camp laptops are Chromebooks, which rules out a local companion agent, and WebSerial is fully supported in ChromeOS's Chrome browser. Flow:
  1. Frontend generates the `.ino` from the Blockly workspace.
  2. Sends it to the cloud backend, which runs `arduino-cli compile --fqbn arduino:avr:uno` and returns a `.hex`.
  3. Browser requests the serial port via `navigator.serial.requestPort()`, and a JS-side AVR bootloader implementation (STK500v1 — what optiboot on an Uno speaks) flashes the `.hex` directly over WebSerial. No native install, no local agent.
  4. The same open port is then reused for the live serial monitor (read/write loop).

  Logistics note: each kid's browser tab has to grant port permission the first time (native Chrome permission prompt) — worth a 30-second "click Connect, pick your Arduino's port" habit on Day 2.

**Serial Monitor:** just a scrolling read buffer + optional send box on top of the same WebSerial connection.

---

## 2. Full block palette, mapped to the curriculum

### Basic I/O (Day 1–2)
| Block | Maps to |
|---|---|
| set digital pin [X] to [HIGH/LOW] | `digitalWrite()` |
| read digital pin [X] | `digitalRead()` — buttons |
| read analog pin [X] | `analogRead()` — potentiometer |
| set PWM pin [X] to [0–255] | `analogWrite()` |
| set servo pin [X] angle [0–180] | `Servo.write()`, needs `Servo` lib |
| wait [X] seconds/ms | `delay()` |

### Motors (Day 4+, car driving)
Handled separately by the user via Blockly's custom block builder — not part of this generated set.

### Sensors (Day 5)
| Block | Maps to |
|---|---|
| read pulse pin [X] timeout [X] | `pulseIn()` — raw |
| read distance (trig [X], echo [X]) | higher-level wrapper: trigger pulse + `pulseIn()` + convert to cm |

### IR Remote (Day 6) — custom blocks over the IRremote library
Mapping to `IRremote` (Armin Joachimsmeyer's fork, the current standard):

| Block | IRremote call |
|---|---|
| `start IR receiver on pin [X]` | `IrReceiver.begin(X, ENABLE_LED_FEEDBACK)` — goes in setup |
| `IR signal received?` (boolean, used in an `if`) | `IrReceiver.decode()` |
| `get IR code` | `IrReceiver.decodedIRData.decodedRawData` (or `.command` for just the 8-bit command byte) |
| `IR repeat received?` (boolean) | `IrReceiver.decodedIRData.flags & IRDATA_FLAGS_IS_REPEAT` |

**Design suggestion:** auto-generate `IrReceiver.resume()` right after any code inside an "if IR signal received?" block, rather than exposing resume() as its own block. Forgetting to call resume() is the #1 IRremote bug, and kids shouldn't need to think about buffer management.

### Sound
| Block | Maps to |
|---|---|
| play pin [X] note [X] for [X] beats | `tone(pin, frequency, duration)`, with a note→frequency lookup table (C4, D4, etc.) baked into the generator |

### Control flow (Day 3 + general)
`if/then`, `if/then/else`, `while [cond] repeat`, `repeat until [cond]`, `repeat [N]`, `forever`, `count with i from [X] to [Y] by step [Z]`, `break`, `continue`, `wait until [cond]` — standard Blockly control blocks.

### Operators
`+ − × ÷`, `> < =`, `and/or/not`, `join`, `letter [N] of`, `length of`, `[X] contains [Y]?`, `mod`, `round`, `abs`, `pick random [X] to [Y]` — standard Blockly math/text/logic blocks.

### Variables
Standard Blockly variable get/set/change blocks — needed from Day 3 onward.

### Interrupts
Maps to `attachInterrupt()` / `detachInterrupt()`. Not required by the written curriculum (everything is polling-based) — low priority, stretch block only.

---

## 3. MVP priority

**Must work by Day 4 (build day):** digital/analog I/O, PWM, servo, if/else, comparisons, variables, wait, motor blocks.
**Must work by Day 6:** distance/pulse block, IR receiver blocks, loops (while/repeat until/forever).
**Nice-to-have, can slip:** sound/tone block, interrupts, `count with i`/step-loop.
**Skip for v1 unless requested:** custom procedures ("My Blocks")/lists.

---

## 4. Backend library requirements
- `Servo` (not bundled with the AVR core despite being an Arduino-maintained lib — `arduino-cli lib install "Servo"`)
- `IRremote` (Armin Joachimsmeyer's version — `arduino-cli lib install "IRremote"`)
- Everything else is raw pin I/O, no library needed.

---

## 5. Decisions
1. Motor driver blocks — handled separately via Blockly's custom block builder, not part of this spec.
2. **"View code" toggle: confirmed, include it.** Kids can flip between the block workspace and the generated Arduino C++ (same pattern as PictoBlox's code view).
