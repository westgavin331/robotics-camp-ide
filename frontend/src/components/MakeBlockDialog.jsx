import { useState } from 'react';

const PARAM_TYPES = [
  { value: 'number', label: 'Number' },
  { value: 'text', label: 'Text' },
  { value: 'boolean', label: 'Yes/No' },
];

let paramKeySeq = 0;
function newParam() {
  paramKeySeq += 1;
  return { key: paramKeySeq, name: '', type: 'number' };
}

// "Make a Block" (mBlock/Scratch's own name for this dialog): name the new
// block, add typed inputs, and hand the result up to BlocklyWorkspace, which
// owns the actual workspace instance needed to register the block types and
// drop a fresh "define" hat onto the canvas (see registry.js/
// toolboxCategory.js for why the type-registration side lives there).
export default function MakeBlockDialog({ onCreate, onCancel }) {
  const [name, setName] = useState('');
  const [params, setParams] = useState([]);
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
    const trimmedParams = params.map((p) => ({ name: p.name.trim(), type: p.type }));
    if (trimmedParams.some((p) => !p.name)) {
      setError('Every input needs a name.');
      return;
    }
    const lowerNames = trimmedParams.map((p) => p.name.toLowerCase());
    if (new Set(lowerNames).size !== lowerNames.length) {
      setError('Give each input a different name.');
      return;
    }
    onCreate({ name: trimmedName, params: trimmedParams });
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Make a Block"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Make a Block</h2>
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
              Create Block
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
