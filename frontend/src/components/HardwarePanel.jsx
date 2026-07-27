import { useEffect, useRef, useState } from 'react';
import { isSerialSupported, requestSerialPort, startMonitor, sendLine } from '../webserial/serialPort.js';
import { flashViaStk500 } from '../webserial/stk500v1.js';
import { parseIntelHex } from '../webserial/intelHex.js';
import { BACKEND_URL } from '../config.js';

// The post-upload monitor baud rate has to match whatever the sketch itself
// configured -- which for every sketch this generator produces is a
// hardcoded Serial.begin(9600) (see generators/arduino/serial.js).
// Programming-side baud rate is decided internally by flashViaStk500 (it
// tries 115200, optiboot's rate, then falls back to 57600 for older
// bootloaders), so there's no separate constant for it here.
const MONITOR_BAUD_RATE = 9600;

// Turns a raw error (a browser DOMException, or one of our own Error
// objects from the compile/flash pipeline) into a short, plain-language
// message a kid can act on. The real error always still goes into the
// technical activity log underneath -- this is only the headline.
function friendlyMessage(stage, err) {
  const raw = err?.message || String(err ?? '');
  const lower = raw.toLowerCase();

  if (stage === 'connect') {
    if (err?.name === 'NotFoundError') {
      return "No board was selected. Click Upload Code and choose your Arduino from the list that pops up.";
    }
    return "Couldn't connect to a board. Make sure it's plugged in, then try again.";
  }

  if (stage === 'compile') {
    if (err?.kind === 'infra') {
      return "Couldn't reach the code-building service. Check with a grown-up and try again.";
    }
    return "There's a mistake somewhere in your blocks. Check the details below.";
  }

  if (stage === 'upload') {
    // Tagged at the source (stk500v1.js / the monitor reopen below) rather
    // than guessed from message text, which Chrome doesn't make reliably
    // distinguishable between "port busy" and other open failures.
    if (err?.code === 'PORT_OPEN_FAILED') {
      return "Your board's port is being used by another program (like the Arduino IDE). Close that program and try again.";
    }
    if (lower.includes('lost') || lower.includes('disconnected') || lower.includes('device has been lost')) {
      return 'Looks like your board got unplugged. Plug it back in and try again.';
    }
    if (lower.includes('could not sync') || lower.includes('sync')) {
      return "Couldn't talk to your board. Check that it's plugged in and try again.";
    }
    return 'Something went wrong sending your code to the board. Try again.';
  }

  return 'Something went wrong. Try again.';
}

