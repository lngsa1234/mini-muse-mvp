// Goals page: plans with steps, and the create_goal / update_step tools.
import { $, esc, rid } from "../../core/dom.js";
import { fmtDay } from "../../core/format.js";
import { state, rt } from "../../core/state.js";
import { defineFeature, onClick, renderMine } from "../../core/registry.js";
import { save } from "../../core/storage.js";
import { audit } from "../../core/activity.js";
import { S } from "../../core/schema.js";
import { say } from "../../agent/run.js";
import { renderGoalSuggs, maybeUpdateGoals, initGoalSuggestions } from "./suggestions.js";

const STATUSES = ["todo", "doing", "done", "blocked"];

function renderGoals() {
  const p = state.plans;
  const steps = p.flatMap(g => g.steps), done = steps.filter(s => s.status === "done").length;
  const finished = p.filter(g => g.steps.length && g.steps.every(s => s.status === "done")).length;
  $("goalSummary").innerHTML = p.length ? `<span><b>${p.length - finished}</b>active</span><span><b>${finished}</b>done</span><span><b>${done}/${steps.length}</b>steps complete</span>` : "";
  $("goalList").innerHTML = p.length ? [...p].reverse().map(g => {
    const d = g.steps.filter(s => s.status === "done").length, all = g.steps.length && d === g.steps.length;
    return `<article class="goal${all ? " complete" : ""}"><div class="head"><h3>${esc(g.goal)}</h3><button class="x" data-del-plan="${g.id}" aria-label="Delete goal">×</button></div>
      <div class="sub">${d} of ${g.steps.length} steps · started ${fmtDay(g.t)}</div><div class="bar"><i style="width:${g.steps.length ? d / g.steps.length * 100 : 0}%"></i></div>
      <ul class="steps">${g.steps.map((s, i) => `<li><button class="s-${s.status}" data-step="${g.id}:${i}" title="Click to mark done or undo"><span class="dot"></span><span class="t">${esc(s.text)}</span>${s.status === "doing" || s.status === "blocked" ? `<span class="st">${s.status}</span>` : ""}</button></li>`).join("")}</ul>
      ${all ? "" : `<div><button class="btn small" data-nudge="${g.id}">Ask Muse to move this forward</button></div>`}</article>`;
  }).join("") : `<p class="empty">No goals yet. Type one above and Muse will plan it.</p>`;
}

export function initGoals() {
  $("goalForm").addEventListener("submit", e => {
    e.preventDefault();
    const t = $("goalBox").value.trim(); if (!t) return;
    if (!rt.sample || rt.busy) { $("goalBox").placeholder = rt.busy ? "Muse is busy. Try again in a moment." : "Muse isn't connected yet."; return; }
    $("goalBox").value = ""; say(`New goal: ${t}. Make a plan for it and start on what you can.`);
  });
  initGoalSuggestions();
}

onClick("nudge", id => { const g = state.plans.find(x => x.id === id); if (g && rt.sample && !rt.busy) say(`Move my goal ${g.id} ("${g.goal}") forward: do the next steps you can, update them, and tell me what you need from me.`); });
onClick("delPlan", id => { const g = state.plans.find(x => x.id === id); state.plans = state.plans.filter(x => x.id !== id); audit("delete_goal", g?.goal, "Deleted by you", "you"); renderMine(); save(); });
onClick("step", v => { const [gid, i] = v.split(":"); const s = state.plans.find(p => p.id === gid)?.steps[+i]; if (s) { s.status = s.status === "done" ? "todo" : "done"; audit("update_step", s.text, s.status + " (by you)", "you"); renderMine(); save(); } });

defineFeature({
  id: "goals",
  nav: { el: "navGoals", badge: () => { const active = state.plans.filter(p => p.steps.some(s => s.status !== "done")).length; return state.plans.length ? `${active} active` : ""; } },
  render() { renderGoals(); renderGoalSuggs(); },
  onShow: maybeUpdateGoals,
  guidance: "Goals: for a goal bigger than one step, or when asked to turn an idea into a goal, call create_goal with 3-6 concrete steps (pass idea_id if it came from an idea). Then do the steps you can do right now with your tools and mark them with update_step.",
  tools: [
    { name: "create_goal", description: "Create a goal on the Goals page with 3-6 ordered steps. Pass idea_id if it comes from an idea. Returns the goal_id and numbered steps.",
      inputSchema: { type: "object", properties: { goal: S, steps: { type: "array", items: S }, idea_id: S }, required: ["goal", "steps"] },
      run: ({ goal, steps, idea_id }, _ctx, h) => {
        const list = (Array.isArray(steps) ? steps : []).map(String).filter(Boolean).slice(0, 8);
        if (!goal || !list.length) throw new Error("need a goal and at least one step");
        const id = "g" + rid();
        state.plans.push({ id, goal: String(goal), steps: list.map(text => ({ text, status: "todo" })), t: Date.now() });
        const idea = idea_id && state.ideas.find(i => i.id === String(idea_id)); if (idea) idea.goalId = id;
        h.act(`${goal} (${list.length} steps)`);
        return { goal_id: id, steps: list.map((s, i) => `${i + 1}. ${s}`) };
      } },
    { name: "update_step", description: "Set a goal step's status. step is 1-based. status is todo, doing, done or blocked.",
      inputSchema: { type: "object", properties: { goal_id: S, step: { type: "integer" }, status: { type: "string", enum: STATUSES } }, required: ["goal_id", "step", "status"] },
      run: ({ goal_id, step, status }, _ctx, h) => {
        const g = state.plans.find(p => p.id === String(goal_id)); if (!g) throw new Error("no goal " + goal_id);
        const s = g.steps[Number(step) - 1]; if (!s) throw new Error("no step " + step);
        if (!STATUSES.includes(status)) throw new Error("bad status");
        s.status = status; h.act(`${s.text} → ${status}`); return "Updated.";
      } }
  ]
});
