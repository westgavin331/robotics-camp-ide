# Robotics Camp Block IDE

A Blockly workspace that generates Arduino C++ (`.ino`) text live, compiles it
on a small backend (`arduino-cli`), and flashes + talks to a real Arduino Uno
straight from the browser over WebSerial (no local agent/driver install) —
see `docs/robotics-camp-block-ide-spec.md` for the full plan.

Blocks so far: Basic I/O, Sensors, Sound, IR Remote (custom hardware blocks),
a minimal Serial debug helper, plus the standard Blockly Control Flow,
Operators, and Variables categories. Motor blocks (built separately via
Blockly's custom block builder) are not included yet.

## Project structure

```
frontend/                  React + Vite app
  src/
    blockly/
      toolbox.js             Toolbox categories (I/O / Sensors / Sound / IR Remote / Serial / Control Flow / Operators / Variables)
      registerVariablesCategory.js   Adds "change [var] by" into the Variables flyout
      blocks/                 Custom hardware block definitions (JSON)
        io.js                   digitalWrite/Read, analogRead, PWM, servo, wait
        sensors.js              pulseIn wrapper, ultrasonic distance wrapper
        sound.js                tone/note block + note dropdown
        ir.js                   IR receiver start / if-received / get code / repeat flag
        serial.js               print-to-serial debug helper (not in spec, see below)
      generators/arduino/    The Blockly -> Arduino C++ generator
        core.js                 Generator setup: init/finish/scrub_, variable decls, #includes,
                                 setup() line registration, pinMode hoisting, .ino assembly
        logic.js, loops.js, math.js, text.js, variables.js   Standard block categories
        io.js, sensors.js, sound.js, ir.js, serial.js        Custom hardware block categories
    webserial/
      intelHex.js             Parses arduino-cli's .hex text into a flat flash image
      stk500v1.js              STK500v1 programmer (the protocol optiboot speaks)
      serialPort.js            navigator.serial wrappers: port selection, line-buffered
                                monitor read loop, line sender
    components/
      BlocklyWorkspace.jsx  Injects the Blockly workspace, regenerates code on change
      CodeView.jsx           Read-only panel showing the live .ino text
      HardwarePanel.jsx       Connect + Run buttons, Status/Monitor tabs, kid-friendly error banners
    App.jsx                 Layout + "View Code" toggle
    config.js                BACKEND_URL

backend/
  src/index.js              GET /api/health, POST /api/compile
  src/compile.js            arduino-cli pipeline: writes the sketch to a temp dir,
                             runs `arduino-cli compile`, parses JSON output into a
                             clean result (hex + size, or a diagnostics list)
  src/compileQueue.js       Caps concurrent arduino-cli invocations (default 1 --
                             Render free tier is 512MB/0.1 CPU)
```

Adding a new block type means: add its JSON definition to a `blocks/*.js` file
(or a new file, for a new category), add its generator function to `forBlock`
in the matching `generators/arduino/*.js` file, and add a toolbox entry in
`toolbox.js`. Nothing else needs to change.

## Run it locally

Requires Node 18+.

```bash
npm install        # installs both frontend and backend (npm workspaces)
npm run dev         # starts backend on :3001 and frontend on :5173 together
```

Then open **http://localhost:5173**.

(`npm run dev:frontend` / `npm run dev:backend` start just one side, if you want them
in separate terminals.)

## What to check

1. **Layout**: a block category palette on the left (Basic I/O / Sensors /
   Sound / IR Remote / Serial / Control Flow / Operators / Variables), the
   Blockly canvas in the middle, and a code panel on the right showing
   `sketch.ino`.
2. **"Hide Code" / "View Code" button** in the header toggles the right-hand panel.
3. **Live generation**: drag out blocks and confirm the code panel updates
   immediately, with no manual refresh. A minimal test:
   - From **Control Flow**, drag out `when Arduino Uno starts up` -- it comes
     with a `forever` block already snapped in below it.
   - From **Variables**, click "Create variable", name it `x`, drag out
     `set x to`, plug in a `0` (from **Operators**), and snap it directly
     under the hat, **above** the forever block.
   - From **Variables** again, drag `change x by 1` inside the `forever`.
   - The code panel should show something like:
     ```cpp
     float x;

     void setup() {
       x = 0;
     }

     void loop() {
       x = x + 1;
     }
     ```
   - Note `set x to 0` (outside forever) landed in `setup()`, while
     `change x by 1` (inside forever) landed in `loop()`.
4. **No hat block, or blocks not connected under it, produce empty output**
   -- this is intentional (see "Entry point" below), not a bug:
   ```cpp
   void setup() {
   }

   void loop() {
   }
   ```

## Compile pipeline

`POST /api/compile` with `{ "code": "<.ino text>" }` runs `arduino-cli compile
--fqbn arduino:avr:uno` against it and responds with either:

```jsonc
// success
{ "success": true, "hex": "<base64-encoded .hex>", "size": { "program": { "bytes": 924, "maxBytes": 32256 }, "data": { "bytes": 9, "maxBytes": 2048 } } }

// compile error (still HTTP 200 -- a kid's sketch failing to compile is the
// expected/normal case this endpoint exists to handle, not a server error)
{ "success": false, "errors": [{ "line": 6, "column": 3, "severity": "error", "message": "expected ';' before 'x'" }], "rawOutput": "sketch.ino: In function 'void loop()':\n..." }
```

`errors` is arduino-cli's raw GCC diagnostics, regexed out of `compiler_err`
into `{ line, column, severity, message }`, with `note:` lines dropped (GCC's
supplementary context, usually more confusing than useful for a first
compiler error) and the temp-dir path stripped down to just `sketch.ino`.
`rawOutput` keeps the fuller (still path-cleaned) text for a "show details"
view later. A malformed request (no `code`) is a real 400; arduino-cli itself
being missing/misconfigured is a 500 — only an actual compile failure is a
200/`success: false`.

**What's installed locally for this to work** (already done in this
environment, documented here for setting up elsewhere):
- **arduino-cli** — installed to `~/.arduino-cli-bin/arduino-cli` (the
  official install script, no sudo/Homebrew needed). The backend finds it via
  `ARDUINO_CLI_PATH` if set, else that path if it exists, else `arduino-cli`
  on `PATH` — see `resolveArduinoCliPath()` in `compile.js`.
