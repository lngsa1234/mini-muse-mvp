/*
 * Background check-in ("Let Muse work on your goals"): Muse reviews goals,
 * ideas and connected services while the user is away, does what it can,
 * and leaves a progress brief in chat.
 * Today it's triggered by a button; scheduling it is a natural next step.
 */
import { $, rid } from "../core/dom.js";
import { run } from "../agent/run.js";

export const CHECKIN = "This is a scheduled background check-in; the user is away. Review my goals, ideas, and any connected services (for example check mail for anything new). Do the steps you can do without me and update their status. Do not send emails. Then write a progress brief of 3 short lines, list what needs my decision, and suggest one idea worth turning into a goal if there is one.";

export const runCheckin = () => run({ id: rid(), role: "checkin", text: "", t: Date.now() });

export function initCheckin() {
  $("checkinBtn").addEventListener("click", runCheckin);
}
