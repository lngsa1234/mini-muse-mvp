// Persistence: one copy of the user's state on the server (ADR-0008).
// ---------------------------------------------------------------------------
// The server keeps chat, memory, contacts, prefs, connector permissions and the
// activity log in Postgres (server/userdata.js), so every device sees the same
// thing. Documents, ideas and goals have their own APIs (main.js loads them).
//
//   loadState()   GET /api/state at boot (and when the tab regains focus)
//   save()        debounced; PATCHes only the top-level keys that changed
//   adopt(part)   take values the server already has (e.g. memory the agent
//                 just saved) without sending them back
//
// Chat messages are written by the server agent, never by save(). The
// activity log is append-only: core/activity.js posts new entries.
import { state, blank } from "./state.js";
import * as api from "./api.js";

const LS = "mini-muse-v1";            // pre-ADR-0008 localStorage key
const LS_MOVED = "mini-muse-v1-moved"; // set once that data was uploaded
const NOT_SYNCED = new Set(["chat", "docs", "ideas", "plans", "audit"]);

const STALE_MS = 10 * 60_000;
let synced = {};   // key -> JSON of the value the server has
export let offline = false; // true when the server state couldn't be loaded

export function migrate(s) {
  const b = blank(), out = Object.assign(b, s);
  out.connectors = Object.assign(blank().connectors, s.connectors || {});
  if (!s.connectors && (s.events || []).length) { out.connectors.calendar.on = true; out.seeded = { ...(out.seeded || {}), calendar: true }; }
  out.seeded ||= {};
  out.prefs = { ...b.prefs, ...(s.prefs || {}) };
  out.chat = Array.isArray(s.chat) ? s.chat : [];
  // A turn that stopped updating long ago died with its server; show it as ended.
  for (const m of out.chat) if (m.live && Date.now() - (m.updatedAt || m.t) > STALE_MS) {
    m.live = false;
    for (const a of m.acts || []) if (a.approval === "pending") { a.approval = "expired"; a.label = "No answer: " + (a.card?.summary || "request"); }
  }
  out.audit = Array.isArray(s.audit) ? s.audit : [];
  out.docs = []; // documents live on the server; loaded separately at boot (main.js)
  out.ideas = []; out.plans = []; // ideas & goals live on the server too (main.js)
  return out;
}

const remember = s => { synced = {}; for (const k of Object.keys(s)) if (!NOT_SYNCED.has(k)) synced[k] = JSON.stringify(s[k]); };

// Upload this browser's old localStorage copy once, into an empty account.
async function moveLocalData() {
  let raw = null;
  try { if (localStorage.getItem(LS_MOVED)) return false; raw = localStorage.getItem(LS); } catch (_) { return false; }
  if (!raw) return false;
  try {
    const old = JSON.parse(raw), chat = Array.isArray(old.chat) ? old.chat : [];
    const body = { ...old }; delete body.chat; delete body.docs; delete body.ideas; delete body.plans;
    const out = await api.importLocalState(body, chat);
    try { localStorage.setItem(LS_MOVED, new Date().toISOString()); } catch (_) {}
    return !!out?.imported;
  } catch (_) { return false; }
}

// Returns the saved state (migrated), or null when the server couldn't be reached.
export async function loadState() {
  try {
    let data = await api.getUserState();
    if (!Object.keys(data.state || {}).length && !(data.chat || []).length && await moveLocalData()) data = await api.getUserState();
    const s = migrate({ ...(data.state || {}), chat: data.chat || [] });
    remember(s); offline = false;
    return s;
  } catch (e) {
    offline = true;
    return null;
  }
}

// Take values that already came from the server.
export function adopt(part) {
  for (const [k, v] of Object.entries(part || {})) {
    state[k] = v;
    if (!NOT_SYNCED.has(k)) synced[k] = JSON.stringify(v);
  }
}

let saving = false, again = false, timer = null;
// Debounced save; call after any state change.
export function save() { clearTimeout(timer); timer = setTimeout(flush, 500); }
export async function flush() {
  clearTimeout(timer);
  if (offline) return;
  if (saving) { again = true; return; }
  saving = true;
  const patch = {};
  for (const k of Object.keys(state)) {
    if (NOT_SYNCED.has(k)) continue;
    const json = JSON.stringify(state[k]);
    if (json !== synced[k]) patch[k] = JSON.parse(json);
  }
  if (Object.keys(patch).length) {
    try {
      await api.patchUserState(patch);
      for (const k of Object.keys(patch)) synced[k] = JSON.stringify(patch[k]);
    } catch (_) { /* keep the diff; the next save retries */ }
  }
  saving = false;
  if (again) { again = false; flush(); }
}

// "Start over": empty chat, state and activity log on the server too.
export async function resetAll(keep = {}) {
  const fresh = { ...blank(), ...keep };
  try { await api.clearChat(); } catch (_) {}
  try { await api.patchUserState({ ...strip(fresh), audit: [] }); } catch (_) {}
  remember(fresh);
  return fresh;
}
const strip = s => Object.fromEntries(Object.entries(s).filter(([k]) => !NOT_SYNCED.has(k)));
