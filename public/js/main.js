/*
 * Mini Muse — entry point.
 * ---------------------------------------------------------------------------
 * Loads every feature (each registers itself in core/registry.js), then boots.
 * Feature import order matters in two places:
 *   - the order of tools sent to the model
 *   - the numbering of "How you work" rules in the system prompt
 * so add new features at the end unless you mean to change those.
 */
import "./agent/client.js";

import { $ } from "./core/dom.js";
import { state, rt, blank, replaceState } from "./core/state.js";
import { renderAll, installDelegates } from "./core/registry.js";
import { loadState, save } from "./core/storage.js";
import "./core/nav.js";
import { ERR } from "./agent/errors.js";
import { disableChat } from "./agent/run.js";
import "./workflow/approvals.js";
import { initCheckin } from "./workflow/checkin.js";

import { initChat, noteText } from "./features/chat/chat.js";
import { initIdeas, renderIdeas, maybeUpdateIdeas } from "./features/ideas/ideas.js";
import { initGoals } from "./features/goals/goals.js";
import { renderGoalSuggs } from "./features/goals/suggestions.js";
import "./features/memory/memory.js";
import { seedLibrary } from "./features/library/library.js";
import "./features/connectors/index.js";
import { initSettings } from "./features/settings/settings.js";
import "./features/hood/hood.js";

/* ---------- wire up the page ---------- */
replaceState(blank());
installDelegates();
initChat(); initCheckin(); initIdeas(); initGoals(); initSettings();

/* ---------- boot ---------- */
renderAll();
(async () => {
  const saved = await loadState();
  if (saved) {
    replaceState(saved);
    for (const m of state.chat) { m.live = false; for (const a of m.acts || []) if (a.approval === "pending") { a.approval = "expired"; a.label = "No answer: " + (a.card?.summary || a.data?.subject || "request"); } }
    if (!rt.busy) renderAll();
  } else {
    seedLibrary(); renderAll(); save();
  }
  if (!window.agent?.use) { disableChat("The assistant isn't loaded, so Muse can't reply. Reload the page."); return; }
  const s = await agent.use("sample");
  if (!s) { disableChat("Muse can't reach the assistant right now. Reload the page and try again."); return; }
  try { const lim = await s.limits(); if (lim && !lim.tools) { disableChat(ERR.tools_unavailable); return; } } catch (e) {}
  rt.sample = s; $("note").textContent = noteText(); renderIdeas(); renderGoalSuggs();
  if ($("main").dataset.main === "ideas") maybeUpdateIdeas();
})();
