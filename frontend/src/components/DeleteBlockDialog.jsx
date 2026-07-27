// Confirmation for "Delete Custom Block" (registry.js's customContextMenu,
// on both the "define" hat and its toolbox flyout call block). Deleting a
// custom block has no undo path once its Blockly types are unregistered
// (registry.js's unregisterCustomBlock), so this always requires an explicit
// confirmation click -- never a direct drag-to-trash-style instant delete.
//
// If the block is still called anywhere else in the project (`usages`
// non-empty), deletion is blocked outright rather than offered as a
// cascading "delete everywhere" option: silently vanishing blocks somewhere
// a kid isn't currently looking at is more confusing than a clear "this is
// still used, go remove those first" message they can act on themselves.
export default function DeleteBlockDialog({ def, usages, onLocate, onConfirm, onCancel }) {
  const blocked = usages.length > 0;

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Delete Custom Block"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Delete Custom Block</h2>

        {blocked ? (
          <>
            <p>
              <strong>{def.name}</strong> is still used in {usages.length}{' '}
              {usages.length === 1 ? 'place' : 'places'}. Remove those blocks first, then come back to delete it.
            </p>
            <div className="usage-list">
              {usages.map((u, i) => (
                <div className="usage-row" key={u.id}>
                  <span>
                    Use {i + 1} &ndash; {u.location}
                  </span>
                  <button type="button" className="usage-locate-btn" onClick={() => onLocate(u.id)}>
                    Show me
                  </button>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={onCancel}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              Delete <strong>{def.name}</strong>? This can&rsquo;t be undone.
            </p>
            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" className="modal-delete" onClick={onConfirm}>
                Delete Custom Block
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
