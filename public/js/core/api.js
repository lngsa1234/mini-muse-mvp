// Browser client for the document backend (/api/docs → Neon + Vercel Blob).
// No build step: plain fetch + FileReader, no npm SDK in the browser.

const MAX_BYTES = 3 * 1024 * 1024; // keep in sync with server/docs.js

async function jcall(url, opts) {
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

// Returns an array of docs ({ id, title, text, t, url, contentType, size, example }).
export async function listDocs() {
  const data = await jcall("/api/docs");
  return (data && data.docs) || [];
}

export async function createTextDoc(title, text) {
  const data = await jcall("/api/docs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, text })
  });
  return data.doc;
}

export async function uploadDoc(file, title) {
  if (file.size > MAX_BYTES) throw new Error("File is too large (max 3MB).");
  const dataBase64 = await fileToBase64(file);
  const data = await jcall("/api/docs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: title || "",
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      dataBase64
    })
  });
  return data.doc;
}

export async function removeDoc(id) {
  await jcall("/api/docs/" + encodeURIComponent(id), { method: "DELETE" });
}

/* ---------- Ideas (/api/ideas → Neon) ---------- */
const jpost = (url, body) => jcall(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const jpatch = (url, body) => jcall(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// Returns an array of ideas ({ id, title, why, kind, basedOn, action, status, by, goalId, ruleKey, t }).
export async function listIdeas() {
  const data = await jcall("/api/ideas");
  return (data && data.ideas) || [];
}
export async function createIdea(idea) {
  const data = await jpost("/api/ideas", idea);
  return data.idea;
}
export async function updateIdea(id, patch) {
  const data = await jpatch("/api/ideas/" + encodeURIComponent(id), patch);
  return data.idea;
}
export async function removeIdea(id) {
  await jcall("/api/ideas/" + encodeURIComponent(id), { method: "DELETE" });
}

/* ---------- Goals (/api/goals → Neon) ---------- */
// Returns an array of goals ({ id, goal, steps: [{text,status}], t }).
export async function listGoals() {
  const data = await jcall("/api/goals");
  return (data && data.goals) || [];
}
export async function createGoal(goal, steps) {
  const data = await jpost("/api/goals", { goal, steps });
  return data.goal;
}
// step is 1-based.
export async function updateStep(id, step, status) {
  const data = await jpatch("/api/goals/" + encodeURIComponent(id), { step, status });
  return data.goal;
}
export async function removeGoal(id) {
  await jcall("/api/goals/" + encodeURIComponent(id), { method: "DELETE" });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Could not read file"));
    r.onload = () => {
      const s = String(r.result);
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s); // strip "data:...;base64," prefix
    };
    r.readAsDataURL(file);
  });
}
