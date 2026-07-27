import { useEffect, useState } from 'react';
import { listProjects, deleteProject } from '../api/projects.js';

// Speed bump for the delete option below, not real security -- there's no
// per-kid auth in this app at all, so this is a shared camp-wide password a
// counselor knows, meant to stop an accidental/curious click from wiping a
// teammate's save, not a genuine access-control boundary. Checked entirely
// client-side; the DELETE route itself (backend/src/index.js) takes no
// password, same as every other route here having no auth.
const DELETE_PASSWORD = "CalculusIsHard:(";

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
  // loading | list | confirm | applying | error | delete | deleting
  const [phase, setPhase] = useState('loading');
  const [projects, setProjects] = useState([]);
  const [listError, setListError] = useState('');
  const [selected, setSelected] = useState(null);
  const [applyError, setApplyError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

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

  function startDelete(project) {
    setDeleteTarget(project);
    setDeletePassword('');
    setDeleteError('');
    setPhase('delete');
  }

  async function confirmDelete(e) {
    e.preventDefault();
    if (deletePassword !== DELETE_PASSWORD) {
      setDeleteError('Incorrect password.');
      return;
    }
    setPhase('deleting');
    setDeleteError('');
    try {
      await deleteProject(deleteTarget.name);
      setProjects((prev) => prev.filter((p) => p.name !== deleteTarget.name));
      setDeleteTarget(null);
      setPhase('list');
    } catch (err) {
      setDeleteError(err.message || "Couldn't delete that project.");
      setPhase('delete');
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
                  <div className="load-list-item" key={p.name}>
                    <button
                      type="button"
                      className="load-list-main"
                      onClick={() => {
                        setSelected(p);
                        setPhase('confirm');
                      }}
                    >
                      <span className="load-list-name">{p.name}</span>
                      <span className="load-list-date">{formatDate(p.updatedAt)}</span>
                    </button>
                    <button
                      type="button"
                      className="load-list-delete"
                      aria-label={`Delete ${p.name}`}
                      title={`Delete ${p.name}`}
                      onClick={() => startDelete(p)}
                    >
                      🗑
                    </button>
                  </div>
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

        {(phase === 'delete' || phase === 'deleting') && deleteTarget && (
          <form onSubmit={confirmDelete}>
            <p>
              Delete <strong>{deleteTarget.name}</strong>? This can&rsquo;t be undone. Enter the password to confirm.
            </p>
            <label className="modal-field">
              <span>Password</span>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                autoFocus
                disabled={phase === 'deleting'}
              />
            </label>
            {deleteError && <p className="modal-error">{deleteError}</p>}

            <div className="modal-actions">
              {phase === 'delete' ? (
                <>
                  <button type="button" className="modal-cancel" onClick={() => setPhase('list')}>
                    Cancel
                  </button>
                  <button type="submit" className="modal-delete" disabled={!deletePassword}>
                    Delete
                  </button>
                </>
              ) : (
                <button type="button" className="modal-delete" disabled>
                  Deleting…
                </button>
              )}
            </div>
          </form>
        )}

        {phase !== 'delete' && phase !== 'deleting' && (
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
        )}
      </div>
    </div>
  );
}
