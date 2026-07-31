// READ-ONLY: what exactly is plugged into each stale pin socket.
import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';

const env = readFileSync('/Users/GavinWest/robotics-camp-ide/backend/.env', 'utf8');
const uri = env.split('\n').find((l) => l.trim().startsWith('MONGODB_URI=')).slice('MONGODB_URI='.length).trim().replace(/^["']|["']$/g, '');

const client = new MongoClient(uri);
await client.connect();
const docs = await client.db('robotics_camp').collection('projects')
  .find({ name: { $in: ['Robotics Drive Code', 'abrar'] } }).toArray();

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) walk(n, visit); return; }
  if (typeof node.type === 'string' && (node.fields || node.inputs || node.next || node.id)) visit(node);
  for (const [k, v] of Object.entries(node)) {
    if (k === 'type' || k === 'fields') continue;
    walk(v, visit);
  }
}

for (const doc of docs) {
  console.log(`\n=== ${doc.name} ===`);
  walk(doc.workspace, (b) => {
    for (const [name, socket] of Object.entries(b.inputs || {})) {
      if (!['PIN', 'TRIG', 'ECHO'].includes(name)) continue;
      const child = socket.block || socket.shadow;
      const num = child?.fields?.NUM;
      console.log(
        `  ${b.type}.${name}: child=${child?.type ?? '(empty)'} NUM=${JSON.stringify(num)}` +
        `${socket.shadow && !socket.block ? ' [shadow only]' : ''}`,
      );
    }
  });
}
await client.close();
