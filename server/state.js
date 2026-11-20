/*
 * User state + chat history request handlers (ADR-0008).
 * Shared by the Express server (server/index.js) and the Vercel function
 * (api/agent.js, ?scope=state). Each handler returns { status, json }.
 *
 *   GET    /api/state          -> { state, chat }   everything the app needs at boot
 *   PATCH  /api/state          -> { ok }            body: { key: value, ... } (top-level keys)
 *   POST   /api/state/audit    -> { ok }            body: { entries: [...] } (prepended)
 *   POST   /api/state/import   -> { imported }      body: { state, chat } — one-time upload of an
 *                                                   old browser's localStorage into an empty account
 *   DELETE /api/state/chat     -> { ok }            "Start over" clears the chat
 */
import { cleanPatch, CHAT_CAP } from "./userdata.js";

const err = (status, message) => ({ status, json: { error: message } });

export async function handleGetState(store, userId) {
  const [state, chat] = await Promise.all([store.getState(userId), store.listChat(userId, CHAT_CAP)]);
  return { status: 200, json: { state, chat } };
}

export async function handlePatchState(store, userId, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return err(400, "send an object of top-level keys");
  const patch = cleanPatch(body);
  if (JSON.stringify(patch).length > 2_000_000) return err(413, "state is too large");
  await store.patchState(userId, patch);
  return { status: 200, json: { ok: true, keys: Object.keys(patch) } };
}

export async function handleAppendAudit(store, userId, body) {
  const entries = (Array.isArray(body?.entries) ? body.entries : []).filter(e => e && typeof e === "object").slice(0, 50);
  if (entries.length) await store.appendAudit(userId, entries);
  return { status: 200, json: { ok: true } };
}

export async function handleClearChat(store, userId) {
  await store.clearChat(userId);
  return { status: 200, json: { ok: true } };
}

// Move a browser's old localStorage data to the server, but only into an
// account that has nothing yet, so a second device can't overwrite the first.
export async function handleImport(store, userId, body) {
  const [cur, chat] = await Promise.all([store.getState(userId), store.listChat(userId, 1)]);
  if (Object.keys(cur).length || chat.length) return { status: 200, json: { imported: false, reason: "account already has data" } };
  const state = body?.state && typeof body.state === "object" ? body.state : {};
  await store.patchState(userId, state);
  if (Array.isArray(state.audit) && state.audit.length) await store.appendAudit(userId, state.audit);
  const msgs = (Array.isArray(body?.chat) ? body.chat : []).slice(-CHAT_CAP);
  let t = Date.now() - msgs.length;
  for (const m of msgs) {
    if (!m || typeof m !== "object" || !m.id) continue;
    const msg = { ...m, live: false, t: Number(m.t) || ++t };
    for (const a of msg.acts || []) if (a.approval === "pending") a.approval = "expired";
    await store.saveMessage(userId, msg);
  }
  return { status: 200, json: { imported: true } };
}

// One dispatcher for both runtimes: action is "", "audit", "import" or "chat".
export async function dispatchState(store, { method, action = "", userId, body }) {
  if (!action && method === "GET") return handleGetState(store, userId);
  if (!action && method === "PATCH") return handlePatchState(store, userId, body);
  if (action === "audit" && method === "POST") return handleAppendAudit(store, userId, body);
  if (action === "import" && method === "POST") return handleImport(store, userId, body);
  if (action === "chat" && method === "DELETE") return handleClearChat(store, userId);
  return err(404, "not found");
}
