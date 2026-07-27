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

// Upserts by normalized name -- re-saving under the same name (any casing)
// updates that same project rather than creating a duplicate.
export async function saveProjectData(name, { workspace, customBlocks }) {
  const collection = await getProjectsCollection();
  const updatedAt = new Date();
  await collection.replaceOne(
    { _id: normalizeName(name) },
    {
      _id: normalizeName(name),
      name,
      workspace: workspace ?? {},
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

export async function getProjectByName(name) {
  const collection = await getProjectsCollection();
  const doc = await collection.findOne({ _id: normalizeName(name) });
  if (!doc) return null;
  return { workspace: doc.workspace, customBlocks: doc.customBlocks };
}
