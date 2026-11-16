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

export const CHECKIN = "This is a scheduled background check-in; the user is away. Review my goals, ideas, and any connected services (for example check mail for anything new). Do the steps you can do without me and update their status. Do not send emails. " +
  "For a job-search goal with a target: first check Gmail for replies from employers about tracked applications and update them with track_application. Then work out the pace: the target, how many are done, the days left, and how many more applications per week that implies. If the goal is behind pace, use jobs_search on the companies I asked you to watch (check memory; if there are none, ask me for a few), run score_fit on the most promising new postings, save the strong or possible fits with track_application, and list at most 5 with their scores. Never submit an application. " +
  "Then write a progress brief of 3 short lines, list what needs my decision, and suggest one idea worth turning into a goal if there is one.";

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
