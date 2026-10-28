/*
 * Idea request handlers, shared by the local Express server (server/index.js)
 * and the Vercel Node functions (api/ideas/*). Each handler takes a userId plus
 * already-parsed input and returns { status, json }, matching server/docs.js.
 *
 * An idea is { title, why?, kind?, basedOn?, action?, status?, by?, goalId?, ruleKey? }.
 */
import { listIdeas, createIdea, updateIdea, deleteIdea } from "./db.js";

const TITLE_CAP = 200;
const err = (status, message) => ({ status, json: { error: message } });

export async function handleList(userId) {
  return { status: 200, json: { ideas: await listIdeas(userId) } };
}

export async function handleCreate(userId, body) {
  body = body || {};
  const title = String(body.title || "").trim();
  if (!title) return err(400, "title is required");
  const idea = await createIdea(userId, {
    title: title.slice(0, TITLE_CAP),
    why: String(body.why || ""),
    kind: body.kind ? String(body.kind) : undefined,
    basedOn: Array.isArray(body.basedOn) ? body.basedOn.map(String) : [],
    action: String(body.action || ""),
    status: body.status ? String(body.status) : undefined,
    by: body.by ? String(body.by) : undefined,
    goalId: body.goalId ? String(body.goalId) : undefined,
    ruleKey: body.ruleKey ? String(body.ruleKey) : undefined
  });
  return { status: 201, json: { idea } };
}

export async function handleUpdate(userId, id, body) {
  body = body || {};
  const idea = await updateIdea(userId, String(id), body);
  if (!idea) return err(404, "no such idea");
  return { status: 200, json: { idea } };
}

export async function handleDelete(userId, id) {
  const removed = await deleteIdea(userId, String(id));
  if (!removed) return err(404, "no such idea");
  return { status: 200, json: { removed: removed.id } };
}
