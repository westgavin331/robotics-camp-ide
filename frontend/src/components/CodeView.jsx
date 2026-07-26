export default function CodeView({ code }) {
  return (
    <div className="code-view">
      <div className="code-view-header">sketch.ino</div>
      <pre className="code-view-body">
        <code>{code}</code>
      </pre>
    </div>
  );
}
