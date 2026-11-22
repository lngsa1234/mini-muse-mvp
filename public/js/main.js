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
import { loadState, flush } from "./core/storage.js";
import * as docsApi from "./core/api.js";
import "./core/nav.js";
import { ERR } from "./agent/errors.js";
import { disableChat, followLive } from "./agent/run.js";
import "./workflow/approvals.js";
import { initCheckin } from "./workflow/checkin.js";

import { initChat, noteText } from "./features/chat/chat.js";
import { initIdeas, renderIdeas, maybeUpdateIdeas } from "./features/ideas/ideas.js";
import { initGoals } from "./features/goals/goals.js";
import { renderGoalSuggs } from "./features/goals/suggestions.js";
import "./features/memory/memory.js";
import "./features/library/library.js";
import { initConnectors } from "./features/connectors/index.js";
import { initSettings } from "./features/settings/settings.js";
import "./features/hood/hood.js";
import "./features/observability/observability.js";
import { initTracer } from "./core/trace.js";

/* ---------- wire up the page ---------- */
replaceState(blank());
installDelegates();
initChat(); initCheckin(); initIdeas(); initGoals(); initSettings();

/* ---------- boot ---------- */
renderAll();
initTracer();   // load capture config, start periodic flush (best-effort)
// Load everything from the server: chat, memory and settings (core/storage.js),
// then documents, ideas and goals. The same on every device (ADR-0008).
async function loadAll() {
  const saved = await loadState();
  if (!saved) return false;
  replaceState(saved);
  await initConnectors();
  const [docs, ideas, plans] = await Promise.all([
    docsApi.listDocs().catch(() => []), docsApi.listIdeas().catch(() => []), docsApi.listGoals().catch(() => [])
  ]);
  Object.assign(state, { docs, ideas, plans });
  return true;
}

// Coming back to this tab: pick up what other devices did meanwhile.
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || rt.busy) return;
  await flush(); // send this tab's unsaved changes first
  if (await loadAll() && !rt.busy) { renderAll(); followLive(); }
});

(async () => {
  if (!await loadAll()) {
    disableChat("Muse can't load your saved chat and settings from the server. Check that the server and its database are running, then reload the page.");
    renderAll();
    return;
  }
  if (!rt.busy) renderAll();
  followLive(); // a turn still running (started on another device, or before a reload)
  if (!window.agent?.use) { disableChat("The assistant isn't loaded, so Muse can't reply. Reload the page."); return; }
  const s = await agent.use("sample");
  if (!s) { disableChat("Muse can't reach the assistant right now. Reload the page and try again."); return; }
  try { const lim = await s.limits(); if (lim && !lim.tools) { disableChat(ERR.tools_unavailable); return; } } catch (e) {}
  rt.sample = s; $("note").textContent = noteText(); renderIdeas(); renderGoalSuggs();
  if ($("main").dataset.main === "ideas") maybeUpdateIdeas();
})();
