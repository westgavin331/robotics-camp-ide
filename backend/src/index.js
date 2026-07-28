import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSketch } from './compile.js';
import { createCompileQueue } from './compileQueue.js';
import { validateName, saveProjectData, listProjectNames, getProjectByName, deleteProjectByName } from './projects.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Defaults to strictly one compile at a time -- Render's free web service
// tier is 512MB RAM / 0.1 CPU (render.com/docs/free), and each compile is a
// real arduino-cli/avr-gcc subprocess burst (see compileQueue.js). Override
// via env var once/if this ever moves to a paid instance with real
// multi-core headroom to actually run more than one at once.
const COMPILE_CONCURRENCY = Number(process.env.COMPILE_CONCURRENCY) || 1;
const enqueueCompile = createCompileQueue(COMPILE_CONCURRENCY);

// Same mkcert cert/key pair the frontend (vite.config.js) uses, one level
// further up from here (backend/src -> backend -> repo root). WebSerial
// requires a secure context, and once the frontend is HTTPS, the browser
// blocks it from calling a plain-HTTP backend as mixed content -- so this
// has to be HTTPS too, sharing the same cert, for *local* LAN testing.
//
// Only ever looked for outside production: this pair is gitignored, local-
// only private key material tied to one Mac's old LAN IP, and Render's
// backend/Dockerfile sets NODE_ENV=production -- Render terminates real,
// browser-trusted HTTPS itself at its edge and forwards plain HTTP to the
// container, so it never needs (or has) this local cert, and shouldn't
// even check for it. Matches the same NODE_ENV-gated pattern
// frontend/vite.config.js already uses for its own (separate) copy of this
// same cert-lookup, for the same reason.
const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const certFile = path.join(repoRoot, '10.66.160.89+1.pem');
const keyFile = path.join(repoRoot, '10.66.160.89+1-key.pem');
const hasCerts =
  process.env.NODE_ENV !== 'production' && fs.existsSync(certFile) && fs.existsSync(keyFile);

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
    const result = await enqueueCompile(() => compileSketch(code));
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

// Named save/load (spec: kid/team-named projects that follow them across
// devices, backed by MongoDB Atlas -- see db.js for why). Every route here
// can fail for the same underlying reason (no MONGODB_URI, or Atlas
// unreachable) -- caught uniformly and reported as a distinct "infra" error
// the frontend renders as "couldn't reach the save service", the same
// pattern /api/compile already uses for its own infra-vs-data-error split.
app.post('/api/projects', async (req, res) => {
  const { name, workspace, customBlocks } = req.body || {};
  const validated = validateName(name);
  if (!validated.ok) {
    return res.status(400).json({ success: false, error: validated.error });
  }
  try {
    const result = await saveProjectData(validated.name, { workspace, customBlocks });
    return res.json({ success: true, name: result.name, updatedAt: result.updatedAt });
  } catch (err) {
    console.error('Save project error:', err);
    return res.status(503).json({ success: false, error: 'Could not reach the save service.' });
  }
});

app.get('/api/projects', async (_req, res) => {
  try {
    const projects = await listProjectNames();
    return res.json({ success: true, projects });
  } catch (err) {
    console.error('List projects error:', err);
    return res.status(503).json({ success: false, error: 'Could not reach the save service.' });
  }
});

app.get('/api/projects/:name', async (req, res) => {
  try {
    const project = await getProjectByName(req.params.name);
    if (!project) {
      return res.status(404).json({ success: false, error: 'No saved project with that name.' });
    }
    return res.json({ success: true, project });
  } catch (err) {
    console.error('Load project error:', err);
    return res.status(503).json({ success: false, error: 'Could not reach the save service.' });
  }
});

app.delete('/api/projects/:name', async (req, res) => {
  try {
    const deleted = await deleteProjectByName(req.params.name);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'No saved project with that name.' });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('Delete project error:', err);
    return res.status(503).json({ success: false, error: 'Could not reach the save service.' });
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
    const reason =
      process.env.NODE_ENV === 'production'
        ? 'production -- Render terminates real HTTPS at its edge'
        : `no local cert found at ${certFile}`;
    console.log(`Backend listening on http://0.0.0.0:${PORT} (plain HTTP: ${reason})`);
  });
}
