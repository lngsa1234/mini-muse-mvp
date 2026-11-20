/*
 * Per-user app state, chat history and agent waits (Neon Postgres).
 * ---------------------------------------------------------------------------
 * Before ADR-0008 these lived in each browser's localStorage, so a laptop and a
 * desktop each had their own chat, memory and settings. Now there is one copy
 * per user on the server.
 *
 *   user_state     one JSONB object of top-level keys (memory, contacts, prefs,
 *                  connectors, audit, ...). Writers PATCH only the keys they
 *                  changed, so the browser and the server agent don't clobber
 *                  each other's keys.
 *   chat_messages  one row per chat message; the agent updates its message
 *                  while a turn runs.
 *   agent_waits    approvals and browser-only tool calls a running turn is
 *                  waiting on (see server/agent/runtime.js).
 *
 * makeDbStore() is the production store. server/agent/memory-store.js has the
 * same interface for tests.
 */
import { sql, newId } from "./db.js";

export const AUDIT_CAP = 150;
export const CHAT_CAP = 40;

// Keys that are never kept in user_state: they have their own tables.
export const SERVER_TABLE_KEYS = ["chat", "docs", "ideas", "plans"];

// Create the tables once per process, so existing databases upgrade without
// re-running `npm run db:init` (same pattern as ensureGoalColumns in db.js).
let _tables = null;
function ensureTables() {
  if (!_tables) {
    const s = sql();
    _tables = (async () => {
      await s`create table if not exists user_state (user_id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now())`;
      await s`create table if not exists chat_messages (id text primary key, user_id text not null, t bigint not null, data jsonb not null, updated_at timestamptz not null default now())`;
      await s`create index if not exists chat_messages_user_t on chat_messages (user_id, t)`;
      await s`create table if not exists agent_waits (id text primary key, user_id text not null, message_id text not null, kind text not null, request jsonb not null default '{}'::jsonb, response jsonb, status text not null default 'pending', created_at timestamptz not null default now(), answered_at timestamptz)`;
      await s`create index if not exists agent_waits_message on agent_waits (message_id)`;
    })().catch(e => { _tables = null; throw e; });
  }
  return _tables;
}

// Drop keys that belong to other tables, and anything that isn't a plain key.
export function cleanPatch(patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch && typeof patch === "object" ? patch : {})) {
    if (SERVER_TABLE_KEYS.includes(k) || !/^[A-Za-z][\w]{0,40}$/.test(k) || v === undefined) continue;
    // The activity log is append-only (appendAudit); a patch may only empty it ("Start over").
    if (k === "audit" && !(Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out;
}

const toWait = r => r && ({ id: r.id, messageId: r.message_id, kind: r.kind, request: r.request || {}, response: r.response ?? null, status: r.status });

export function makeDbStore() {
  return {
    async getState(userId) {
      await ensureTables();
      const rows = await sql()`select data from user_state where user_id = ${userId}`;
      return rows[0]?.data || {};
    },

    // Shallow merge: only the given top-level keys change.
    async patchState(userId, patch) {
      await ensureTables();
      const p = cleanPatch(patch);
      if (!Object.keys(p).length) return;
      await sql()`
        insert into user_state (user_id, data) values (${userId}, ${JSON.stringify(p)}::jsonb)
        on conflict (user_id) do update set data = user_state.data || excluded.data, updated_at = now()`;
    },

    // Prepend entries to the activity log atomically, keeping the newest AUDIT_CAP.
    async appendAudit(userId, entries) {
      await ensureTables();
      const list = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
      if (!list.length) return;
      const fresh = JSON.stringify(list.slice(0, AUDIT_CAP));
      await sql()`
        insert into user_state (user_id, data) values (${userId}, jsonb_build_object('audit', ${fresh}::jsonb))
        on conflict (user_id) do update set data = jsonb_set(user_state.data, '{audit}', (
          select coalesce(jsonb_agg(x.e order by x.n), '[]'::jsonb)
          from jsonb_array_elements(${fresh}::jsonb || coalesce(user_state.data->'audit', '[]'::jsonb)) with ordinality as x(e, n)
          where x.n <= ${AUDIT_CAP})), updated_at = now()`;
    },

    // The newest `limit` messages, oldest first.
    async listChat(userId, limit = CHAT_CAP) {
      await ensureTables();
      const rows = await sql()`
        select data from (select data, t, id from chat_messages where user_id = ${userId} order by t desc, id desc limit ${limit}) x
        order by t asc, id asc`;
      return rows.map(r => r.data);
    },

    async getMessage(userId, id) {
      await ensureTables();
      const rows = await sql()`select data from chat_messages where user_id = ${userId} and id = ${id}`;
      return rows[0]?.data || null;
    },

    // Insert or replace one message (msg.id and msg.t are required).
    async saveMessage(userId, msg) {
      await ensureTables();
      await sql()`
        insert into chat_messages (id, user_id, t, data) values (${msg.id}, ${userId}, ${Number(msg.t) || Date.now()}, ${JSON.stringify(msg)}::jsonb)
        on conflict (id) do update set data = excluded.data, updated_at = now()
        where chat_messages.user_id = ${userId}`;
    },

    async clearChat(userId) {
      await ensureTables();
      await sql()`delete from chat_messages where user_id = ${userId}`;
      await sql()`update agent_waits set status = 'expired' where user_id = ${userId} and status = 'pending'`;
    },

    async createWait(userId, { id, messageId, kind, request }) {
      await ensureTables();
      const wid = id || newId("w");
      await sql()`
        insert into agent_waits (id, user_id, message_id, kind, request)
        values (${wid}, ${userId}, ${messageId}, ${kind}, ${JSON.stringify(request || {})}::jsonb)`;
      return wid;
    },

    async getWait(userId, id) {
      await ensureTables();
      const rows = await sql()`select * from agent_waits where user_id = ${userId} and id = ${id}`;
      return toWait(rows[0]);
    },

    // Only a pending wait can be answered; returns false if it was too late.
    async answerWait(userId, id, response) {
      await ensureTables();
      const rows = await sql()`
        update agent_waits set response = ${JSON.stringify(response ?? null)}::jsonb, status = 'answered', answered_at = now()
        where user_id = ${userId} and id = ${id} and status = 'pending' returning id`;
      return rows.length > 0;
    },

    async expireWait(userId, id) {
      await ensureTables();
      await sql()`update agent_waits set status = 'expired' where user_id = ${userId} and id = ${id} and status = 'pending'`;
    }
  };
}

let _store = null;
export const dbStore = () => (_store ||= makeDbStore());
