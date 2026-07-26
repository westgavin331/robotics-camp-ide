// STK500v1 programmer for Arduino Uno / optiboot, over raw WebSerial byte
// streams (per spec section 1: no local agent, browser-only).
//
// This is hand-rolled rather than a third-party library, because there
// isn't a good WebSerial-compatible one to use: avrgirl-arduino's only
// "browser" pathway (its `stk500`/`stk500-v2`/`browser-serialport`
// dependencies) targets the long-removed Chrome Apps `chrome.serial` API,
// confirmed by reading their actual source -- not the modern WebSerial
// standard. A Leaphy Robotics fork (`leaphy-avrgirl-arduino`) inherits the
// same dead dependencies. Their other attempt, a WebAssembly port of real
// avrdude, is archived and not used in their current product either.
//
// The actual approach here is adapted from what IS proven and currently
// working: Leaphy Robotics' own hand-rolled client
// (packages/client/src/lib/programmers/STK500v1/STK500v1.ts in
// github.com/leaphy-robotics/leaphy-webbased-svelte), an actively
// maintained, real-world-deployed Blockly+Arduino education platform
// serving students on Chromebooks -- i.e. the same problem this project
// has. Several details here differ from an earlier from-scratch attempt
// specifically because that attempt didn't match what's proven to work:
// resets fully close+reopen the port rather than just toggling signals on
// an already-open one, DTR is toggled alone (not DTR+RTS together), sync
// retries are fewer and more patient (10 attempts at 500ms, not many rapid
// short ones), buffer hygiene is an active drain-until-quiet rather than a
// single instant clear, and response parsing is lenient (scans accumulated
// bytes for markers rather than requiring them at exact positions).

const STK = {
  OK: 0x10,
  INSYNC: 0x14,
  NOSYNC: 0x15,
  GET_SYNC: 0x30,
  SET_DEVICE: 0x42,
  ENTER_PROGMODE: 0x50,
  LEAVE_PROGMODE: 0x51,
  LOAD_ADDRESS: 0x55,
  PROG_PAGE: 0x64,
  READ_SIGN: 0x75,
  CRC_EOP: 0x20,
};

const PAGE_SIZE = 128; // ATmega328P flash page size, in bytes
const SIGNATURE = [0x1e, 0x95, 0x0f]; // ATmega328P

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function concatBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function includesAll(values, bytes) {
  return values.every((v) => bytes.includes(v));
}

// Buffers bytes from a locked WebSerial reader via one continuous
// background read loop (the pump) -- callers wait on the shared buffer it
// fills instead of each issuing their own reader.read() call. (An earlier
// version raced reader.read() against a timeout per call; a timed-out call
// left an orphaned read pending underneath, which a WebSerial reader then
// serves FIFO to the *next* call instead of the current one, permanently
// desyncing every attempt. Hence exactly one read loop here.)
class ByteStream {
  constructor(reader) {
    this.reader = reader;
    this.buffer = new Uint8Array(0);
    this.waiters = [];
    this.closed = false;
    this.error = null;
    this._pump();
  }

