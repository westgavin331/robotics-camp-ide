// Confirmation for the "New" button -- clearing the canvas back to a blank
// project discards whatever's on screen (and any "My Blocks" definitions
// from the current project) with no undo, so this always requires an
// explicit confirmation click, same as DeleteBlockDialog's custom-block
// deletion. App.jsx skips rendering this entirely when the workspace is
// already empty -- there's nothing to lose in that case.
export default function NewProjectDialog({ onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="New Project"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">New Project</h2>
        <p>Start a new project? Any unsaved changes will be lost.</p>
        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="modal-delete" onClick={onConfirm}>
            Start New Project
          </button>
        </div>
      </div>
    </div>
  );
}
