// One-off migration: converts projects saved with the workspace as a nested
// BSON subdocument (`workspace`) to the JSON-string field the app now writes
// (`workspaceJson`). See projects.js for why the storage changed -- Mongo
// caps document nesting at 50 levels and Blockly's format exceeds that on
// ordinary projects, so saving used to fail outright with "Nested BSON depth
// greater than 50 not allowed".
//
// Running this is optional: getProjectByName() reads legacy documents
// either way. It exists so the collection ends up in one consistent shape
// rather than two, and so the fallback can eventually be retired.
//
// Usage, from backend/:
//   node scripts/migrate-workspace-json.js --dry-run   # report only
//   node scripts/migrate-workspace-json.js             # convert
//
// Safe to re-run: documents already carrying workspaceJson are skipped, so
// a second run is a no-op.
import 'dotenv/config';
import { getProjectsCollection } from '../src/db.js';

const dryRun = process.argv.includes('--dry-run');

const collection = await getProjectsCollection();
const legacy = await collection.find({ workspace: { $exists: true } }).toArray();

if (legacy.length === 0) {
  console.log('Nothing to migrate -- no documents with a nested `workspace` field.');
  process.exit(0);
}

console.log(`${legacy.length} project(s) to migrate${dryRun ? ' (dry run, nothing will be written)' : ''}:`);

let migrated = 0;
for (const doc of legacy) {
  // A document could carry both fields only if a save landed between this
  // script reading and writing; the freshly-written string is the newer of
  // the two, so drop the stale subdocument rather than overwrite it.
  const alreadyConverted = typeof doc.workspaceJson === 'string';
  const workspaceJson = JSON.stringify(doc.workspace ?? {});
  console.log(
    `  ${doc.name ?? doc._id}: ${alreadyConverted ? 'already converted, dropping stale `workspace`' : `${workspaceJson.length} chars`}`,
  );
  if (dryRun) continue;
  await collection.updateOne(
    { _id: doc._id },
    {
      ...(alreadyConverted ? {} : { $set: { workspaceJson } }),
      $unset: { workspace: '' },
    },
  );
  migrated++;
}

console.log(dryRun ? '\nDry run complete.' : `\nMigrated ${migrated} project(s).`);
process.exit(0);
