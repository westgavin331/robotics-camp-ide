import { useRef, useState } from 'react';
import { importCpp, ImportRejected } from '../importCpp/index.js';

// "Import C++" -- paste or upload an Arduino sketch and convert it to
// blocks, best-effort (see importCpp/index.js's module comment for exactly
// what's supported and why). Two steps: Import parses+recognizes the text
// and, on success, shows a confirmation before touching the workspace
// (same "this replaces what's on your screen" pattern as LoadDialog,
// since a successful import is just as destructive to unsaved work as a
// Load is). A rejected import shows every problem found, not just the
// first, and leaves the text box editable so a fix-and-retry loop doesn't
// mean retyping everything.
export default function ImportCppDialog({ onImport, onCancel }) {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState('input'); // input | importing | confirm | applying
  const [errors, setErrors] = useState(null);
  const [pendingProject, setPendingProject] = useState(null);
  const [applyError, setApplyError] = useState('');
  const fileInputRef = useRef(null);

  async function handleFileChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets choosing the same file again re-trigger onChange
    if (!file) return;
    setText(await file.text());
  }

  async function handleImportClick() {
    if (!text.trim()) {
      setErrors([{ line: null, column: null, message: 'Paste or upload some code first.' }]);
      return;
    }
    setPhase('importing');
    setErrors(null);
    try {
      const project = await importCpp(text);
      setPendingProject(project);
      setPhase('confirm');
    } catch (err) {
      setErrors(err instanceof ImportRejected ? err.errors : [{ line: null, column: null, message: err.message || 'Something went wrong reading this code.' }]);
      setPhase('input');
    }
  }

  async function handleConfirm() {
    setPhase('applying');
    setApplyError('');
    try {
      await onImport(pendingProject);
      onCancel(); // success closes the dialog, same as LoadDialog
    } catch (err) {
      setApplyError(err.message || "Couldn't bring these blocks into your workspace.");
      setPhase('confirm');
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={phase === 'applying' ? undefined : onCancel}>
      <div
        className="modal-card import-cpp-card"
        role="dialog"
        aria-modal="true"
        aria-label="Import C++"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Import C++</h2>

        {(phase === 'input' || phase === 'importing') && (
          <>
            <p className="modal-params-empty">Paste an Arduino sketch below, or upload a file, then click Import.</p>
            <textarea
              className="import-cpp-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="void setup() {&#10;&#10;}&#10;&#10;void loop() {&#10;&#10;}"
              disabled={phase === 'importing'}
              spellCheck={false}
            />
            <input
              type="file"
              accept=".ino,.cpp,.txt"
              ref={fileInputRef}
              onChange={handleFileChosen}
              style={{ display: 'none' }}
            />
            <div className="import-cpp-upload-row">
              <button type="button" className="modal-cancel" onClick={() => fileInputRef.current?.click()} disabled={phase === 'importing'}>
                Upload a file…
              </button>
            </div>

            {errors && (
              <div className="import-errors">
                <p className="modal-error" style={{ marginBottom: 6 }}>
                  {errors.length === 1 ? "Couldn't import this code:" : `Couldn't import this code -- found ${errors.length} problems:`}
                </p>
                <ul className="import-errors-list">
                  {errors.map((e, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <li key={i}>{e.line ? `Line ${e.line}: ${e.message}` : e.message}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" className="modal-create" onClick={handleImportClick} disabled={phase === 'importing'}>
                {phase === 'importing' ? 'Reading your code…' : 'Import'}
              </button>
            </div>
          </>
        )}

        {(phase === 'confirm' || phase === 'applying') && (
          <>
            <p>This looks good! Importing replaces what&rsquo;s on your screen right now with these blocks.</p>
            {applyError && <p className="modal-error">{applyError}</p>}
            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={() => setPhase('input')} disabled={phase === 'applying'}>
                Back
              </button>
              <button type="button" className="modal-create" onClick={handleConfirm} disabled={phase === 'applying'}>
                {phase === 'applying' ? 'Importing…' : 'Import'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
