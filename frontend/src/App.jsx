import { useState } from 'react';
import BlocklyWorkspace from './components/BlocklyWorkspace.jsx';
import CodeView from './components/CodeView.jsx';
import HardwarePanel from './components/HardwarePanel.jsx';
import ResizeHandle from './components/ResizeHandle.jsx';
import './App.css';

const DEFAULT_HARDWARE_WIDTH = 360;
const MIN_HARDWARE_WIDTH = 260;
const MAX_HARDWARE_WIDTH = 640;

function loadStoredWidth() {
  const stored = Number(localStorage.getItem('hardwarePanelWidth'));
  if (Number.isFinite(stored) && stored >= MIN_HARDWARE_WIDTH && stored <= MAX_HARDWARE_WIDTH) {
    return stored;
  }
  return DEFAULT_HARDWARE_WIDTH;
}

function App() {
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(true);
  const [hardwareCollapsed, setHardwareCollapsed] = useState(
    () => localStorage.getItem('hardwarePanelCollapsed') === 'true',
  );
  const [hardwareWidth, setHardwareWidth] = useState(loadStoredWidth);

  function toggleHardwarePanel() {
    setHardwareCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('hardwarePanelCollapsed', String(next));
      return next;
    });
  }

  // deltaX follows the drag handle's own movement: negative (dragging/moving
  // left) widens the panel since the handle sits on its left edge.
  function handleHardwareResize(deltaX) {
    setHardwareWidth((prev) => {
      const next = Math.min(MAX_HARDWARE_WIDTH, Math.max(MIN_HARDWARE_WIDTH, prev - deltaX));
      localStorage.setItem('hardwarePanelWidth', String(next));
      return next;
    });
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Robotics Camp Block IDE</h1>
        <div className="header-actions">
          <button
            type="button"
            className="header-toggle"
            aria-pressed={showCode}
            onClick={() => setShowCode((v) => !v)}
          >
            {showCode ? 'Hide Code' : 'View Code'}
          </button>
          <button
            type="button"
            className="header-toggle"
            aria-pressed={!hardwareCollapsed}
            onClick={toggleHardwarePanel}
          >
            {hardwareCollapsed ? 'Show Tools' : 'Hide Tools'}
          </button>
        </div>
      </header>
      <main className="app-main">
        <BlocklyWorkspace onCodeChange={setCode} />
        {showCode && <CodeView code={code} />}
        {!hardwareCollapsed && (
          <>
            <ResizeHandle onResize={handleHardwareResize} label="Resize hardware panel" />
            <HardwarePanel code={code} width={hardwareWidth} />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
