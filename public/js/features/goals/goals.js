// Goals page: plans with steps, and the create_goal / update_step tools.
import { $, esc } from "../../core/dom.js";
import { fmtDay } from "../../core/format.js";
import { state, rt } from "../../core/state.js";
import { defineFeature, onClick, renderMine } from "../../core/registry.js";
import { save } from "../../core/storage.js";
import { audit } from "../../core/activity.js";
import { S } from "../../core/schema.js";
import { say } from "../../agent/run.js";
import { createGoal, updateStep, removeGoal, updateIdea } from "../../core/api.js";
import { renderGoalSuggs, maybeUpdateGoals, initGoalSuggestions } from "./suggestions.js";

const STATUSES = ["todo", "doing", "done", "blocked"];
// Tools that only record intent, not real work — they can't count as proof of
// progress when the model tries to mark a step doing/done.
const BOOKKEEPING = new Set(["create_goal", "update_step"]);

// Keep the in-memory cache (state.plans/state.ideas) in sync with the server.
export function replaceGoal(g) { const i = state.plans.findIndex(p => p.id === g.id); if (i >= 0) state.plans[i] = g; else state.plans.push(g); }
function replaceIdea(i) { const n = state.ideas.findIndex(x => x.id === i.id); if (n >= 0) state.ideas[n] = i; }

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

defineFeature({
  id: "goals",
  nav: { el: "navGoals", badge: () => { const active = state.plans.filter(p => p.steps.some(s => s.status !== "done")).length; return state.plans.length ? `${active} active` : ""; } },
  render() { renderGoals(); renderGoalSuggs(); },
  onShow: maybeUpdateGoals,
  guidance: "Goals: for a goal bigger than one step, or when asked to turn an idea into a goal, call create_goal with 3-6 concrete steps (pass idea_id if it came from an idea). New steps are todo. Mark a step doing or done only when a tool actually did that work this turn, or the user did it themselves — in that case pass confirmed_by_user:true. update_step enforces this and refuses an unsupported doing/done, so never mark progress just because you planned it, and never assume a document or result exists.",
  tools: [
    { name: "create_goal", description: "Create a goal on the Goals page with 3-6 ordered steps. Pass idea_id if it comes from an idea. Returns the goal_id and numbered steps.",
      inputSchema: { type: "object", properties: { goal: S, steps: { type: "array", items: S }, idea_id: S }, required: ["goal", "steps"] },
      run: async ({ goal, steps, idea_id }, _ctx, h) => {
        const list = (Array.isArray(steps) ? steps : []).map(String).filter(Boolean).slice(0, 8);
        if (!goal || !list.length) throw new Error("need a goal and at least one step");
        const created = await createGoal(String(goal), list);
        replaceGoal(created);
        if (idea_id) {
          const idea = state.ideas.find(i => i.id === String(idea_id));
          if (idea) { try { replaceIdea(await updateIdea(idea.id, { goalId: created.id })); } catch (e) {} }
        }
        h.act(`${goal} (${created.steps.length} steps)`);
        return { goal_id: created.id, steps: created.steps.map((s, i) => `${i + 1}. ${s.text}`) };
      } },
    { name: "update_step", description: "Set a goal step's status. step is 1-based. doing and done need proof: either a tool did the work this turn, or the user did it themselves (then pass confirmed_by_user:true). Otherwise leave the step todo — a plan is not progress. This tool refuses an unsupported doing/done.",
      inputSchema: { type: "object", properties: { goal_id: S, step: { type: "integer" }, status: { type: "string", enum: STATUSES }, confirmed_by_user: { type: "boolean" } }, required: ["goal_id", "step", "status"] },
      run: async ({ goal_id, step, status, confirmed_by_user }, _ctx, h) => {
        const g = state.plans.find(p => p.id === String(goal_id)); if (!g) throw new Error("no goal " + goal_id);
        const s = g.steps[Number(step) - 1]; if (!s) throw new Error("no step " + step);
        if (!STATUSES.includes(status)) throw new Error("bad status");
        // Progress must be backed by real work: a step only moves to doing/done if
        // a non-bookkeeping tool ran this turn, or the user did it (confirmed_by_user).
        // This stops the model marking a step done it never actually worked on.
        if ((status === "doing" || status === "done") && !confirmed_by_user) {
          const worked = h.turnActions().some(a => !BOOKKEEPING.has(a.tool));
          if (!worked) throw new Error(`Refused: nothing this turn shows work on "${s.text}". Use a tool to do it first, or leave it todo. If the user already did it, call again with confirmed_by_user: true.`);
        }
        replaceGoal(await updateStep(String(goal_id), Number(step), status));
        h.act(`${s.text} → ${status}`); return "Updated.";
      } }
  ]
});
