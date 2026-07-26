import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const FQBN = process.env.ARDUINO_FQBN || 'arduino:avr:uno';
const COMPILE_TIMEOUT_MS = Number(process.env.COMPILE_TIMEOUT_MS) || 30000;
const SKETCH_NAME = 'sketch';

// Resolution order: explicit env var, the well-known location this project's
// setup installs arduino-cli to (no sudo required), then whatever's on PATH.
function resolveArduinoCliPath() {
  if (process.env.ARDUINO_CLI_PATH) return process.env.ARDUINO_CLI_PATH;
  const localInstall = path.join(homedir(), '.arduino-cli-bin', 'arduino-cli');
  if (existsSync(localInstall)) return localInstall;
  return 'arduino-cli';
}

const ARDUINO_CLI_PATH = resolveArduinoCliPath();

// GCC-style diagnostic lines look like:
//   /path/to/sketch.ino:6:3: error: expected ';' before 'x'
// followed by a source snippet + a "^" pointer line, which we drop -- the
// file/line/column/message is what's actually useful to surface.
const DIAGNOSTIC_RE = /^(.+?):(\d+):(\d+):\s*(error|warning|note):\s*(.+)$/;

function parseDiagnostics(compilerErr) {
  if (!compilerErr) return [];
  const diagnostics = [];
  for (const rawLine of compilerErr.split('\n')) {
    const match = DIAGNOSTIC_RE.exec(rawLine.trim());
    if (!match) continue;
    const [, , lineNo, column, severity, message] = match;
    // "note:" lines are GCC supplementary context (e.g. candidate function
    // lists) -- usually more confusing than helpful for a beginner reading
    // their first compiler error, so they're left out of the clean list
    // (still present in rawOutput for anyone who wants the full dump).
    if (severity === 'note') continue;
    diagnostics.push({
      line: Number(lineNo),
      column: Number(column),
      severity,
      message: message.trim(),
    });
  }
  return diagnostics;
}

// Compiles one .ino sketch and returns a plain result object -- never
// throws for a normal compile failure (bad code is expected and handled as
// data); it only throws for actual infrastructure problems (arduino-cli
// missing, timeout, unparseable output), which the caller maps to a 500.
export async function compileSketch(code) {
  // Resolved to its real path up front: on macOS, os.tmpdir() lives under
  // /var, which is itself a symlink to /private/var, and the compiler
  // reports paths post-resolution. Without this, the temp-dir-stripping
  // below wouldn't match and would leak the path into error messages.
  const workDir = await realpath(await mkdtemp(path.join(tmpdir(), 'robotics-camp-')));
  const sketchDir = path.join(workDir, SKETCH_NAME);
  const buildDir = path.join(workDir, 'build');
  const sketchFile = path.join(sketchDir, `${SKETCH_NAME}.ino`);

  try {
    await mkdir(sketchDir, { recursive: true });
    await writeFile(sketchFile, code, 'utf8');

    let stdout;
    try {
      ({ stdout } = await execFileAsync(
        ARDUINO_CLI_PATH,
        ['compile', '--fqbn', FQBN, '--output-dir', buildDir, '--format', 'json', sketchDir],
        { timeout: COMPILE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      ));
    } catch (err) {
      // arduino-cli exits non-zero on a compile error, but still writes a
      // valid JSON result to stdout -- recover it instead of treating this
      // as an infra failure. If stdout is missing entirely (e.g. the binary
      // itself wasn't found, or the timeout fired), it's a real infra error.
      if (err.stdout) {
        stdout = err.stdout;
      } else if (err.code === 'ENOENT') {
        const notFound = new Error(
          `arduino-cli not found at "${ARDUINO_CLI_PATH}". Set ARDUINO_CLI_PATH or install it on PATH.`,
        );
        notFound.cause = err;
        throw notFound;
      } else if (err.killed && err.signal) {
        throw new Error(`arduino-cli compile timed out after ${COMPILE_TIMEOUT_MS}ms.`);
      } else {
        throw err;
      }
    }

    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      throw new Error(`arduino-cli produced output that wasn't valid JSON: ${stdout.slice(0, 500)}`);
    }

    if (!result.success) {
      // compiler_err is full of the sketch's throwaway temp-dir path
      // (.../robotics-camp-XXXXXX/sketch/sketch.ino) -- strip it down to
      // just "sketch.ino" so nothing about the server's filesystem leaks
      // into an error a kid is looking at.
      const cleanedErr = (result.compiler_err || '').split(`${sketchDir}${path.sep}`).join('');
      return {
        ok: false,
        errors: parseDiagnostics(cleanedErr),
        rawOutput: cleanedErr,
      };
    }

    const hexPath = path.join(buildDir, `${SKETCH_NAME}.ino.hex`);
    const hexBuffer = await readFile(hexPath);
    const sections = result.builder_result?.executable_sections_size || [];
    const program = sections.find((s) => s.name === 'text');
    const data = sections.find((s) => s.name === 'data');

    return {
      ok: true,
      hex: hexBuffer.toString('base64'),
      size: {
        program: program ? { bytes: program.size, maxBytes: program.max_size } : null,
        data: data ? { bytes: data.size, maxBytes: data.max_size } : null,
      },
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
