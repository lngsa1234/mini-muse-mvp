// Settings page: response style (model tier), "How Muse works" toggle, start over.
// (Memory and Activity sections are rendered by features/memory and features/hood.)
import { $ } from "../../core/dom.js";
import { state, rt, blank, replaceState } from "../../core/state.js";
import { defineFeature, renderAll } from "../../core/registry.js";
import { save, flush } from "../../core/storage.js";
import { go } from "../../core/nav.js";
import { noteText } from "../chat/chat.js";

function renderSettings() {
  $("mFast").setAttribute("aria-pressed", rt.mode === "quick"); $("mSmart").setAttribute("aria-pressed", rt.mode === "default");
  $("modeNote").textContent = rt.mode === "quick" ? "Fast: replies in seconds. Good for most things." : "Thorough: a stronger model that plans more carefully. Replies can take up to a minute.";
}

// "quick" | "default" — the server maps these tiers to models (server/routing.js).
function setMode(m) { rt.mode = m; (state.prefs ||= {}).mode = m; renderSettings(); if (rt.sample) $("note").textContent = noteText(); save(); }

export function setLearn(on) {
  (state.prefs ||= {}).learn = on;
  $("panes").dataset.learn = on ? "on" : "off"; document.querySelector(".app").dataset.learn = on ? "on" : "off";
  $("learnBtn").setAttribute("aria-checked", on);
  if (!on && $("panes").dataset.mobile === "hood") go("chat");
}

/* start over, with an in-page confirm */
function restoreReset() { $("resetWrap").innerHTML = `<button class="btn" id="resetBtn">Erase everything…</button>`; }

export function initSettings() {
  $("learnBtn").addEventListener("click", () => { const on = !(state.prefs?.learn); setLearn(on); if (on && matchMedia("(max-width:1100px)").matches) go("hood"); save(); });
  $("mFast").onclick = () => setMode("quick");
  $("mSmart").onclick = () => setMode("default");
  $("resetWrap").addEventListener("click", e => {
    const id = e.target.id;
    if (id === "resetBtn") $("resetWrap").innerHTML = `<span class="confirm">Are you sure? <button class="btn" id="resetYes" style="border-color:var(--bad);color:var(--bad)">Yes, erase it all</button><button class="btn" id="resetNo">Cancel</button></span>`;
    else if (id === "resetYes") { if (rt.busy) rt.ctl?.abort(); const prefs = state.prefs; replaceState(blank()); state.prefs = prefs; renderAll(); go("settings"); flush(); restoreReset(); }
    else if (id === "resetNo") restoreReset();
  });
}

defineFeature({
  id: "settings",
  render: renderSettings,
  beforeRenderAll() { rt.mode = state.prefs?.mode || "quick"; setLearn(!!state.prefs?.learn); }
});
