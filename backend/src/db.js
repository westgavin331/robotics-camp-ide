import { MongoClient } from 'mongodb';

// Named-save storage: MongoDB Atlas free tier (M0). Chosen over Render's own
// free PostgreSQL after checking both against Render's actual current docs
// (not assumed from memory) -- see README's "Deploying to production"
// section for the full comparison. Short version: Render's free web
// services have no persistent disk (filesystem is wiped on every restart/
// redeploy, confirmed via render.com/docs/disks), so file-based storage
// here isn't an option at all; Render's free Postgres does persist, but
// expires 30 days after creation (14-day grace period, then the database
// and everything in it is deleted for good) -- a real risk of silently
// losing every kid's saved project if nobody remembers to recreate it
// before then. MongoDB Atlas's free M0 cluster has no such expiration or
// inactivity pause, at the cost of being a second account/provider to set
// up (see README for the walkthrough).
//
// Connects lazily on first use rather than at server startup, so the rest
// of the app (compile/upload, which don't need a database at all) keeps
// working even if MONGODB_URI is missing or Atlas is briefly unreachable --
// only the save/load routes fail, with a clear error the frontend turns
// into a kid-friendly message (see index.js).
let clientPromise = null;

function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set -- see README for MongoDB Atlas setup.');
  }
  if (!clientPromise) {
    const client = new MongoClient(uri);
    clientPromise = client.connect().then(() => client);
  }
  return clientPromise;
}

export async function getProjectsCollection() {
  const client = await connect();
  return client.db('robotics_camp').collection('projects');
}
