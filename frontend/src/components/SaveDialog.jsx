import { useState } from 'react';

// The cross-device "Save" layer (see api/projects.js / MongoDB Atlas on the
// backend) -- separate from the automatic same-device localStorage
// autosave, which needs no UI at all. `initialName` prefills from
// localStorage's last-used name (App.jsx) so a kid saving again later
// doesn't have to retype their own name/team name every time.
export default function SaveDialog({ initialName, onSave, onCancel }) {
  const [name, setName] = useState(initialName || '');
  const [status, setStatus] = useState('idle'); // idle | saving | success | error
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setStatus('error');
      setError('Type a name first.');
      return;
    }
    setStatus('saving');
    setError('');
    try {
      await onSave(trimmed);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setError(err.message || "Couldn't save. Try again.");
    }
  }

  const saved = status === 'success';

  return (
    <div className="modal-overlay" role="presentation" onClick={saved ? undefined : onCancel}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Save Project"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Save Project</h2>
        <form onSubmit={handleSubmit}>
          <label className="modal-field">
            <span>Your name or team name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex or Team Rocket"
              autoFocus
              disabled={saved}
            />
          </label>

          {status === 'error' && <p className="modal-error">{error}</p>}
          {saved && <p className="modal-success">✅ Saved! You can load it from any computer.</p>}

          <div className="modal-actions">
            {saved ? (
              <button type="button" className="modal-create" onClick={onCancel}>
                Done
              </button>
            ) : (
              <>
                <button type="button" className="modal-cancel" onClick={onCancel} disabled={status === 'saving'}>
                  Cancel
                </button>
                <button type="submit" className="modal-create" disabled={status === 'saving'}>
                  {status === 'saving' ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
