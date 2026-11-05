// Browser client for the document backend (/api/docs → Neon Postgres).
// No build step: plain fetch + FileReader, no npm SDK in the browser.
import { activeTraceparent } from "./trace.js";

const MAX_BYTES = 3 * 1024 * 1024; // keep in sync with server/docs.js

// Attach the active span's W3C traceparent so the server's db/http spans join
// the current client trace. No-op when nothing is being traced.
function withTraceparent(opts = {}) {
  const tp = activeTraceparent();
  if (!tp) return opts;
  return { ...opts, headers: { ...(opts.headers || {}), traceparent: tp } };
}

async function jcall(url, opts) {
  const res = await fetch(url, withTraceparent(opts));
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

// Returns an array of docs ({ id, title, text, t, contentType, size, example }).
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

/* ---------- Web browsing (/api/web → Tavily) ---------- */
// Returns an array of results ({ title, url, snippet }).
export async function webSearch(query) {
  const data = await jpost("/api/web/search", { query });
  return (data && data.results) || [];
}
// Returns { title, url, text } for a single page.
export async function webOpen(url) {
  return jpost("/api/web/open", { url });
}

/* ---------- Google connectors (tokens remain in an HttpOnly server cookie) ---------- */
export async function googleStatus() { return jcall("/api/google/status"); }
export async function disconnectGoogle() { return jpost("/api/google/disconnect", {}); }
export async function googleMailSearch(query) { return jpost("/api/google/mail/search", { query }); }
export async function googleMailRead(id) { return jpost("/api/google/mail/read", { id }); }
export async function googleMailSend(data) { return jpost("/api/google/mail/send", data); }
export async function googleCalendarList(from_date) { return jpost("/api/google/calendar/list", { from_date }); }
export async function googleCalendarAdd(data) { return jpost("/api/google/calendar/add", data); }
export async function googleCalendarRemove(event_id) { return jpost("/api/google/calendar/remove", { event_id }); }

/* ---------- Observability viewer (/api/trace → Neon) ---------- */
// Recent traces, newest first: [{ trace_id, name, root_kind, duration_ms, status, ... }].
export async function listTraces(limit = 50) {
  const data = await jcall("/api/trace?limit=" + encodeURIComponent(limit));
  return (data && data.traces) || [];
}
// One trace with its spans: { trace, spans: [...] }.
export async function getTrace(id) {
  return jcall("/api/trace?id=" + encodeURIComponent(id));
}
// Recent logs, optionally scoped to a trace: [{ id, severity, body, ... }].
export async function listLogs({ traceId, limit = 100 } = {}) {
  const qs = new URLSearchParams({ view: "logs", limit: String(limit) });
  if (traceId) qs.set("trace_id", traceId);
  const data = await jcall("/api/trace?" + qs.toString());
  return (data && data.logs) || [];
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
