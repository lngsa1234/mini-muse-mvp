// Goals page: plans with steps, measurable targets, an application tracker,
// and the create_goal / update_step / track_application tools.
import { $, esc } from "../../core/dom.js";
import { fmtDay } from "../../core/format.js";
import { state, rt } from "../../core/state.js";
import { defineFeature, onClick, renderMine } from "../../core/registry.js";
import { save } from "../../core/storage.js";
import { audit } from "../../core/activity.js";
import { S } from "../../core/schema.js";
import { say } from "../../agent/run.js";
import { createGoal, updateStep, updateGoalSteps, removeGoal, updateIdea, saveApplication } from "../../core/api.js";
import { APP_STATUSES, TARGET_METRICS, normTarget, deadlineIn, normApplication, findApplication, nextStatus, goalProgress, revisePlan, diffPlan } from "./model.js";
import { renderGoalSuggs, maybeUpdateGoals, initGoalSuggestions } from "./suggestions.js";
import { renderDaily } from "../../workflow/checkin.js";

const STATUSES = ["todo", "doing", "done", "blocked"];
// Tools that only record intent, not real work — they can't count as proof of
// progress when the model tries to mark a step doing/done.
const BOOKKEEPING = new Set(["create_goal", "update_step", "track_application", "revise_plan"]);
const MAIL_TOOLS = new Set(["mail_search", "mail_read"]);
const DOCUMENT_STEP = /\b(?:résumé|resume|cv|cover letter)\b/i;

// Keep the in-memory cache (state.plans/state.ideas) in sync with the server.
export function replaceGoal(g) { const i = state.plans.findIndex(p => p.id === g.id); if (i >= 0) state.plans[i] = g; else state.plans.push(g); }
function replaceIdea(i) { const n = state.ideas.findIndex(x => x.id === i.id); if (n >= 0) state.ideas[n] = i; }

