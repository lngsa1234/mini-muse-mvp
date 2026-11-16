/*
 * Goal targets and the application tracker: pure helpers shared by the browser
 * (features/goals) and the server (server/goals.js). No DOM, no state imports.
 *
 * A measurable goal has a target and a deadline, for example
 *   { target: { metric: "interviews", count: 3 }, deadline: "2026-12-16" }
 * and an applications list that tracks each job from saved to an outcome:
 *   { company, role, url?, status, note?, t }
 */

export const APP_STATUSES = ["saved", "drafted", "applied", "interview", "offer", "rejected"];
export const TARGET_METRICS = ["interviews", "applications"];
// Which application statuses count toward each kind of target.
const COUNTS = {
  interviews: new Set(["interview", "offer"]),
  applications: new Set(["applied", "interview", "offer", "rejected"])
};
const MAX_APPS = 200;
const clip = (v, n) => String(v ?? "").trim().slice(0, n);

// { metric, count } or null when missing. Throws on a target that is present but invalid.
export function normTarget(t) {
  if (t == null || t === "") return null;
  const metric = String(t.metric || "");
  const count = Number(t.count);
  if (!TARGET_METRICS.includes(metric)) throw new Error(`target metric must be one of: ${TARGET_METRICS.join(", ")}`);
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error("target count must be a whole number from 1 to 500");
  return { metric, count };
}

// "YYYY-MM-DD" or null when missing. Throws on a deadline that is present but invalid.
export function normDeadline(d) {
  if (d == null || d === "") return null;
  const s = String(d).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + "T00:00:00Z"))) throw new Error("deadline must be a date like 2026-12-16");
  return s;
}

// Deadline `days` after `from` (a Date), as "YYYY-MM-DD" in local time.
export function deadlineIn(days, from = new Date()) {
  const n = Number(days);
  if (!Number.isInteger(n) || n < 1 || n > 365) throw new Error("days must be a whole number from 1 to 365");
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function normApplication(a, now = Date.now()) {
  const company = clip(a?.company, 120), role = clip(a?.role, 120);
  if (!company || !role) throw new Error("an application needs a company and a role");
  const status = String(a?.status || "saved");
  if (!APP_STATUSES.includes(status)) throw new Error(`status must be one of: ${APP_STATUSES.join(", ")}`);
  const url = clip(a?.url, 500);
  if (url && !/^https?:\/\//i.test(url)) throw new Error("url must start with http:// or https://");
  const out = { company, role, status, t: now };
  if (url) out.url = url;
  const note = clip(a?.note, 300);
  if (note) out.note = note;
  return out;
}

const sameJob = (a, b) => a.company.toLowerCase() === b.company.toLowerCase() && a.role.toLowerCase() === b.role.toLowerCase();

// Add a new application, or update the one with the same company and role.
// Fields not given on an update (url, note) keep their old values.
export function upsertApplication(list, app) {
  const apps = Array.isArray(list) ? list.slice() : [];
  const i = apps.findIndex(x => sameJob(x, app));
  if (i >= 0) apps[i] = { ...apps[i], ...app };
  else {
    if (apps.length >= MAX_APPS) throw new Error(`a goal can track at most ${MAX_APPS} applications`);
    apps.push(app);
  }
  return apps;
}

export const findApplication = (list, company, role) =>
  (Array.isArray(list) ? list : []).find(x => sameJob(x, { company: String(company || ""), role: String(role || "") })) || null;

// Next status when the user clicks an application's status chip.
export const nextStatus = s => APP_STATUSES[(APP_STATUSES.indexOf(s) + 1) % APP_STATUSES.length];

// { metric, count, done, daysLeft } for a goal with a target, else null.
// daysLeft is null without a deadline, and 0 on or after the deadline day.
export function goalProgress(goal, now = new Date()) {
  const target = goal?.target;
  if (!target || !COUNTS[target.metric]) return null;
  const done = (goal.applications || []).filter(a => COUNTS[target.metric].has(a.status)).length;
  let daysLeft = null;
  if (goal.deadline) {
    const [y, m, d] = goal.deadline.split("-").map(Number);
    const end = new Date(y, m - 1, d), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    daysLeft = Math.max(0, Math.round((end - today) / 86400000));
  }
  return { metric: target.metric, count: target.count, done, daysLeft };
}
