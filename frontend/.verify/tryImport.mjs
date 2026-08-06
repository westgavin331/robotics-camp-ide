import { importCpp, ImportRejected } from '../src/importCpp/index.js';

export async function tryImport(src) {
  try {
    return { ok: true, project: await importCpp(src) };
  } catch (err) {
    if (err instanceof ImportRejected) return { ok: false, errors: err.errors };
    throw err;
  }
}
