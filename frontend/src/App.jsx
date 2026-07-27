import { useRef, useState } from 'react';
import BlocklyWorkspace from './components/BlocklyWorkspace.jsx';
import CodeView from './components/CodeView.jsx';
import HardwarePanel from './components/HardwarePanel.jsx';
import ResizeHandle from './components/ResizeHandle.jsx';
import SaveDialog from './components/SaveDialog.jsx';
import LoadDialog from './components/LoadDialog.jsx';
import ImportCppDialog from './components/ImportCppDialog.jsx';
import { saveProject, fetchProject } from './api/projects.js';
import './App.css';

const DEFAULT_HARDWARE_WIDTH = 360;
const MIN_HARDWARE_WIDTH = 260;
const MAX_HARDWARE_WIDTH = 640;
const LAST_PROJECT_NAME_KEY = 'roboticsCampLastProjectName';

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
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const blocklyRef = useRef(null);

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

  // Cross-device save (MongoDB Atlas via the backend) -- the Blockly
  // workspace + My Blocks snapshot itself is read through BlocklyWorkspace's
  // imperative handle, since only that component holds the live Blockly
  // workspace instance. Remembering the last-used name is a small
  // convenience so a kid re-saving later in the day doesn't retype it.
  async function handleSave(name) {
    const snapshot = blocklyRef.current.getSnapshot();
    await saveProject(name, snapshot);
    localStorage.setItem(LAST_PROJECT_NAME_KEY, name);
  }

  async function handleLoad(name) {
    const project = await fetchProject(name);
    blocklyRef.current.applyProject(project);
    localStorage.setItem(LAST_PROJECT_NAME_KEY, name);
  }

  // importCpp/index.js already did the hard part (parse + recognize +
  // build a project); this just reuses the exact same "replace the
  // workspace" path Load already uses.
  async function handleImport(project) {
    blocklyRef.current.applyProject(project);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Robotics Camp Block IDE</h1>
        <div className="header-actions">
          <button type="button" className="header-toggle" onClick={() => setShowSaveDialog(true)}>
            Save
          </button>
          <button type="button" className="header-toggle" onClick={() => setShowLoadDialog(true)}>
            Load
          </button>
          <button type="button" className="header-toggle" onClick={() => setShowImportDialog(true)}>
            Import C++
          </button>
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
        <BlocklyWorkspace ref={blocklyRef} onCodeChange={setCode} />
        {showCode && <CodeView code={code} />}
        {!hardwareCollapsed && (
          <>
            <ResizeHandle onResize={handleHardwareResize} label="Resize hardware panel" />
            <HardwarePanel code={code} width={hardwareWidth} />
          </>
        )}
      </main>
      {showSaveDialog && (
        <SaveDialog
          initialName={localStorage.getItem(LAST_PROJECT_NAME_KEY) || ''}
          onSave={handleSave}
          onCancel={() => setShowSaveDialog(false)}
        />
      )}
      {showLoadDialog && <LoadDialog onLoad={handleLoad} onCancel={() => setShowLoadDialog(false)} />}
      {showImportDialog && <ImportCppDialog onImport={handleImport} onCancel={() => setShowImportDialog(false)} />}
    </div>
  );
}

export default App;
