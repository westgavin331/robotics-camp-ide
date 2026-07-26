// Thin wrappers around the WebSerial API (navigator.serial) -- port
// selection, and the line-buffered read loop / line sender used by the
// Serial Monitor. STK500 programming (stk500v1.js) talks to the same
// SerialPort object directly with raw byte reader/writer, since it needs
// exact binary framing rather than decoded text lines.

export function isSerialSupported() {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export async function requestSerialPort() {
  if (!isSerialSupported()) {
    throw new Error('WebSerial is not supported in this browser. Use Chrome or Edge.');
  }
  return navigator.serial.requestPort();
}

// Starts a read loop that decodes incoming bytes as text and emits complete
// lines (split on \n, trailing \r stripped) via onLine. Returns an async
// stop() function that cancels the read and releases the port.readable lock
// so the port can be closed or re-opened afterward.
export function startMonitor(port, onLine) {
  const decoder = new TextDecoderStream();
  const closed = port.readable.pipeTo(decoder.writable).catch(() => {});
  const reader = decoder.readable.getReader();
  let buffer = '';
  let stopped = false;

  const loop = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        buffer += value;
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
          onLine(buffer.slice(0, newlineIndex).replace(/\r$/, ''));
          buffer = buffer.slice(newlineIndex + 1);
        }
      }
    } catch (err) {
      if (!stopped) onLine(`[monitor stopped: ${err.message}]`);
    }
  })();

  return async function stop() {
    stopped = true;
    await reader.cancel().catch(() => {});
    await loop;
    await closed;
  };
}

export async function sendLine(port, text) {
  const writer = port.writable.getWriter();
  try {
    await writer.write(new TextEncoder().encode(`${text}\n`));
  } finally {
    writer.releaseLock();
  }
}
