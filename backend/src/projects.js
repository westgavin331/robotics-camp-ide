import { getProjectsCollection } from './db.js';

const MAX_NAME_LENGTH = 60;

// Case-insensitive identity: a kid typing "Team Rocket" one day and
// "team rocket" the next should overwrite the same save, not create a
// second one they then can't find. The trimmed *display* name (original
// casing) is kept separately so the Load list still shows it the way they
// typed it.
function normalizeName(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

export function validateName(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { ok: false, error: 'Enter a name to save under.' };
  if (trimmed.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Names can be at most ${MAX_NAME_LENGTH} characters.` };
  }
  return { ok: true, name: trimmed };
}

// The Blockly workspace state is stored as a JSON *string*, not as a nested
// subdocument, because MongoDB rejects any document nested deeper than 50
// levels ("Nested BSON depth greater than 50 not allowed") and Blockly's
// format blows past that on ordinary projects. Depth there tracks block
// count, not just how deep the blocks look on screen: a plain run of
// sequential statements serializes as a `next.block.next.block...` chain,
// two levels per block, so ~22 blocks in a row is already over the cap, and
// a block plugged into a socket costs three (`inputs.NAME.block`). Storing
// the state as one opaque string makes its depth irrelevant to BSON -- the
// server only ever sees a scalar.
//
// customBlocks stays a real array: its shape is fixed and shallow (array ->
// definition -> params array -> param, 4 levels) no matter how many custom
// blocks a kid makes, so it can't hit the cap.
export async function saveProjectData(name, { workspace, customBlocks }) {
  const collection = await getProjectsCollection();
  const updatedAt = new Date();
  await collection.replaceOne(
    { _id: normalizeName(name) },
    {
      _id: normalizeName(name),
      name,
      workspaceJson: JSON.stringify(workspace ?? {}),
      customBlocks: Array.isArray(customBlocks) ? customBlocks : [],
      updatedAt,
    },
    { upsert: true },
  );
  return { name, updatedAt };
}

export async function listProjectNames() {
  const collection = await getProjectsCollection();
  const docs = await collection
    .find({}, { projection: { name: 1, updatedAt: 1 } })
    .sort({ name: 1 })
    .collation({ locale: 'en', strength: 2 })
    .toArray();
  return docs.map((d) => ({ name: d.name, updatedAt: d.updatedAt }));
}

// Reads back the shape the frontend already expects -- `workspace` as a real
// object -- so the HTTP contract is unchanged by the string storage above.
//
// Projects saved before that change stored `workspace` as a subdocument;
// those are read straight through. (They necessarily fit inside the depth
// cap, or they could never have been written in the first place.)
// scripts/migrate-workspace-json.js converts them in place, but this
// fallback is what makes running it optional rather than a prerequisite.
//
// A JSON.parse failure here is left to throw rather than degraded to an
// empty workspace: silently opening a blank canvas invites a kid to hit
// Save over the top of it, turning unreadable data into lost data.
export async function getProjectByName(name) {
  const collection = await getProjectsCollection();
  const doc = await collection.findOne({ _id: normalizeName(name) });
  if (!doc) return null;
  const workspace = typeof doc.workspaceJson === 'string'
    ? JSON.parse(doc.workspaceJson)
    : doc.workspace ?? {};
  return { workspace, customBlocks: doc.customBlocks ?? [] };
}

// Returns true if a project with this name existed and was removed, false
// if there was nothing to delete (same "already gone" case the frontend
// treats as a 404, not an error -- see index.js).
export async function deleteProjectByName(name) {
  const collection = await getProjectsCollection();
  const result = await collection.deleteOne({ _id: normalizeName(name) });
  return result.deletedCount > 0;
}
