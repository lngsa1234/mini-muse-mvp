// Persistence: a private per-viewer doc when the host provides one, else localStorage.
import { state, blank } from "./state.js";

let docRef = null;
const LS = "mini-muse-v1";

export function migrate(s) {
  const b = blank(), out = Object.assign(b, s);
  out.connectors = Object.assign(blank().connectors, s.connectors || {});
  if (!s.connectors && (s.events || []).length) { out.connectors.calendar.on = true; out.seeded = { ...(out.seeded || {}), calendar: true }; }
  out.seeded ||= {};
  out.docs = []; // documents live on the server now; loaded separately at boot (main.js)
  out.ideas = []; out.plans = []; // ideas & goals live on the server too (main.js)
  return out;
}

export async function loadState() {
  try {
    if (window.agent?.use) {
      const [db, user] = await Promise.all([agent.use("db"), agent.use("user")]);
      const uid = user ? await user.id() : null;
      if (db && uid) {
        docRef = db.doc("data/users/" + uid + "/muse");
        const snap = await docRef.get();
        return snap.exists ? migrate(JSON.parse(JSON.stringify(snap.data()))) : null;
      }
    }
  } catch (e) { docRef = null; }
  try { const raw = localStorage.getItem(LS); if (raw) return migrate(JSON.parse(raw)); } catch (e) {}
  return null;
}

let saving = false, again = false, timer = null;
// Debounced save; call after any state change.
export function save() { clearTimeout(timer); timer = setTimeout(flush, 500); }
export async function flush() {
  if (saving) { again = true; return; }
  saving = true;
  state.chat = state.chat.slice(-40);
  state.audit = state.audit.slice(0, 150);
  const body = JSON.parse(JSON.stringify(state));
  delete body.docs; delete body.ideas; delete body.plans; // persisted server-side, not in localStorage
  try { if (docRef) await docRef.set(body); else localStorage.setItem(LS, JSON.stringify(body)); }
  catch (e) { try { localStorage.setItem(LS, JSON.stringify(body)); } catch (_) {} }
  saving = false;
  if (again) { again = false; flush(); }
}
