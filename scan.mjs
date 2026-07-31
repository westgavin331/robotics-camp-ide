// READ-ONLY scan of the saved projects: which ones reference block types the
// frontend no longer defines, and which still carry pre-dropdown pin sockets.
import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';

const env = readFileSync('/Users/GavinWest/robotics-camp-ide/backend/.env', 'utf8');
const uri = env.split('\n').find((l) => l.trim().startsWith('MONGODB_URI='))?.slice('MONGODB_URI='.length).trim().replace(/^["']|["']$/g, '');
if (!uri) throw new Error('no MONGODB_URI in backend/.env');

const client = new MongoClient(uri);
await client.connect();
const docs = await client.db('robotics_camp').collection('projects').find({}).toArray();

// Walk every block state in a saved workspace.
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) walk(n, visit); return; }
  if (typeof node.type === 'string' && (node.fields || node.inputs || node.next || node.id || node.x !== undefined)) visit(node);
  for (const [k, v] of Object.entries(node)) {
    if (k === 'type' || k === 'fields') continue;
    walk(v, visit);
  }
}

const report = [];
const allTypes = new Map();
for (const doc of docs) {
  const types = new Map();
  const socketPins = [];
  walk(doc.workspace, (b) => {
    types.set(b.type, (types.get(b.type) || 0) + 1);
    allTypes.set(b.type, (allTypes.get(b.type) || 0) + 1);
    for (const name of Object.keys(b.inputs || {})) {
      if (['PIN', 'TRIG', 'ECHO'].includes(name)) socketPins.push(`${b.type}.${name}`);
    }
  });
  report.push({
    name: doc.name,
    updatedAt: doc.updatedAt,
    blocks: [...types.entries()].reduce((a, [, n]) => a + n, 0),
    setPinMode: types.get('io_set_pin_mode') || 0,
    socketPins,
    customBlocks: (doc.customBlocks || []).length,
  });
}

console.log(`\n=== ${docs.length} saved projects ===`);
for (const r of report) {
  const flags = [];
  if (r.setPinMode) flags.push(`io_set_pin_mode x${r.setPinMode}`);
  if (r.socketPins.length) flags.push(`old pin sockets: ${r.socketPins.join(', ')}`);
  console.log(`${flags.length ? 'XX' : 'ok'}  ${r.name}  (${r.blocks} blocks, ${r.customBlocks} custom)  ${flags.join(' | ') || ''}`);
}

console.log('\n=== every block type across all saves ===');
console.log([...allTypes.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([t, n]) => `${t} x${n}`).join('\n'));

await client.close();
