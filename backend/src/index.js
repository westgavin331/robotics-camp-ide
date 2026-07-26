import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSketch } from './compile.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Same mkcert cert/key pair the frontend (vite.config.js) uses, one level
// further up from here (backend/src -> backend -> repo root). WebSerial
// requires a secure context, and once the frontend is HTTPS, the browser
// blocks it from calling a plain-HTTP backend as mixed content -- so this
// has to be HTTPS too, sharing the same cert.
const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const certFile = path.join(repoRoot, '10.66.160.89+1.pem');
const keyFile = path.join(repoRoot, '10.66.160.89+1-key.pem');
const hasCerts = fs.existsSync(certFile) && fs.existsSync(keyFile);

// CORS stays wide open (no origin allowlist) -- already true before this
// change, and an https:// origin doesn't need anything different from an
// http:// one here, just a real one to be reflected instead of a wildcard,
// which cors() already does by default when a request sends an Origin header.
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Compiles Blockly-generated .ino text with arduino-cli (arduino:avr:uno) and
// returns either the compiled .hex (base64) or a cleaned-up list of compiler
// diagnostics -- see spec section 1/4 and compile.js for the pipeline itself.
app.post('/api/compile', async (req, res) => {
  const { code } = req.body || {};
  if (typeof code !== 'string' || code.trim() === '') {
    return res.status(400).json({ error: 'Request body must include a non-empty "code" string.' });
  }

  try {
    const result = await compileSketch(code);
    if (result.ok) {
      return res.json({ success: true, hex: result.hex, size: result.size });
    }
    // Not a server error -- a kid's sketch failing to compile is the normal
    // case this endpoint expects to handle, so it's still a 200 with
    // success: false, not a 4xx/5xx.
    return res.json({ success: false, errors: result.errors, rawOutput: result.rawOutput });
  } catch (err) {
    console.error('Compile pipeline error:', err);
    return res.status(500).json({
      error: 'compile_pipeline_error',
      message: err.message || 'Unexpected error running the compile pipeline.',
    });
  }
});

if (hasCerts) {
  const server = https.createServer(
    { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) },
    app,
  );
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend listening on https://localhost:${PORT} and https://10.66.160.89:${PORT}`);
  });
} else {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Backend listening on http://localhost:${PORT} (no cert found at ${certFile}, falling back to plain HTTP)`,
    );
  });
}
