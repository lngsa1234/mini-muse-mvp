/*
 * In-memory store with the same interface as makeDbStore() (server/userdata.js).
 * Used by the tests, and handy for trying the agent runtime without Neon.
 */
import { AUDIT_CAP, CHAT_CAP, cleanPatch } from "../userdata.js";

const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function makeMemoryStore() {
  const states = new Map(), chats = new Map(), waits = new Map();
  let n = 0;
  const chatOf = u => (chats.has(u) ? chats.get(u) : chats.set(u, new Map()).get(u));
  return {
    async getState(userId) { return clone(states.get(userId) || {}); },
    async patchState(userId, patch) { states.set(userId, { ...(states.get(userId) || {}), ...clone(cleanPatch(patch)) }); },
    async appendAudit(userId, entries) {
      const cur = states.get(userId) || {};
      const list = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
      states.set(userId, { ...cur, audit: [...clone(list), ...(cur.audit || [])].slice(0, AUDIT_CAP) });
    },
    async listChat(userId, limit = CHAT_CAP) {
      return clone([...chatOf(userId).values()].sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1)).slice(-limit));
    },
    async getMessage(userId, id) { return clone(chatOf(userId).get(id) || null); },
    async saveMessage(userId, msg) { chatOf(userId).set(msg.id, clone(msg)); },
    async clearChat(userId) {
      chats.delete(userId);
      for (const w of waits.values()) if (w.userId === userId && w.status === "pending") w.status = "expired";
    },
    async createWait(userId, { id, messageId, kind, request }) {
      const wid = id || "w" + (++n);
      waits.set(wid, { id: wid, userId, messageId, kind, request: clone(request || {}), response: null, status: "pending" });
      return wid;
    },
    async getWait(userId, id) {
      const w = waits.get(id);
      return w && w.userId === userId ? clone({ id: w.id, messageId: w.messageId, kind: w.kind, request: w.request, response: w.response, status: w.status }) : null;
    },
    async answerWait(userId, id, response) {
      const w = waits.get(id);
      if (!w || w.userId !== userId || w.status !== "pending") return false;
      w.response = clone(response ?? null); w.status = "answered"; return true;
    },
    async expireWait(userId, id) { const w = waits.get(id); if (w && w.userId === userId && w.status === "pending") w.status = "expired"; }
  };
}
