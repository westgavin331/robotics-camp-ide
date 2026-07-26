import { useRef } from 'react';

// A thin draggable divider. Pure UI -- it reports pointer movement via
// onResize(deltaX) and lets the parent decide what to do with it (which
// panel grows/shrinks, min/max clamping), so it isn't tied to any specific
// layout.
export default function ResizeHandle({ onResize, label }) {
  const draggingRef = useRef(false);

  function startDrag(e) {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function handleMove(e) {
    if (!draggingRef.current) return;
    onResize(e.movementX);
  }

  function endDrag(e) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  function handleKeyDown(e) {
    // Matches drag semantics: moving the handle left (negative deltaX)
    // widens the panel to its right, same as a leftward mouse drag would.
    if (e.key === 'ArrowLeft') onResize(-20);
    else if (e.key === 'ArrowRight') onResize(20);
  }

  return (
    <div
      className="resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={label || 'Resize panel'}
      tabIndex={0}
      onPointerDown={startDrag}
      onPointerMove={handleMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
    >
      <div className="resize-handle-grip" />
    </div>
  );
}
