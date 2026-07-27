import { useState } from 'react';

const PARAM_TYPES = [
  { value: 'number', label: 'Number' },
  { value: 'text', label: 'Text' },
  { value: 'boolean', label: 'Yes/No' },
];

let paramKeySeq = 0;
// `origId` tracks identity back to registry.js's param records across an
// edit -- null for a row that didn't exist before this dialog session (a
// fresh "+ Add an input" row, in either create or edit mode), or an
// existing param's id when prefilled from `initial` for editing. Only
// registry.js's updateCustomBlock reads it; create mode ignores it (every
// row is necessarily new there).
function newParam(origId = null, name = '', type = 'number') {
  paramKeySeq += 1;
  return { key: paramKeySeq, origId, name, type };
}

// "Make a Block" (mBlock/Scratch's own name for this dialog), reused for
// "Edit Block" (see registry.js's customContextMenu) -- passing `initial`
// pre-fills the name/params from an existing custom block and switches the
// copy/submit label, but the form itself is identical either way.
// BlocklyWorkspace owns the actual workspace instance needed to register
// (or, when editing, reshape) the Blockly block types and cascade the
// change to already-placed instances -- see registry.js/cascade.js.
export default function MakeBlockDialog({ initial, onSubmit, onCancel }) {
  const isEditing = Boolean(initial);
  const [name, setName] = useState(initial?.name ?? '');
  const [params, setParams] = useState(() =>
    (initial?.params ?? []).map((p) => newParam(p.id, p.name, p.type)),
  );
  const [error, setError] = useState('');

  function updateParam(key, patch) {
    setParams((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  function removeParam(key) {
    setParams((prev) => prev.filter((p) => p.key !== key));
  }

  function addParam() {
    setParams((prev) => [...prev, newParam()]);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Give your block a name.');
      return;
    }
    const trimmedParams = params.map((p) => ({ origId: p.origId, name: p.name.trim(), type: p.type }));
    if (trimmedParams.some((p) => !p.name)) {
      setError('Every input needs a name.');
      return;
    }
    const lowerNames = trimmedParams.map((p) => p.name.toLowerCase());
    if (new Set(lowerNames).size !== lowerNames.length) {
      setError('Give each input a different name.');
      return;
    }
    onSubmit({ name: trimmedName, params: trimmedParams });
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? 'Edit Block' : 'Make a Block'}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">{isEditing ? 'Edit Block' : 'Make a Block'}</h2>
        <form onSubmit={handleSubmit}>
          <label className="modal-field">
            <span>Block name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Blink Twice"
              autoFocus
            />
          </label>

          <div className="modal-params">
            <span className="modal-params-label">Inputs</span>
            {params.length === 0 && (
              <p className="modal-params-empty">No inputs yet — this block will just run some steps.</p>
            )}
            {params.map((p) => (
              <div className="modal-param-row" key={p.key}>
                <input
                  type="text"
                  value={p.name}
                  onChange={(e) => updateParam(p.key, { name: e.target.value })}
                  placeholder="input name"
                />
                <select value={p.type} onChange={(e) => updateParam(p.key, { type: e.target.value })}>
                  {PARAM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="modal-param-remove"
                  onClick={() => removeParam(p.key)}
                  aria-label="Remove input"
                >
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="modal-add-param" onClick={addParam}>
              + Add an input
            </button>
          </div>

          {error && <p className="modal-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="modal-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="modal-create">
              {isEditing ? 'Save Changes' : 'Create Block'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
