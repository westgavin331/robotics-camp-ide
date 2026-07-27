import { useEffect, useState } from 'react';
import { listProjects } from '../api/projects.js';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// "Load" from the cross-device save layer -- lists whatever's currently
// saved on the backend (MongoDB Atlas), lets a kid pick their name/team
// name, and confirms before actually replacing the current workspace
// (picking the wrong entry in a list of 20+ camper names is an easy
// mistake, and loading discards whatever's unsaved on screen).
export default function LoadDialog({ onLoad, onCancel }) {
  const [phase, setPhase] = useState('loading'); // loading | list | confirm | applying | error
  const [projects, setProjects] = useState([]);
  const [listError, setListError] = useState('');
  const [selected, setSelected] = useState(null);
  const [applyError, setApplyError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then((result) => {
        if (cancelled) return;
        setProjects(result);
        setPhase('list');
      })
      .catch((err) => {
        if (cancelled) return;
        setListError(err.message || "Couldn't reach the save service.");
        setPhase('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirmLoad() {
    setPhase('applying');
    setApplyError('');
    try {
      await onLoad(selected.name);
      onCancel(); // success closes the dialog -- back on the workspace is confirmation enough.
    } catch (err) {
      setApplyError(err.message || "Couldn't load that project.");
      setPhase('confirm');
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Load Project"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Load Project</h2>

        {phase === 'loading' && <p className="modal-params-empty">Looking for saved projects…</p>}

        {phase === 'error' && <p className="modal-error">{listError}</p>}

        {phase === 'list' && (
          <>
            {projects.length === 0 ? (
              <p className="modal-params-empty">No saved projects yet.</p>
            ) : (
              <div className="load-list">
                {projects.map((p) => (
                  <button
                    type="button"
                    key={p.name}
                    className="load-list-item"
                    onClick={() => {
                      setSelected(p);
                      setPhase('confirm');
                    }}
                  >
                    <span className="load-list-name">{p.name}</span>
                    <span className="load-list-date">{formatDate(p.updatedAt)}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {(phase === 'confirm' || phase === 'applying') && selected && (
          <>
            <p>
              Load <strong>{selected.name}</strong>? This replaces what&rsquo;s on your screen right now.
            </p>
            {applyError && <p className="modal-error">{applyError}</p>}
          </>
        )}

        <div className="modal-actions">
          {phase === 'confirm' && (
            <>
              <button type="button" className="modal-cancel" onClick={() => setPhase('list')}>
                Back
              </button>
              <button type="button" className="modal-create" onClick={confirmLoad}>
                Load
              </button>
            </>
          )}
          {phase === 'applying' && (
            <button type="button" className="modal-create" disabled>
              Loading…
            </button>
          )}
          {(phase === 'loading' || phase === 'list' || phase === 'error') && (
            <button type="button" className="modal-cancel" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
