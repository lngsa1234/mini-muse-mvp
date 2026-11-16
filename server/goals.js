/*
 * Goal request handlers, shared by the local Express server (server/index.js)
 * and the Vercel Node functions (api/goals/*). Each handler takes a userId plus
 * already-parsed input and returns { status, json }, matching server/docs.js.
 *
 * A goal is { goal, steps: [{ text, status }], target?, deadline?, applications }.
 * handleUpdate accepts a full patch ({ goal?, steps?, target?, deadline? }), a
 * single-step change ({ step, status }, step is 1-based), or an application to
 * add or update ({ application: { company, role, status, url?, note? } }).
 */
import { listGoals, getGoal, createGoal, updateGoal, deleteGoal } from "./db.js";
import { normTarget, normDeadline, normApplication, upsertApplication } from "../public/js/features/goals/model.js";

const STATUSES = ["todo", "doing", "done", "blocked"];
const err = (status, message) => ({ status, json: { error: message } });

export async function handleList(userId) {
  return { status: 200, json: { goals: await listGoals(userId) } };
}

export async function handleCreate(userId, body) {
  body = body || {};
  const goal = String(body.goal || "").trim();
  const steps = (Array.isArray(body.steps) ? body.steps : [])
    .map(s => (typeof s === "string" ? { text: s, status: "todo" } : { text: String(s?.text || ""), status: s?.status || "todo" }))
    .filter(s => s.text)
    .slice(0, 8);
  if (!goal) return err(400, "goal is required");
  if (!steps.length) return err(400, "at least one step is required");
  let target, deadline;
  try { target = normTarget(body.target); deadline = normDeadline(body.deadline); } catch (e) { return err(400, e.message); }
  const created = await createGoal(userId, { goal, steps, target, deadline });
  return { status: 201, json: { goal: created } };
}

export async function handleUpdate(userId, id, body) {
  body = body || {};
  id = String(id);

  // Single-step status change: { step (1-based), status }.
  if (body.step != null && body.status != null) {
    if (!STATUSES.includes(body.status)) return err(400, "bad status");
    const current = await getGoal(userId, id);
    if (!current) return err(404, "no such goal");
    const idx = Number(body.step) - 1;
    if (!current.steps[idx]) return err(400, "no such step");
    const steps = current.steps.map((s, i) => (i === idx ? { ...s, status: body.status } : s));
    const updated = await updateGoal(userId, id, { steps });
    return { status: 200, json: { goal: updated } };
  }

  // Add or update one tracked application: { application }.
  if (body.application != null) {
    let app;
    try { app = normApplication(body.application); } catch (e) { return err(400, e.message); }
    const current = await getGoal(userId, id);
    if (!current) return err(404, "no such goal");
    let applications;
    try { applications = upsertApplication(current.applications, app); } catch (e) { return err(400, e.message); }
    const updated = await updateGoal(userId, id, { applications });
    return { status: 200, json: { goal: updated } };
  }

  // Full patch: { goal?, steps?, target?, deadline? }.
  const patch = {};
  if (body.goal != null) patch.goal = String(body.goal);
  if (Array.isArray(body.steps)) patch.steps = body.steps;
  try {
    if ("target" in body) patch.target = normTarget(body.target);
    if ("deadline" in body) patch.deadline = normDeadline(body.deadline);
  } catch (e) { return err(400, e.message); }
  const updated = await updateGoal(userId, id, patch);
  if (!updated) return err(404, "no such goal");
  return { status: 200, json: { goal: updated } };
}

export async function handleDelete(userId, id) {
  const removed = await deleteGoal(userId, String(id));
  if (!removed) return err(404, "no such goal");
  return { status: 200, json: { removed: removed.id } };
}