- **`arduino:avr` board core** (`arduino-cli core install arduino:avr`) —
  provides the `arduino:avr:uno` FQBN and bundles the **Servo** library, so
  it needs no separate install.
- **IRremote library** (`arduino-cli lib install "IRremote"`) — the spec
  explicitly calls out that this one *does* need an explicit install, unlike
  Servo. Confirmed it's Armin Joachimsmeyer's fork (`Provides includes:
  IRremote.hpp`, matching what the generator emits).

To set this up on another machine: install arduino-cli, then run
`arduino-cli core install arduino:avr` and `arduino-cli lib install
"IRremote"`. Environment overrides: `ARDUINO_CLI_PATH`, `ARDUINO_FQBN`
(default `arduino:avr:uno`), `COMPILE_TIMEOUT_MS` (default 30000),
`COMPILE_CONCURRENCY` (default 1).

**`COMPILE_CONCURRENCY`**: every `/api/compile` request is queued through
`compileQueue.js`, which only lets this many `arduino-cli` invocations
actually run at once (the rest wait their turn instead of firing all
together). Defaults to 1 because Render's free web service tier is only
512MB RAM / 0.1 CPU (confirmed against render.com/docs/free) — a class-sized
burst of kids clicking Run at the same moment, each spawning a real
avr-gcc-toolchain subprocess with no limit in place, was enough to starve
that sliver of CPU and make the whole service (not just `/api/compile`)
briefly unreachable for everyone. Only worth raising if this ever moves to a
paid instance with real multi-core headroom.

