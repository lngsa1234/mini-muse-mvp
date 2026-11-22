/*
 * Background check-in ("Let Muse work on your goals"): Muse reviews goals,
 * ideas and connected services while the user is away, does what it can,
 * and leaves a progress brief in chat.
 * It runs from the button, or once a day on its own when "Every day" is on and
 * the app is open (from 9am local time). A server-side scheduler that runs with
 * the app closed is the natural next step.
 */
import { $, rid } from "../core/dom.js";
import { state, rt } from "../core/state.js";
import { save } from "../core/storage.js";
import { run } from "../agent/run.js";

export { CHECKIN } from "./checkin-prompt.js";

const START_HOUR = 9;
const today = () => new Date().toLocaleDateString("en-CA");

export function runCheckin() {
  (state.prefs ||= {}).lastCheckin = today(); save();
  return run({ id: rid(), role: "checkin", text: "", t: Date.now() });
}

// Run the day's check-in once, when it's on, due, and Muse is free.
export function maybeDailyCheckin(now = new Date()) {
  const p = state.prefs || {};
  if (!p.dailyCheckin || p.lastCheckin === today() || now.getHours() < START_HOUR) return false;
  if (!rt.sample || rt.busy || !state.plans.length) return false;
  runCheckin();
  return true;
}

// Called from the Goals page render, after saved state has loaded.
export function renderDaily() {
  const box = $("dailyCheckin"); if (box) box.checked = !!state.prefs?.dailyCheckin;
}

export function initCheckin() {
  $("checkinBtn").addEventListener("click", runCheckin);
  const box = $("dailyCheckin");
  box?.addEventListener("change", () => { (state.prefs ||= {}).dailyCheckin = box.checked; save(); if (box.checked) maybeDailyCheckin(); });
  renderDaily();
  setInterval(() => maybeDailyCheckin(), 5 * 60 * 1000);
  setTimeout(() => maybeDailyCheckin(), 20 * 1000); // shortly after the app opens
}