  async _pump() {
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) {
          this.closed = true;
          this._wake();
          return;
        }
        if (value && value.length) {
          this.buffer = concatBytes(this.buffer, value);
          this._wake();
        }
      }
    } catch (err) {
      this.error = err;
      this._wake();
    }
  }

  _wake() {
    this.waiters = this.waiters.filter((waiter) => {
      const satisfied = this.closed || this.error || this.buffer.length >= waiter.n;
      if (satisfied) {
        waiter.resolve();
        return false;
      }
      return true;
    });
  }

  // Waits up to timeoutMs for the buffer to grow past its current length.
  // Returns true if it did (or the stream ended/errored), false if the
  // window elapsed with nothing new.
  async _waitForActivity(timeoutMs) {
    const startLength = this.buffer.length;
    if (this.closed || this.error) return true;
    await new Promise((resolve) => {
      const waiter = { n: startLength + 1, resolve };
      this.waiters.push(waiter);
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        resolve();
      }, timeoutMs);
      waiter.resolve = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    return this.buffer.length > startLength || this.closed || this.error;
  }

  discard() {
    this.buffer = new Uint8Array(0);
  }

  // Waits for at least one new byte, then returns (and consumes) everything
  // currently buffered. Doesn't care about exact byte counts -- callers scan
  // whatever comes back for the markers they care about.
  async readAvailable(timeoutMs) {
    if (this.error) throw this.error;
    if (this.buffer.length === 0) {
      const activity = await this._waitForActivity(timeoutMs);
      if (this.error) throw this.error;
      if (!activity) throw new Error('timeout');
      if (this.closed && this.buffer.length === 0) {
        throw new Error('Serial port closed unexpectedly.');
      }
    }
    const result = this.buffer;
    this.buffer = new Uint8Array(0);
    return result;
  }

  // Actively drains the buffer until a genuine quietMs gap of silence is
  // observed, rather than a single instant discard(). Bytes still in
  // flight (e.g. a slightly-late reply to an earlier sync retry) would
  // slip past a one-shot clear and land moments later to corrupt the next
  // command's read -- this is what a plain discard() can't guarantee.
  // Best-effort: gives up quietly after maxWaitMs rather than blocking the
  // whole upload on it.
  async drain({ quietMs = 100, maxWaitMs = 1500 } = {}) {
    const deadline = Date.now() + maxWaitMs;
    this.discard();
    for (;;) {
      if (this.error || this.closed) return;
      const remaining = deadline - Date.now();
      if (remaining <= 0) return;
      // eslint-disable-next-line no-await-in-loop
      const activity = await this._waitForActivity(Math.min(quietMs, remaining));
      if (!activity) return;
      this.discard();
    }
  }
}

// Sends one command and waits until both INSYNC and OK have shown up
// somewhere in what comes back -- possibly split across several reads, or
// bundled together in one; this doesn't assume a fixed response shape.
// Lenient by design, matching the proven reference this is adapted from:
// requiring markers at exact byte positions broke permanently on a single
// stray byte anywhere in the stream.
async function sendCommand(writer, stream, bytes, timeoutMs = 1000) {
  await writer.write(new Uint8Array([...bytes, STK.CRC_EOP]));

  const deadline = Date.now() + timeoutMs;
  let sawInSync = false;
  let sawOk = false;
  let collected = new Uint8Array(0);

  while (!(sawInSync && sawOk)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('timeout');
    // eslint-disable-next-line no-await-in-loop
    const chunk = await stream.readAvailable(remaining);
    if (chunk.includes(STK.NOSYNC)) {
      throw new Error('nosync');
    }
    collected = concatBytes(collected, chunk);
    if (chunk.includes(STK.INSYNC)) sawInSync = true;
    if (chunk.includes(STK.OK)) sawOk = true;
  }
  return collected;
}

