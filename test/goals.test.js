// Goal targets and the application tracker: `npm test` (no network, no API key).
import { test } from "node:test";
import assert from "node:assert/strict";
import { normTarget, normDeadline, deadlineIn, normApplication, upsertApplication, findApplication, nextStatus, goalProgress } from "../public/js/features/goals/model.js";

test("goals: target and deadline are optional but validated", () => {
  assert.equal(normTarget(undefined), null);
  assert.deepEqual(normTarget({ metric: "interviews", count: 3 }), { metric: "interviews", count: 3 });
  assert.throws(() => normTarget({ metric: "hugs", count: 3 }));
  assert.throws(() => normTarget({ metric: "interviews", count: 0 }));
  assert.throws(() => normTarget({ metric: "interviews", count: 2.5 }));
  assert.equal(normDeadline(""), null);
  assert.equal(normDeadline("2026-12-16"), "2026-12-16");
  assert.throws(() => normDeadline("next month"));
});

test("goals: deadlineIn counts calendar days from today", () => {
  assert.equal(deadlineIn(30, new Date(2026, 10, 16, 17, 30)), "2026-12-16");
  assert.equal(deadlineIn(1, new Date(2026, 11, 31)), "2027-01-01");
  assert.throws(() => deadlineIn(0));
});

test("goals: applications are validated and upserted by company and role", () => {
  assert.throws(() => normApplication({ company: "Acme" }));
  assert.throws(() => normApplication({ company: "Acme", role: "PM", status: "hired" }));
  assert.throws(() => normApplication({ company: "Acme", role: "PM", url: "javascript:alert(1)" }));
  let apps = upsertApplication([], normApplication({ company: "Acme", role: "Senior PM", url: "https://acme.example/jobs/1" }, 1));
  apps = upsertApplication(apps, normApplication({ company: "acme", role: "senior pm", status: "applied" }, 2));
  assert.equal(apps.length, 1);
  assert.equal(apps[0].status, "applied");
  assert.equal(apps[0].url, "https://acme.example/jobs/1"); // kept from the first save
  assert.equal(findApplication(apps, "ACME", "Senior PM").status, "applied");
  assert.equal(nextStatus("rejected"), "saved");
});

test("goals: progress counts interviews and offers against the target", () => {
  const goal = {
    target: { metric: "interviews", count: 3 }, deadline: "2026-12-16",
    applications: [{ status: "applied" }, { status: "interview" }, { status: "offer" }, { status: "rejected" }]
  };
  assert.deepEqual(goalProgress(goal, new Date(2026, 10, 16, 17)), { metric: "interviews", count: 3, done: 2, daysLeft: 30 });
  assert.equal(goalProgress({ ...goal, target: { metric: "applications", count: 40 } }, new Date(2026, 11, 20)).done, 4);
  assert.equal(goalProgress(goal, new Date(2026, 11, 20)).daysLeft, 0);
  assert.equal(goalProgress({ steps: [] }), null);
});
