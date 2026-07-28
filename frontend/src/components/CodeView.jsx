import { useState } from 'react';

export default function CodeView({ code, width }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied or unavailable -- nothing sensible to
      // recover into, so just leave the "Copy" label as-is.
    }
  }

  return (
    <div className="code-view" style={{ '--code-width': `${width}px` }}>
      <div className="code-view-header">
        <span>sketch.ino</span>
        <button type="button" className="code-view-copy" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="code-view-body">
        <code>{code}</code>
      </pre>
    </div>
  );
}