export async function flashViaStk500(port, flashBytes, { onStatus } = {}) {
  const status = (message) => onStatus?.(message);

  let reader = null;
  let writer = null;
  let stream = null;

  function detachStreams() {
    if (reader) {
      reader.releaseLock();
      reader = null;
    }
    if (writer) {
      writer.releaseLock();
      writer = null;
    }
    stream = null;
  }

  // Closes and reopens the port for every reset attempt (not just toggling
  // signals on a connection that's been open since before this upload
  // started) and toggles only DTR, not DTR+RTS together -- matches what's
  // actually proven to work, rather than avrdude's native-serial DTR+RTS
  // convention, which doesn't necessarily carry over to how a given
  // USB-serial chip behaves specifically under WebSerial.
  async function resetInto(baudRate) {
    detachStreams();
    await port.close().catch(() => {});
    try {
      await port.open({ baudRate });
    } catch (err) {
      // Tagged so the UI can show "another program has this port open"
      // instead of guessing from the browser's generic error text, which
      // doesn't reliably distinguish "port busy" from other open failures.
      const wrapped = new Error(`Could not open the serial port: ${err.message}`);
      wrapped.code = 'PORT_OPEN_FAILED';
      throw wrapped;
    }
    reader = port.readable.getReader();
    writer = port.writable.getWriter();
    stream = new ByteStream(reader);

    await port.setSignals({ dataTerminalReady: false });
    await sleep(250);
    await port.setSignals({ dataTerminalReady: true });
    await stream.drain();
  }

  async function syncAt(baudRate, attempts, perAttemptTimeoutMs) {
    await resetInto(baudRate);
    for (let i = 0; i < attempts; i++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await sendCommand(writer, stream, [STK.GET_SYNC], perAttemptTimeoutMs);
        return true;
      } catch (err) {
        status(`Sync attempt ${i + 1}/${attempts} at ${baudRate} baud: ${err.message}`);
      }
    }
    return false;
  }

  try {
    status('Resetting board...');
    // optiboot (current Uno bootloaders) runs at 115200; older/alternate
    // bootloaders use 57600 -- try the common case first, fall back rather
    // than assuming every board is running the newer one.
    let synced = await syncAt(115200, 10, 500);
    if (!synced) {
      status('Trying older bootloader baud rate (57600)...');
      synced = await syncAt(57600, 10, 500);
    }
    if (!synced) {
      throw new Error(
        'Could not sync with the board. Check that an Arduino Uno is connected on the selected port, ' +
          "nothing else has the port open (close the Arduino IDE Serial Monitor if it's open), and try again.",
      );
    }

    status('Checking chip signature...');
    const signatureResponse = await sendCommand(writer, stream, [STK.READ_SIGN], 1000);
    if (!includesAll(SIGNATURE, Array.from(signatureResponse))) {
      throw new Error('Arduino does not match the expected signature (not an ATmega328P/Uno).');
    }

    status('Setting device parameters...');
    // Bare 20-byte STK_SET_DEVICE body, all zero except the real flash page
    // size (bytes 13/14: pagesizehigh/pagesizelow). optiboot ignores most
    // of these values, but still needs a well-formed 20-byte command to
    // respond to -- this isn't actually configuring anything on-device.
    const deviceParams = new Uint8Array(20);
    deviceParams[12] = 0; // pagesizehigh
    deviceParams[13] = PAGE_SIZE; // pagesizelow
    const setDeviceResponse = await sendCommand(writer, stream, [STK.SET_DEVICE, ...deviceParams], 1000);
    if (!setDeviceResponse.includes(STK.OK)) {
      throw new Error('Arduino did not accept device parameters.');
    }

    status('Entering programming mode...');
    await sendCommand(writer, stream, [STK.ENTER_PROGMODE], 1000);

    const pageCount = Math.ceil(flashBytes.length / PAGE_SIZE);
    for (let page = 0; page < pageCount; page++) {
      // Logged *before* attempting the page, not after, so a failure's
      // status log still shows exactly which page it was on.
      status(`Writing page ${page + 1} of ${pageCount}...`);
      const byteAddress = page * PAGE_SIZE;
      const wordAddress = byteAddress >> 1;

      try {
        await sendCommand(
          writer,
          stream,
          [STK.LOAD_ADDRESS, wordAddress & 0xff, (wordAddress >> 8) & 0xff],
          1000,
        );
      } catch (err) {
        throw new Error(`Failed at LOAD_ADDRESS for page ${page + 1} of ${pageCount}: ${err.message}`);
      }

      const pageData = new Uint8Array(PAGE_SIZE).fill(0xff);
      pageData.set(flashBytes.subarray(byteAddress, byteAddress + PAGE_SIZE));

      try {
        await sendCommand(
          writer,
          stream,
          [STK.PROG_PAGE, (PAGE_SIZE >> 8) & 0xff, PAGE_SIZE & 0xff, 0x46 /* 'F' = flash */, ...pageData],
          1000,
        );
      } catch (err) {
        throw new Error(`Failed at PROG_PAGE for page ${page + 1} of ${pageCount}: ${err.message}`);
      }
    }

    status('Finishing up...');
    await sendCommand(writer, stream, [STK.LEAVE_PROGMODE], 1000);
    status('Upload complete.');
  } catch (err) {
    if (err.message.includes('nosync')) {
      throw new Error('Lost sync with the board mid-upload. Try again.');
    }
    throw err;
  } finally {
    detachStreams();
  }
}
