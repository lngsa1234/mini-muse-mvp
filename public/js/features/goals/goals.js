// Goals page: plans with steps, measurable targets and an application tracker.
// The create_goal / update_step / revise_plan / track_application tools run in
// the server agent (server/agent/tools/goals.js).
import { $, esc } from "../../core/dom.js";
import { fmtDay } from "../../core/format.js";
import { state, rt } from "../../core/state.js";
import { defineFeature, onClick, renderMine } from "../../core/registry.js";
import { save } from "../../core/storage.js";
import { audit } from "../../core/activity.js";
import { say } from "../../agent/run.js";
import { updateStep, removeGoal, saveApplication } from "../../core/api.js";
import { nextStatus, goalProgress } from "./model.js";
import { renderGoalSuggs, maybeUpdateGoals, initGoalSuggestions } from "./suggestions.js";
import { renderDaily } from "../../workflow/checkin.js";

// Keep the in-memory cache (state.plans/state.ideas) in sync with the server.
export function replaceGoal(g) { const i = state.plans.findIndex(p => p.id === g.id); if (i >= 0) state.plans[i] = g; else state.plans.push(g); }

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

defineFeature({
  id: "goals",
  nav: { el: "navGoals", badge: () => { const active = state.plans.filter(p => p.steps.some(s => s.status !== "done")).length; return state.plans.length ? `${active} active` : ""; } },
  render() { renderGoals(); renderGoalSuggs(); renderDaily(); },
  onShow: maybeUpdateGoals
});
