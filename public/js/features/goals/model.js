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

// Goal-step selection for "move my goal forward" requests.
export const DOCUMENT_STEP = /(?<![\p{L}\p{N}])(?:résumé|resume|cv|cover letter)(?![\p{L}\p{N}])/iu;
export const JOB_RESEARCH_STEP = /\b(?:research|find|look for|identify|search)\b.*\b(?:compan(?:y|ies)|jobs?|job boards?|openings?|open positions?|roles?)\b/i;

const STOP = new Set(("the and for with that this these those you your our can could would will like please get got make want "
  + "goal goals step steps plan plans move forward next progress update continue again try ahead proceed work working about now let yes yeah sure").split(" "));
const sigWords = s => (String(s || "").toLowerCase().match(/[a-z0-9]+/g) || [])
  .filter(w => w.length > 2 && !STOP.has(w)).map(w => w.replace(/s$/, ""));

// Match text against the goals by id, whole title, or shared significant title words.
// Returns { goal, ambiguous }: goal is the single best match, ambiguous when the best score ties.
function matchGoals(plans, text) {
  const raw = String(text || "").toLowerCase();
  const tokens = raw.match(/[a-z0-9_-]+/g) || [];
  const msgWords = new Set(sigWords(raw));
  let best = 0, hits = [];
  for (const goal of plans) {
    let score = 0;
    const title = String(goal.goal || "").toLowerCase().trim();
    if (goal.id && tokens.includes(String(goal.id).toLowerCase())) score = 1000;
    else if (title && raw.includes(title)) score = 100;
    else score = new Set(sigWords(title)).size ? [...new Set(sigWords(title))].filter(w => msgWords.has(w)).length : 0;
    if (score > best) { best = score; hits = [goal]; }
    else if (score === best && score > 0) hits.push(goal);
  }
  if (!best) return { goal: null, ambiguous: false };
  return hits.length === 1 ? { goal: hits[0], ambiguous: false } : { goal: null, ambiguous: true };
}

// The goal the user named: { named, goal }. named is true when the user pointed at a goal
// (even one we cannot match, e.g. "my trip goal"), in which case goal may be null.
export function targetGoal(plans, message, lastAssistantText = "") {
  const list = Array.isArray(plans) ? plans : [];
  const direct = matchGoals(list, message);
  if (direct.goal || direct.ambiguous) return { named: true, goal: direct.goal };
  const m = String(message || "").match(/\b(?:my|the)\s+([a-z0-9'’-]+)\s+(?:goal|plan)\b/i);
  if (m && !STOP.has(m[1].toLowerCase()) && m[1].length > 2) return { named: true, goal: null };
  const prior = matchGoals(list, lastAssistantText);
  if (prior.goal) return { named: true, goal: prior.goal };
  return { named: false, goal: null };
}

// The goal's first unfinished step, when it matches regex (earlier steps are all done).
export function nextStepMatching(goal, regex) {
  const steps = goal?.steps || [];
  const index = steps.findIndex(s => s.status !== "done");
  if (index < 0 || !regex.test(steps[index].text)) return null;
  return { goal, step: steps[index], index };
}

// The step to advance: only in the goal the user named. With no goal named, the single goal
// with an actionable matching step, or the most recently updated one if several have one.
export function findStep(plans, message, lastAssistantText, regex) {
  const list = Array.isArray(plans) ? plans : [];
  const t = targetGoal(list, message, lastAssistantText);
  if (t.named) return t.goal ? nextStepMatching(t.goal, regex) : null;
  const found = list.map(g => nextStepMatching(g, regex)).filter(Boolean);
  if (!found.length) return null;
  const when = f => Number(f.goal.updatedAt ?? f.goal.t ?? 0) || 0;
  return found.reduce((a, b) => (when(b) > when(a) ? b : a));
}

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

// revise_plan helpers: keep a step's status if its text survives (anywhere) or is
// reworded in the same position; brand-new steps start as todo.
export function revisePlan(old, texts) {
  const byText = new Map(old.map(s => [s.text.toLowerCase(), s.status]));
  return texts.map((text, i) => ({ text, status: byText.get(text.toLowerCase()) ?? (old[i] && !texts.some(t => t.toLowerCase() === old[i].text.toLowerCase()) ? old[i].status : "todo") }));
}
// [[label, value]] rows describing what changed, for the approval card.
export function diffPlan(before, after) {
  const rows = [], lower = a => a.map(t => t.toLowerCase()), b = lower(before), a = lower(after);
  after.forEach((t, i) => {
    if (b.includes(a[i])) return;
    if (before[i] !== undefined && !a.includes(b[i])) rows.push([`Step ${i + 1}`, `“${before[i]}” → “${t}”`]);
    else rows.push(["Add", `“${t}”`]);
  });
  before.forEach((t, i) => { if (!a.includes(b[i]) && !(after[i] !== undefined && !b.includes(a[i]))) rows.push(["Remove", `“${t}”`]); });
  return rows;
}

// One goal as prompt text: steps, then target, deadline and tracked
// applications, so the model can plan check-ins and look for replies.
export function goalContext(g, now = new Date()) {
  const lines = [`Goal ${g.id}: ${g.goal}`, ...g.steps.map((s, i) => `  ${i + 1}. [${s.status}] ${s.text}`)];
  const pr = goalProgress(g, now);
  if (pr) lines.push(`  Target: ${pr.done}/${pr.count} ${pr.metric}${g.deadline ? `, deadline ${g.deadline} (${pr.daysLeft} days left)` : ""}`);
  else if (g.deadline) lines.push(`  Deadline: ${g.deadline}`);
  const apps = g.applications || [];
  if (apps.length) {
    lines.push(`  Applications (${apps.length}):`);
    for (const a of apps.slice(-30)) {
      const age = Math.max(0, Math.floor((now.getTime() - (a.t || 0)) / 86400000));
      lines.push(`    - ${a.company} · ${a.role} [${a.status}, updated ${age}d ago]${a.url ? ` ${a.url}` : ""}`);
    }
  }
  return lines.join("\n");
}
