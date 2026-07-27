import { BACKEND_URL } from '../config.js';

// Thin wrappers around the named-save backend routes (backend/src/index.js
// + projects.js) -- named saves are the cross-device layer (MongoDB Atlas),
// separate from the same-device localStorage autosave in
// ../blockly/projectIO.js. Every function throws a plain Error with a
// message already suitable to show a kid (SaveDialog/LoadDialog just
// display err.message directly) -- the backend's own {success:false, error}
// shape is unwrapped here so callers don't each need to know it.

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function listProjects() {
  let res;
  try {
    res = await fetch(`${BACKEND_URL}/api/projects`);
  } catch {
    throw new Error("Couldn't reach the save service. Check your internet and try again.");
  }
  const data = await parseJsonSafe(res);
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Couldn't reach the save service.");
  }
  return data.projects || [];
}

export async function fetchProject(name) {
  let res;
  try {
    res = await fetch(`${BACKEND_URL}/api/projects/${encodeURIComponent(name)}`);
  } catch {
    throw new Error("Couldn't reach the save service. Check your internet and try again.");
  }
  const data = await parseJsonSafe(res);
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Couldn't load that project.");
  }
  return data.project;
}

export async function deleteProject(name) {
  let res;
  try {
    res = await fetch(`${BACKEND_URL}/api/projects/${encodeURIComponent(name)}`, { method: 'DELETE' });
  } catch {
    throw new Error("Couldn't reach the save service. Check your internet and try again.");
  }
  const data = await parseJsonSafe(res);
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Couldn't delete that project.");
  }
  return data;
}

export async function saveProject(name, project) {
  let res;
  try {
    res = await fetch(`${BACKEND_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ...project }),
    });
  } catch {
    throw new Error("Couldn't reach the save service. Check your internet and try again.");
  }
  const data = await parseJsonSafe(res);
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Couldn't save right now. Try again.");
  }
  return data;
}
