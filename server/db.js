/*
 * Neon Postgres access for the Library.
 * ---------------------------------------------------------------------------
 * Uses the HTTP-based @neondatabase/serverless driver, which works the same in
 * the local Express server, in Vercel Node functions, and in scripts. The
 * connection is created lazily so importing this module never throws when
 * DATABASE_URL is missing (e.g. during `npm test`).
 */
import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";

let _sql = null;
export function sql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Add your Neon connection string to .env");
    _sql = neon(url);
  }
  return _sql;
}

export const newId = (prefix = "d") => prefix + randomBytes(9).toString("hex");

// Shape sent to the browser; mirrors the old localStorage doc shape plus file info.
const toDoc = r => ({
  id: r.id,
  title: r.title,
  text: r.text || "",
  t: new Date(r.created_at).getTime(),
  url: r.blob_url || null,
  contentType: r.content_type || null,
  size: r.size_bytes || null,
  example: !!r.is_example
});

export async function listDocs(userId) {
  const s = sql();
  const rows = await s`
    select * from documents
    where user_id = ${userId}
    order by created_at desc`;
  return rows.map(toDoc);
}

export async function createDoc(userId, d) {
  const s = sql();
  const id = newId("d");
  const rows = await s`
    insert into documents
      (id, user_id, title, text, blob_url, blob_pathname, content_type, size_bytes, is_example)
    values
      (${id}, ${userId}, ${d.title}, ${d.text || ""}, ${d.blobUrl || null},
       ${d.blobPathname || null}, ${d.contentType || null}, ${d.size || null}, ${d.isExample || false})
    returning *`;
  return toDoc(rows[0]);
}

export async function deleteDoc(userId, id) {
  const s = sql();
  const rows = await s`
    delete from documents
    where user_id = ${userId} and id = ${id}
    returning title, blob_url, blob_pathname`;
  if (!rows[0]) return null;
  return { title: rows[0].title, blobUrl: rows[0].blob_url, blobPathname: rows[0].blob_pathname };
}

/* ---------- Ideas ---------- */
const toIdea = r => ({
  id: r.id,
  title: r.title,
  why: r.why || "",
  kind: r.kind || "Get ahead",
  basedOn: Array.isArray(r.based_on) ? r.based_on : [],
  action: r.action || "",
  status: r.status || "saved",
  by: r.by || "muse",
  goalId: r.goal_id || undefined,
  ruleKey: r.rule_key || undefined,
  t: new Date(r.created_at).getTime()
});

export async function listIdeas(userId) {
  const s = sql();
  const rows = await s`
    select * from ideas
    where user_id = ${userId}
    order by created_at asc`;
  return rows.map(toIdea);
}

export async function createIdea(userId, d) {
  const s = sql();
  const id = newId("i");
  const rows = await s`
    insert into ideas (id, user_id, title, why, kind, based_on, action, status, by, goal_id, rule_key)
    values (${id}, ${userId}, ${d.title}, ${d.why || ""}, ${d.kind || "Get ahead"},
      ${JSON.stringify(Array.isArray(d.basedOn) ? d.basedOn : [])}::jsonb,
      ${d.action || ""}, ${d.status || "saved"}, ${d.by || "muse"},
      ${d.goalId || null}, ${d.ruleKey || null})
    returning *`;
  return toIdea(rows[0]);
}

// Patch accepts any of: title, why, kind, basedOn, action, status, by, goalId, ruleKey.
export async function updateIdea(userId, id, patch) {
  const s = sql();
  const cur = (await s`select * from ideas where user_id = ${userId} and id = ${id}`)[0];
  if (!cur) return null;
  const next = { ...cur, ...renameIdeaKeys(patch) };
  const rows = await s`
    update ideas set
      title = ${next.title}, why = ${next.why || ""}, kind = ${next.kind || "Get ahead"},
      based_on = ${JSON.stringify(Array.isArray(next.based_on) ? next.based_on : [])}::jsonb,
      action = ${next.action || ""}, status = ${next.status || "saved"}, by = ${next.by || "muse"},
      goal_id = ${next.goal_id || null}, rule_key = ${next.rule_key || null}
    where user_id = ${userId} and id = ${id}
    returning *`;
  return toIdea(rows[0]);
}

// Map the browser's camelCase idea fields to the DB column names.
function renameIdeaKeys(patch) {
  const out = {};
  if ("title" in patch) out.title = patch.title;
  if ("why" in patch) out.why = patch.why;
  if ("kind" in patch) out.kind = patch.kind;
  if ("basedOn" in patch) out.based_on = patch.basedOn;
  if ("action" in patch) out.action = patch.action;
  if ("status" in patch) out.status = patch.status;
  if ("by" in patch) out.by = patch.by;
  if ("goalId" in patch) out.goal_id = patch.goalId;
  if ("ruleKey" in patch) out.rule_key = patch.ruleKey;
  return out;
}

export async function deleteIdea(userId, id) {
  const s = sql();
  const rows = await s`delete from ideas where user_id = ${userId} and id = ${id} returning id`;
  return rows[0] ? { id: rows[0].id } : null;
}

/* ---------- Goals ---------- */
const toGoal = r => ({
  id: r.id,
  goal: r.goal,
  steps: Array.isArray(r.steps) ? r.steps : [],
  t: new Date(r.created_at).getTime()
});

export async function listGoals(userId) {
  const s = sql();
  const rows = await s`
    select * from goals
    where user_id = ${userId}
    order by created_at asc`;
  return rows.map(toGoal);
}

export async function getGoal(userId, id) {
  const s = sql();
  const rows = await s`select * from goals where user_id = ${userId} and id = ${id}`;
  return rows[0] ? toGoal(rows[0]) : null;
}

export async function createGoal(userId, d) {
  const s = sql();
  const id = newId("g");
  const steps = (Array.isArray(d.steps) ? d.steps : []).map(normStep);
  const rows = await s`
    insert into goals (id, user_id, goal, steps)
    values (${id}, ${userId}, ${d.goal}, ${JSON.stringify(steps)}::jsonb)
    returning *`;
  return toGoal(rows[0]);
}

// Replace the whole goal (goal text and/or steps array).
export async function updateGoal(userId, id, patch) {
  const s = sql();
  const cur = (await s`select * from goals where user_id = ${userId} and id = ${id}`)[0];
  if (!cur) return null;
  const goal = "goal" in patch ? patch.goal : cur.goal;
  const steps = ("steps" in patch ? patch.steps : cur.steps).map(normStep);
  const rows = await s`
    update goals set goal = ${goal}, steps = ${JSON.stringify(steps)}::jsonb
    where user_id = ${userId} and id = ${id}
    returning *`;
  return toGoal(rows[0]);
}

export async function deleteGoal(userId, id) {
  const s = sql();
  const rows = await s`delete from goals where user_id = ${userId} and id = ${id} returning id`;
  return rows[0] ? { id: rows[0].id } : null;
}

const normStep = s => ({ text: String(s?.text ?? s ?? ""), status: s?.status || "todo" });