## Upload & Serial Monitor

Browser-only (spec section 1, Path A): `navigator.serial` requests a port,
a hand-rolled STK500v1 implementation flashes the compiled `.hex` directly
over that port (no local agent, no native driver), then the same port is
reopened at the sketch's own baud rate for a live read/write serial monitor.

### The Run button

One button drives the whole pipeline: connect (if not already) → compile →
upload → switch to the Monitor tab. `Connect` still exists separately (to
pick a specific board, or reconnect), but `Run` will trigger the browser's
port picker itself if nothing's connected yet, so a kid only ever has to
remember one button for the common case.

The hardware panel is two tabs -- **Status** (compile/upload progress and
the technical log) and **Monitor** (live serial output + a send box) --
plus a big colored banner above them that always shows one plain-language
line: what's happening now, or what went wrong. The technical detail (line
numbers, raw error text) stays in the Status tab underneath; the banner is
only ever the simple headline, aimed at an 8-12 year old audience per the
spec's camp context. Four failure points are explicitly handled with their
own message, not a raw error dump:

| Situation | Banner |
|---|---|
| No board selected / picker cancelled | "No board was selected. Click Run and choose your Arduino from the list that pops up." |
| Compile error in the blocks | "There's a mistake somewhere in your blocks. Check the details below." |
| Backend unreachable (not the kid's fault) | "Couldn't reach the code-building service. Check with a grown-up and try again." |
| Port already open in another program (e.g. Arduino IDE) | "Your board's port is being used by another program (like the Arduino IDE). Close that program and try again." |
| Board unplugged mid-upload | "Looks like your board got unplugged. Plug it back in and try again." |
| Sync/upload failure, other causes | "Couldn't talk to your board. Check that it's plugged in and try again." |

The "port already open" and "device unplugged" cases are distinguished at
the source rather than guessed from Chrome's error text afterward, which
doesn't reliably tell those apart: `stk500v1.js`'s `resetInto()` tags a
failed `port.open()` with `err.code = 'PORT_OPEN_FAILED'`, and
`HardwarePanel.jsx` does the same for the post-upload monitor reopen. The
"compile error" vs. "backend unreachable" cases are similarly distinguished
by the backend response shape (`compiled.kind`), not string matching.

- **`stk500v1.js`** is hand-rolled, not a third-party library -- there isn't
  a good WebSerial-compatible one. `avrgirl-arduino`'s only "browser"
  pathway (its `stk500`/`stk500-v2`/`browser-serialport` dependencies)
  targets the long-removed Chrome Apps `chrome.serial` API, confirmed by
  reading their actual source, not the modern WebSerial standard; a Leaphy
  Robotics fork inherits the same dead dependencies, and their other
  attempt (a WebAssembly port of real avrdude) is archived and unused in
  their current product.
- **Protocol approach is adapted from Leaphy Robotics' own hand-rolled
  client** (`leaphy-webbased-svelte`, an actively maintained, real-world
  Blockly+Arduino education platform solving the exact same problem this
  project does), after several rounds of hand-debugging against real
  hardware kept finding the failure moving to whichever command came next
  rather than actually going away. Key differences from a naive
  implementation, all confirmed against their proven, currently-working
  code: resets fully close+reopen the port rather than toggling signals on
  a connection that's stayed open, DTR is toggled alone (not DTR+RTS
  together), sync retries are fewer and more patient (10 attempts at
  500ms, with a 57600-baud fallback for older bootloaders) rather than many
  rapid short ones, buffer hygiene is an active drain-until-quiet rather
  than a single instant clear, and response parsing is lenient -- it scans
  accumulated bytes for the INSYNC/OK markers rather than requiring them at
  exact positions, so one stray byte doesn't permanently desync everything
  after it. The full sequence: reset, sync (`GET_SYNC`), read+check chip
  signature, `SET_DEVICE` (bare params, real page size), `ENTER_PROGMODE`,
  128-byte pages via `LOAD_ADDRESS`/`PROG_PAGE`, `LEAVE_PROGMODE`. No
  page-readback verification -- if a byte gets corrupted in transit the
  symptom is the sketch misbehaving, and the fix is just uploading again.