export default function HardwarePanel({ code, width }) {
  const portRef = useRef(null);
  const monitorStopRef = useRef(null);
  const monitorLinesRef = useRef(null);

  const supportsSerial = isSerialSupported();
  const [connected, setConnected] = useState(false);
  // idle | connecting | compiling | uploading | done | error
  const [runStage, setRunStage] = useState('idle');
  const [runError, setRunError] = useState(null);
  const [compileResult, setCompileResult] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [activeTab, setActiveTab] = useState('status'); // status | monitor
  const [monitoring, setMonitoring] = useState(false);
  const [monitorLines, setMonitorLines] = useState([]);
  const [monitorInput, setMonitorInput] = useState('');

  useEffect(() => {
    if (monitorLinesRef.current) {
      monitorLinesRef.current.scrollTop = monitorLinesRef.current.scrollHeight;
    }
  }, [monitorLines]);

  function log(message) {
    setActivityLog((prev) => [...prev, message]);
  }

  async function stopMonitorIfRunning() {
    if (monitorStopRef.current) {
      await monitorStopRef.current();
      monitorStopRef.current = null;
      setMonitoring(false);
    }
  }

  // Returns the connected port, requesting one first if we don't have one
  // yet -- lets Run work as a single button for the common case, without
  // requiring a separate Connect click first. Returns null (and sets the
  // friendly error) if no board gets selected.
  async function ensureConnected() {
    if (portRef.current) return portRef.current;
    try {
      const port = await requestSerialPort();
      portRef.current = port;
      setConnected(true);
      log('Board connected.');
      return port;
    } catch (err) {
      log(`Connect failed: ${err.message}`);
      setRunError(friendlyMessage('connect', err));
      return null;
    }
  }

  async function handleConnect() {
    setRunError(null);
    const port = await ensureConnected();
    // Drives the banner for a standalone Connect click too (not just Run),
    // and clears out any stale error banner left over from a previous
    // failed Run once a board is actually connected.
    setRunStage(port ? 'idle' : 'error');
  }

  async function handleDisconnect() {
    await stopMonitorIfRunning();
    if (portRef.current) {
      await portRef.current.close().catch(() => {});
    }
    portRef.current = null;
    setConnected(false);
    // Clears a stale "your code is running!" banner from a previous Run --
    // that claim stops being useful the moment we can no longer talk to
    // the board.
    setRunStage('idle');
    setRunError(null);
    setActiveTab('status');
  }

  async function compileCode() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        const result = { errors: [], rawOutput: data.message || `Compile request failed (HTTP ${res.status}).` };
        setCompileResult(result);
        return { ok: false, kind: 'infra' };
      }
      if (data.success) {
        setCompileResult({ hex: data.hex, size: data.size });
        return { ok: true, hex: data.hex };
      }
      setCompileResult({ errors: data.errors, rawOutput: data.rawOutput });
      return { ok: false, kind: 'compile' };
    } catch (err) {
      setCompileResult({ errors: [], rawOutput: `Could not reach the backend at ${BACKEND_URL}: ${err.message}` });
      return { ok: false, kind: 'infra' };
    }
  }

  async function uploadHex(port, hex) {
    const flashBytes = parseIntelHex(atob(hex));

    // flashViaStk500 owns opening/closing/resetting the port itself (it may
    // retry at more than one baud rate), so it's given the port as-is
    // rather than being pre-opened here.
    await flashViaStk500(port, flashBytes, { onStatus: log });
    await port.close();

    try {
      await port.open({ baudRate: MONITOR_BAUD_RATE });
    } catch (err) {
      err.code = err.code || 'PORT_OPEN_FAILED';
      throw err;
    }

    log(`Listening at ${MONITOR_BAUD_RATE} baud...`);
    setMonitorLines([]);
    monitorStopRef.current = startMonitor(port, (line) => {
      setMonitorLines((prev) => (prev.length > 500 ? [...prev.slice(-500), line] : [...prev, line]));
    });
    setMonitoring(true);
  }

  // The one-button pipeline: connect (if needed) -> compile -> upload ->
  // switch to the Monitor tab. Each stage's failure gets its own
  // kid-friendly message; the technical detail always stays available in
  // the Status tab underneath.
  async function handleRun() {
    setRunError(null);
    setCompileResult(null);
    setActivityLog([]);
    await stopMonitorIfRunning();

    setRunStage('connecting');
    const port = await ensureConnected();
    if (!port) {
      setRunStage('error');
      return;
    }

    setRunStage('compiling');
    const compiled = await compileCode();
    if (!compiled.ok) {
      setRunStage('error');
      setRunError(friendlyMessage('compile', { kind: compiled.kind }));
      return;
    }

    setRunStage('uploading');
    try {
      await uploadHex(port, compiled.hex);
      setRunStage('done');
      setActiveTab('monitor');
    } catch (err) {
      log(`Upload failed: ${err.message}`);
      await port.close().catch(() => {});
      setRunStage('error');
      setRunError(friendlyMessage('upload', err));
    }
  }

  async function handleSend() {
    if (!portRef.current || !monitorInput) return;
    try {
      await sendLine(portRef.current, monitorInput);
      setMonitorInput('');
    } catch (err) {
      log(`Send failed: ${err.message}`);
    }
  }

  const running = runStage === 'connecting' || runStage === 'compiling' || runStage === 'uploading';
  const runLabel = {
    idle: 'Upload Code',
    connecting: 'Connecting…',
    compiling: 'Building…',
    uploading: 'Sending to board…',
    done: 'Upload Code',
    error: 'Upload Code',
  }[runStage];
  const banner = {
    connecting: { tone: 'info', text: '🔌 Looking for your board…' },
    compiling: { tone: 'info', text: '🛠️ Building your code…' },
    uploading: { tone: 'info', text: '📤 Sending your code to the board…' },
    done: { tone: 'ok', text: '✅ Your code is running! Check the Monitor tab.' },
    error: { tone: 'error', text: `❌ ${runError || 'Something went wrong.'}` },
  }[runStage];

  return (
    <div className="hardware-panel" style={{ '--hw-width': `${width}px` }}>
      <div className="hardware-controls">
        <button type="button" onClick={connected ? handleDisconnect : handleConnect} disabled={!supportsSerial}>
          {connected ? 'Disconnect' : 'Connect'}
        </button>
        <button type="button" className="run-button" onClick={handleRun} disabled={!supportsSerial || running}>
          {runLabel}
        </button>
      </div>

      {!supportsSerial && (
        <p className="hardware-warning">WebSerial isn't supported in this browser — use Chrome or Edge.</p>
      )}

      {banner && <div className={`run-banner run-banner-${banner.tone}`}>{banner.text}</div>}

      <div className="hardware-tabs">
        <button
          type="button"
          className={`hardware-tab ${activeTab === 'status' ? 'active' : ''}`}
          onClick={() => setActiveTab('status')}
        >
          Status
        </button>
        <button
          type="button"
          className={`hardware-tab ${activeTab === 'monitor' ? 'active' : ''}`}
          onClick={() => setActiveTab('monitor')}
        >
          Monitor{monitoring ? ' 🟢' : ''}
        </button>
      </div>

      {activeTab === 'status' && (
        <div className="build-output">
          <div className="build-output-body">
            {compileResult?.size?.program && (
              <div className="build-line build-line-ok">
                Compiled OK — {compileResult.size.program.bytes} / {compileResult.size.program.maxBytes} bytes flash
              </div>
            )}
            {compileResult?.errors && (
              <ul className="build-errors">
                {compileResult.errors.length > 0 ? (
                  compileResult.errors.map((e, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <li key={i}>
                      Line {e.line}: {e.message}
                    </li>
                  ))
                ) : (
                  <li>{compileResult.rawOutput}</li>
                )}
              </ul>
            )}
            {activityLog.map((line, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className="build-line">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'monitor' && (
        <div className="serial-monitor">
          <div className="serial-monitor-lines" ref={monitorLinesRef}>
            {monitorLines.length === 0 && (
              <div className="build-line">
                {monitoring ? 'Waiting for messages from your board…' : 'Upload your code to see messages here.'}
              </div>
            )}
            {monitorLines.map((line, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i}>{line}</div>
            ))}
          </div>
          <div className="serial-monitor-input">
            <input
              type="text"
              value={monitorInput}
              onChange={(e) => setMonitorInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={!monitoring}
              placeholder="Send to board…"
            />
            <button type="button" onClick={handleSend} disabled={!monitoring}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