function targetHtml(g) {
  const pr = goalProgress(g); if (!pr) return "";
  const left = pr.daysLeft == null ? "" : pr.daysLeft ? ` · ${pr.daysLeft} day${pr.daysLeft === 1 ? "" : "s"} left` : " · deadline reached";
  return `<div class="target"><b>${pr.done}/${pr.count}</b> ${esc(pr.metric)}${left}</div><div class="bar target-bar"><i style="width:${Math.min(100, pr.done / pr.count * 100)}%"></i></div>`;
}
function appsHtml(g) {
  const apps = g.applications || []; if (!apps.length) return "";
  return `<details class="apps"${apps.length <= 6 ? " open" : ""}><summary>${apps.length} application${apps.length === 1 ? "" : "s"}</summary><ul>${apps.map((a, i) =>
    `<li><span class="job">${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.company)}</a>` : esc(a.company)} · ${esc(a.role)}</span><button class="app-st a-${a.status}" data-app="${g.id}:${i}" title="Click to change the status">${a.status}</button></li>`).join("")}</ul></details>`;
}

function renderGoals() {
  const p = state.plans;
  const steps = p.flatMap(g => g.steps), done = steps.filter(s => s.status === "done").length;
  const finished = p.filter(g => g.steps.length && g.steps.every(s => s.status === "done")).length;
  $("goalSummary").innerHTML = p.length ? `<span><b>${p.length - finished}</b>active</span><span><b>${finished}</b>done</span><span><b>${done}/${steps.length}</b>steps complete</span>` : "";
  $("goalList").innerHTML = p.length ? [...p].reverse().map(g => {
    const d = g.steps.filter(s => s.status === "done").length, all = g.steps.length && d === g.steps.length;
    return `<article class="goal${all ? " complete" : ""}"><div class="head"><h3>${esc(g.goal)}</h3><button class="x" data-del-plan="${g.id}" aria-label="Delete goal">×</button></div>
      ${targetHtml(g)}<div class="sub">${d} of ${g.steps.length} steps · started ${fmtDay(g.t)}${g.deadline ? ` · due ${esc(g.deadline)}` : ""}</div><div class="bar"><i style="width:${g.steps.length ? d / g.steps.length * 100 : 0}%"></i></div>
      <ul class="steps">${g.steps.map((s, i) => `<li><button class="s-${s.status}" data-step="${g.id}:${i}" title="Click to mark done or undo"><span class="dot"></span><span class="t">${esc(s.text)}</span>${s.status === "doing" || s.status === "blocked" ? `<span class="st">${s.status}</span>` : ""}</button></li>`).join("")}</ul>
      ${appsHtml(g)}${all ? "" : `<div><button class="btn small" data-nudge="${g.id}">Ask Muse to move this forward</button></div>`}</article>`;
  }).join("") : `<p class="empty">No goals yet. Type one above and Muse will plan it.</p>`;
}

export function initGoals() {
  $("goalForm").addEventListener("submit", e => {
    e.preventDefault();
    const t = $("goalBox").value.trim(); if (!t) return;
    if (!rt.sample || rt.busy) { $("goalBox").placeholder = rt.busy ? "Muse is busy. Try again in a moment." : "Muse isn't connected yet."; return; }
    $("goalBox").value = ""; say("New goal: " + t + ". Make a plan for it. Leave every step as todo unless I explicitly say it is already in progress or you can complete it with an available tool.");
  });
  initGoalSuggestions();
}

onClick("nudge", id => { const g = state.plans.find(x => x.id === id); if (g && rt.sample && !rt.busy) say(`Move my goal ${g.id} ("${g.goal}") forward: do the next steps you can, update them, and tell me what you need from me.`); });
onClick("delPlan", async id => { const g = state.plans.find(x => x.id === id); try { await removeGoal(id); } catch (e) {} state.plans = state.plans.filter(x => x.id !== id); audit("delete_goal", g?.goal, "Deleted by you", "you"); renderMine(); save(); });
onClick("step", async v => {
  const [gid, i] = v.split(":"); const g = state.plans.find(p => p.id === gid); const s = g?.steps[+i];
  if (!s) return;
  const status = s.status === "done" ? "todo" : "done";
  try { replaceGoal(await updateStep(gid, +i + 1, status)); audit("update_step", s.text, status + " (by you)", "you"); renderMine(); save(); } catch (e) {}
});

onClick("app", async v => {
  const [gid, i] = v.split(":"); const g = state.plans.find(p => p.id === gid); const a = g?.applications?.[+i];
  if (!a) return;
  const status = nextStatus(a.status);
  try { replaceGoal(await saveApplication(gid, { ...a, status })); audit("track_application", `${a.company} · ${a.role}`, status + " (by you)", "you"); renderMine(); save(); } catch (e) {}
});

// A tool's run must prove the step it claims: these return the qualifying action or null.
const ranThisTurn = (h, names) => h.turnActions().find(a => names.has(a.tool)) || null;
const approvedSubmit = h => h.turnActions().find(a => a.tool === "browser_click" && a.approval === "approved" && /submit|apply|send/i.test(a.card?.summary || "")) || null;

defineFeature({
  id: "goals",
  nav: { el: "navGoals", badge: () => { const active = state.plans.filter(p => p.steps.some(s => s.status !== "done")).length; return state.plans.length ? `${active} active` : ""; } },
  render() { renderGoals(); renderGoalSuggs(); renderDaily(); },
  onShow: maybeUpdateGoals,
  guidance: "Goals: for a goal bigger than one step, or when asked to turn an idea into a goal, call create_goal with 3-6 concrete steps (pass idea_id if it came from an idea). New steps are todo. Mark a step doing or done only for the specific step a tool just did this turn, and pass evidence naming that tool; update_step refuses otherwise. One action (e.g. a web search) only advances the step it did — not other steps you merely intend to do or assume are done. If no tool can do a step, do not silently skip it: set that step to blocked and tell the user what you need from them (or offer an alternative). For a step about a document like a résumé or cover letter, never try to edit the user's files — use docs_search to check the Library: a suitable résumé is enough for a combined “résumé and cover letter” step unless the user explicitly requires a cover letter. If none exists, ask the user to add one or offer to draft one with docs_add. Never assume a document or result exists. If the user says they did a step themselves, tell them to click it — you cannot mark it for them. For a job-search goal, plan steps Muse's tools can actually do, in this shape: confirm target roles and location (the user decides), find openings on employers' hiring sites (jobs_search), score the best matches and save them (score_fit, track_application), tailor the résumé and cover letter for each (docs_add; the user reviews), apply (the user submits), and follow up and log employer replies (Gmail). Don't write steps like “identify job boards” or “search Indeed/LinkedIn”: Muse can't search general job sites. For a measurable goal like “land 3 interviews in 30 days”, also pass target_metric (interviews or applications), target_count, and days, so the Goals page can show progress against the target and the days left. For a job-search goal, track each job with track_application: saved when you find a posting worth applying to; drafted after you save a tailored résumé or cover letter with docs_add; applied only right after the user approved your browser_click on the Submit button, or when mail_search / mail_read found the company's application confirmation email (“thank you for applying”, “application received”) this turn; interview, offer, or rejected only after mail_search or mail_read found the employer's email this turn (interview and offer also need the user to confirm). Otherwise ask the user to click the application's status on the Goals page. When the user says they submitted an application, work out which tracked job they mean (ask if it's unclear), then: if Gmail is connected, search for that company's confirmation email and mark it applied if found; if Gmail isn't connected or there's no confirmation yet, say so plainly, tell them that clicking the job's status on the Goals page marks it applied (name the job), and that connecting Gmail on the Connectors page lets you confirm it and watch for replies. Never count an interview you only expect. To change a goal's plan (reword, add, or remove steps) when the user asks, call revise_plan; it shows the user the before and after and changes nothing unless they approve. Never use it to change a step's status.",
  tools: [
    { name: "create_goal", description: "Create a goal on the Goals page with 3-6 ordered steps. Pass idea_id if it comes from an idea. For a measurable goal, pass target_metric (interviews or applications), target_count, and days until the deadline (e.g. 3 interviews in 30 days: target_metric \"interviews\", target_count 3, days 30). Returns the goal_id and numbered steps.",
      inputSchema: { type: "object", properties: { goal: S, steps: { type: "array", items: S }, idea_id: S,
        target_metric: { type: "string", enum: TARGET_METRICS }, target_count: { type: "integer" }, days: { type: "integer" } }, required: ["goal", "steps"] },
      run: async ({ goal, steps, idea_id, target_metric, target_count, days }, _ctx, h) => {
        const list = (Array.isArray(steps) ? steps : []).map(String).filter(Boolean).slice(0, 8);
        if (!goal || !list.length) throw new Error("need a goal and at least one step");
        const extra = {};
        if (target_metric || target_count) extra.target = normTarget({ metric: target_metric, count: target_count });
        if (days) extra.deadline = deadlineIn(days);
        const created = await createGoal(String(goal), list, extra);
        replaceGoal(created);
        if (idea_id) {
          const idea = state.ideas.find(i => i.id === String(idea_id));
          if (idea) { try { replaceIdea(await updateIdea(idea.id, { goalId: created.id })); } catch (e) {} }
        }
        const pr = goalProgress(created);
        h.act(`${goal} (${created.steps.length} steps${pr ? `, target ${pr.count} ${pr.metric}` : ""}${created.deadline ? `, due ${created.deadline}` : ""})`);
        return { goal_id: created.id, steps: created.steps.map((s, i) => `${i + 1}. ${s.text}`), ...(created.target ? { target: created.target } : {}), ...(created.deadline ? { deadline: created.deadline } : {}) };
      } },
    { name: "update_step", description: "Set a goal step's status. step is 1-based. doing and done require evidence: name the specific tool you used THIS turn to do THIS step's work (e.g. evidence:\"web_search\"). A résumé/cover-letter step requires a successful docs_search result; a résumé is enough for a combined step unless the user explicitly requires a cover letter. The tool refuses doing/done unless that tool actually ran this turn. One tool call does not justify marking other, unrelated steps. Leave a step todo until a tool has really done it — a plan is not progress. The user marks steps they did themselves by clicking them; you cannot do that for them.",
      inputSchema: { type: "object", properties: { goal_id: S, step: { type: "integer" }, status: { type: "string", enum: STATUSES }, evidence: S }, required: ["goal_id", "step", "status"] },
      run: async ({ goal_id, step, status, evidence }, _ctx, h) => {
        const g = state.plans.find(p => p.id === String(goal_id)); if (!g) throw new Error("no goal " + goal_id);
        const s = g.steps[Number(step) - 1]; if (!s) throw new Error("no step " + step);
        if (!STATUSES.includes(status)) throw new Error("bad status");
        // doing/done must cite a real tool action from this turn. The model has to
        // name which tool did the work, and that tool must actually have run — so one
        // search can't silently "complete" unrelated steps like updating a résumé.
        if (status === "doing" || status === "done") {
          const worked = h.turnActions().filter(a => !BOOKKEEPING.has(a.tool));
          if (!worked.length) throw new Error(`Cannot mark "${s.text}" as ${status}: no tool did any work this turn. Do it with a tool first, otherwise leave it todo.`);
          const cite = String(evidence || "").toLowerCase();
          const documentProof = worked.some(a => a.tool === "docs_search" && a.matches > 0 && /\b(?:résumé|resume|cv|cover letter)\b/i.test(a.query || ""));
          if (DOCUMENT_STEP.test(s.text)) {
            if (!documentProof) throw new Error(`Cannot mark "${s.text}" as ${status}: first use docs_search for a résumé and find a matching Library document. A cover letter is optional unless the user explicitly requires one.`);
          } else if (!cite || !worked.some(a => cite.includes(a.tool.toLowerCase()))) {
            throw new Error(`Cannot mark "${s.text}" as ${status}: set "evidence" to the tool you used this turn for THIS step. Tools used this turn: ${worked.map(a => a.tool).join(", ")}. If none did this step's work, leave it todo.`);
          }
        }
        replaceGoal(await updateStep(String(goal_id), Number(step), status));
        h.act(`${s.text} → ${status}${evidence ? ` (via ${evidence})` : ""}`); return "Updated.";
      } },
    { name: "revise_plan", description: "Change a goal's plan when the user asks: reword a step, add a step, or remove one. Pass the goal_id and the full new list of step texts, in order (keep the wording of steps you aren't changing). Existing steps keep their status when their text is unchanged or reworded in the same position; new steps start as todo. The user approves the change first. Never use it to mark progress.",
      inputSchema: { type: "object", properties: { goal_id: S, steps: { type: "array", items: S }, reason: S }, required: ["goal_id", "steps"] },
      run: async ({ goal_id, steps, reason }, context, h) => {
        const g = state.plans.find(p => p.id === String(goal_id)); if (!g) throw new Error("no goal " + goal_id);
        const texts = (Array.isArray(steps) ? steps : []).map(s => String(s).trim()).filter(Boolean);
        if (!texts.length) throw new Error("a plan needs at least one step");
        if (texts.length > 8) throw new Error("a plan can have at most 8 steps");
        const next = revisePlan(g.steps, texts);
        const before = g.steps.map(s => s.text), changed = diffPlan(before, texts);
        if (!changed.length) return "No change: the new plan matches the current one.";
        const ok = await h.ask("revise_plan", { heading: `Change the plan for “${g.goal}”?`, rows: changed, body: reason ? String(reason) : undefined, yes: "Update plan", summary: `${changed.length} change${changed.length === 1 ? "" : "s"} to “${g.goal}”` }, context);
        if (ok !== true) return h.refusal(ok);
        replaceGoal(await updateGoalSteps(g.id, next));
        h.act(`${g.goal}: ${changed.map(([k, v]) => `${k} ${v}`).join("; ")}`);
        return { goal_id: g.id, steps: next.map((s, i) => `${i + 1}. ${s.text} (${s.status})`) };
      } },
    { name: "track_application", description: "Add or update a job application on a goal's tracker, matched by company and role. Statuses: saved (a posting worth applying to), drafted (a tailored résumé or cover letter was saved with docs_add this turn), applied (only right after the user approved your browser_click on Submit this turn, or after mail_search / mail_read found the company's application confirmation email this turn; put the email's subject in note), interview / offer / rejected (only after mail_search or mail_read found the employer's email this turn; interview and offer also ask the user to confirm). The tool refuses a status the turn's actions don't prove; then ask the user to click the status on the Goals page instead.",
      inputSchema: { type: "object", properties: { goal_id: S, company: S, role: S, status: { type: "string", enum: APP_STATUSES }, url: S, note: S }, required: ["goal_id", "company", "role", "status"] },
      run: async ({ goal_id, company, role, status, url, note }, context, h) => {
        const g = state.plans.find(p => p.id === String(goal_id)); if (!g) throw new Error("no goal " + goal_id);
        const app = normApplication({ company, role, status, url, note });
        const job = `${app.company} · ${app.role}`;
        const prev = findApplication(g.applications, app.company, app.role);
        if (prev && APP_STATUSES.indexOf(app.status) < APP_STATUSES.indexOf(prev.status) && app.status !== "saved")
          throw new Error(`${job} is already ${prev.status}. Only the user can move it back, by clicking its status on the Goals page.`);
        let proof = "";
        if (app.status === "drafted") {
          if (!ranThisTurn(h, new Set(["docs_add"]))) throw new Error(`Cannot mark ${job} as drafted: save the tailored résumé or cover letter with docs_add first.`);
          proof = "docs_add";
        } else if (app.status === "applied") {
          const mail = ranThisTurn(h, MAIL_TOOLS);
          if (approvedSubmit(h)) proof = "approved submit";
          else if (mail) proof = `${mail.tool}: confirmation email`;
          else throw new Error(`Cannot mark ${job} as applied: there's no proof it was submitted this turn. Search Gmail for the company's application confirmation (e.g. "thank you for applying") with mail_search, or ask the user to click its status on the Goals page once they've applied.`);
        } else if (["interview", "offer", "rejected"].includes(app.status)) {
          const mail = ranThisTurn(h, MAIL_TOOLS);
          if (!mail) throw new Error(`Cannot mark ${job} as ${app.status}: find the employer's email with mail_search or mail_read first. If the user told you, ask them to click its status on the Goals page.`);
          proof = mail.tool;
          if (app.status !== "rejected") {
            const ok = await h.ask("track_application", { heading: `Count this as ${app.status === "offer" ? "an offer" : "an interview"}?`, rows: [["Job", job], ["From", "an email Muse found in Gmail"]], yes: "Yes, count it", summary: `${job} → ${app.status}` }, context);
            if (ok !== true) return h.refusal(ok);
          }
        }
        replaceGoal(await saveApplication(g.id, app));
        h.act(`${job} → ${app.status}${proof ? ` (via ${proof})` : ""}`);
        const pr = goalProgress(state.plans.find(p => p.id === g.id));
        return pr ? `Tracked. Progress: ${pr.done}/${pr.count} ${pr.metric}${pr.daysLeft != null ? `, ${pr.daysLeft} days left` : ""}.` : "Tracked.";
      } }
  ]
});