- **Baud rate**: programming baud is decided internally (115200 first,
  optiboot's rate, falling back to 57600); after a successful upload the
  port is closed and reopened at 9600 for the monitor, matching the
  `Serial.begin(9600)` every generated sketch uses (see
  `generators/arduino/serial.js`). This is why Upload always runs an
  upload, even if you only wanted to change what's on the board -- there's
  no "just monitor" button in this stage.
- **Verified without hardware where possible**: `intelHex.js`'s parser was
  checked byte-for-byte against `avr-objcopy`'s own hex-to-binary
  conversion on a real compiled sketch (Servo + IRremote + Serial
  together) -- exact match. The response-parsing and buffer-draining logic
  was checked against mock serial readers (single-chunk replies,
  replies split across multiple reads, noise bursts before a real
  response). The reset/sync/page-write sequence itself was only
  confirmed by testing against a real Uno.

## Saving projects

Two independent layers, matching how camp actually works (same kid, same
laptop, mid-session vs. a different Chromebook on a different day):

- **Autosave (automatic, same device only)**: every change debounce-writes
  the full project (Blockly's own workspace serialization + a snapshot of
  any "My Blocks" custom block definitions -- see below) to the browser's
  `localStorage`, and it's silently restored on the next page load if
  present. No UI, nothing to remember -- it's the safety net for an
  accidental reload or closing/reopening the browser.
- **Named Save/Load (manual, follows a kid across devices)**: the **Save**
  button in the header asks for a name (a kid's own name, or a team name for
  the Day 4+ team portion) and POSTs the same full project state to the
  backend, which stores it in MongoDB Atlas (see "Deploying to production"
  below for why). **Load** lists every saved name and restores whichever one
  is picked -- confirms first, since it replaces whatever's currently on
  screen.

Both layers save/restore `Blockly.serialization.workspaces.save()`'s actual
output, not the generated code text -- a loaded project is fully editable
again, not a read-only dump.

**Why "My Blocks" needs its own snapshot** (`frontend/src/blockly/
myBlocks/registry.js`'s `restoreCustomBlocks`/`resetCustomBlocks`,
`projectIO.js`): custom block *types* (e.g. a kid-made "Blink Twice" block)
only exist as runtime JS state created the moment a kid clicks "Make a
Block" -- Blockly's own serialization has no idea about them, it just
records that some block instance has type `myblock_call_cb3`. Load a
project on a fresh page (or a different Chromebook) without first
recreating that type, and Blockly has nothing to construct those blocks
from. `serializeProject`/`loadProject` (`projectIO.js`) bundle a snapshot of
the custom-block registry alongside the workspace state and replay it
*before* the workspace loads, so this works correctly across devices, not
just same-session.

## Deploying to production

For camp day: backend on Render (Docker, so `arduino-cli` can actually run
server-side) and frontend as a Render static site, so kids visit one real
HTTPS URL over the school's internet instead of your laptop's LAN.
WebSerial's secure-context requirement is satisfied automatically by any
real HTTPS domain with a browser-trusted cert (which Render/Vercel/Netlify
all provide via Let's Encrypt) -- no cert warnings, no `chrome://flags`, no
IP matching, unlike the local mkcert setup.

- **`backend/Dockerfile`** installs arduino-cli + the `arduino:avr` core +
  `IRremote` at *build* time (baked into the image), not at container
  startup -- so a running instance never needs network access to Arduino's
  package index, and the first compile a kid runs isn't slowed down by a
  download. Debian-based (`node:20-bookworm-slim`), not Alpine: the
  prebuilt AVR toolchain arduino-cli downloads is a glibc binary and won't
  run under Alpine's musl libc.
- **`frontend/src/config.js`**'s `BACKEND_URL` is `VITE_BACKEND_URL` (a
  build-time env var) if set, else derived from the page's own origin --
  the latter is what makes local dev and the mkcert LAN setup keep working
  without a `.env` file; the former is what a separately-hosted frontend
  needs, since it's no longer on the same origin as the backend.
- Full step-by-step deploy walkthrough (GitHub push, Render dashboard
  clicks, where to paste the backend's real URL) was walked through
  directly in conversation rather than duplicated here -- the Dockerfile and
  config.js above are the parts that actually needed engineering; the rest
  is dashboard clicking.
- **Free-tier characteristic worth knowing**: Render's free web services
  spin down after ~15 minutes idle and take up to a minute to wake on the
  next request. The first "Run" of the day may just look slow, not broken.

### Named save/load storage: MongoDB Atlas, not Render

Checked directly against Render's own current docs before choosing (not
assumed from memory), because getting this wrong means silently losing
every kid's saved project:

- **Render's free web services have no persistent disk** -- confirmed via
  render.com/docs/disks: "any changes you make to a service's local files
  are lost every time the service redeploys or restarts" on the free tier.
  File-based storage on the backend was never viable here.
- **Render's own free PostgreSQL is durable but expires** -- 30 days after
  creation, then a 14-day grace period, then the database *and everything
  in it* is permanently deleted unless upgraded to a paid plan first. That
  would mean remembering to recreate + migrate data on a recurring
  ~30-40 day cycle indefinitely, forever -- forgetting once means silent,
  unrecoverable data loss for every saved project, the exact failure mode
  this feature exists to avoid.
- **Render's free Key Value (Redis) is worse, not better** -- it's
  in-memory only with no disk persistence at all; data is lost on *any*
  restart, not just after 30 days.
- **MongoDB Atlas's free M0 cluster never expires and never pauses** --
  512MB storage (plenty; a saved project is a few KB of JSON), no credit
  card, no time limit. The tradeoff is a second account/provider to set up,
  outside Render -- worth it here given the alternative is an ongoing
  maintenance task with a real chance of silently wiping camper data.

**One-time setup** (a few minutes, then never touched again):

1. Create a free account at [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register).
2. Create a free **M0** cluster (the free tier is offered during the
   creation flow -- don't pick a paid tier).
3. **Database Access** (left sidebar) → add a database user with a
   generated password -- save it somewhere, you'll paste it into the
   connection string next.
4. **Network Access** (left sidebar) → Add IP Address → "Allow Access from
   Anywhere" (`0.0.0.0/0`). Render's outbound IPs aren't fixed on the free
   tier, so this is the practical option; the database user's password is
   still required for anyone to actually read/write data.
5. **Database → Connect → Drivers** → copy the connection string (looks
   like `mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/`) and
   fill in the real password from step 3.
6. On Render, open the backend service → **Environment** → add
   `MONGODB_URI` set to that connection string → save (Render redeploys
   automatically). For local dev, copy `backend/.env.example` to
   `backend/.env` and paste it there instead.

No other code changes needed -- `backend/src/db.js` connects lazily on the
first save/load request, so the rest of the app (compile/upload) keeps
working even if this is skipped or misconfigured; only Save/Load themselves
would show a "couldn't reach the save service" message.

## Known stage-1 simplifications

- **All variables are declared as `float`.** Blockly variables are untyped;
  float is the simplest single type covering both whole numbers and decimals.
  Assigning a text/string result to a variable will not produce code that
  actually compiles in the Arduino IDE yet — typed variables are a later-stage
  concern, once hardware I/O blocks (which care about int pin numbers) are added.
- **Entry point: `when Arduino Uno starts up`.** A Scratch-style hat block
  (`blocks/hat.js`, no previous connection, blocks stack underneath it) is
  the single required root for code generation, per spec section 5's later
  decisions -- see `generateArduinoCode()` in `generators/arduino/core.js`.
  Blocks not connected underneath it (including everything, if there's no
  hat block at all) are ignored entirely, not swept into `loop()` the way
  top-level blocks used to be. Direct children of the hat that aren't a
  `forever` block go into `setup()`; a `forever` block's *contents* (not the
  block itself) become `loop()`. A `forever` used anywhere else (nested
  inside an `if`, another loop, etc.) means a genuine `while (true)` instead
  -- only the one directly under the hat gets the special treatment.
  `forever` itself is custom (`blocks/forever.js`): stock Blockly has no
  built-in infinite-loop block, matching Scratch's own "forever" not being
  a core concept either.
- Text blocks (`join`, `letter of`, `length of`, "contains") are generated
  using Arduino's `String` class.
- **`pinMode()` is auto-generated, hoisted to `setup()` when the pin is a
  literal number** (the common case), deduplicated per pin+mode. If a pin is
  a variable/expression instead of a literal, there's no single value to
  hoist, so digital-write/PWM blocks inline the `pinMode()` call at the
  point of use instead, and digital-read/pulse blocks skip it (Arduino pins
  default to `INPUT` at boot anyway).
- **Servo**: each literal pin gets its own global `Servo` object, attached
  once in `setup()`. A dynamic pin falls back to one shared object that
  re-attaches on every write — correct, just not as clean.
  `change servo angle by` needs the servo's current position, and takes it
  from the library rather than tracking its own copy: `Servo::read()` returns
  the angle passed to the last `write()` (90° for a servo not written yet),
  so it emits `servo.write(constrain(servo.read() + delta, 0, 180))`. The
  clamp is load-bearing — `Servo::write()` treats anything ≥ 544 as a pulse
  width in microseconds, not an angle.
- **Distance sensor** (`read distance`) wraps the trigger-pulse + `pulseIn()`
  + cm conversion in a single generated helper function, since it needs
  several statements but is used as a value (an expression can't contain
  statements inline).
- **Sound**: 1 "beat" is a fixed 250ms (no tempo block yet), and `tone()` is
  always followed by a matching `delay()` so sequential notes play in order
  instead of overlapping (`tone()` itself returns immediately).
- **IR Remote**: "IR signal received?" is a compound `if IR signal received
  [DO]` block, not a plug-anywhere boolean like the spec table's wording
  suggests. A value block can't inject a statement (`IrReceiver.resume()`)
  into whichever block happens to be using it, so the only way to
  *guarantee* resume() always runs (the actual point of the spec's design
  note) is to bake the if/resume pairing into one block. `IR repeat
  received?` has no such requirement and is a normal boolean, usable inside
  the if's body (e.g. nest a stock `if` on it to tell new codes from repeats).
- **`serial_print` ("print ... to serial") is a minimal addition, not from
  spec section 2.** There's no real "print" block in the spec at all --
  Serial Monitor is explicitly a separate later stage (spec section 1,
  WebSerial-based). This one block exists only so IR/sensor values have
  somewhere to go for manual testing in the meantime; expect it to be
  folded into a proper category once that stage lands.
- **WebSerial requires Chrome or Edge** over `http://localhost` or HTTPS
  (Safari/Firefox don't implement it — the Connect button is disabled with a
  warning if `navigator.serial` isn't present).
- **Single target board**: everything assumes an Arduino Uno (ATmega328P,
  optiboot, 115200 programming baud, 128-byte pages) — matches the spec's
  fixed camp hardware, not a general multi-board uploader.
- If something else has the port open (e.g. the Arduino IDE's own Serial
  Monitor), `requestPort()`/`open()` will fail — close it there first.
