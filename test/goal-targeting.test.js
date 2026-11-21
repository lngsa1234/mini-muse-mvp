// Goal-scoped step selection: `npm test` (no network, no API key).
import { test } from "node:test";
import assert from "node:assert/strict";
import { findStep, targetGoal, JOB_RESEARCH_STEP, DOCUMENT_STEP } from "../public/js/features/goals/model.js";

const trip = () => ({ id: "g_trip", goal: "Plan a trip to Japan", updatedAt: 1, steps: [{ text: "Determine travel dates and budget allocation", status: "todo" }] });
const job = () => ({ id: "g_job", goal: "Land a new job", updatedAt: 2, steps: [{ text: "Identify job boards and companies to target", status: "todo" }] });

test("goal targeting: naming the trip goal never selects job research", () => {
  assert.equal(findStep([trip(), job()], "move my trip goal forward", "", JOB_RESEARCH_STEP), null);
  // A named goal that matches no title still forces nothing.
  const vacation = { id: "g_v", goal: "Vacation abroad", steps: [{ text: "Pick dates", status: "todo" }] };
  assert.equal(findStep([vacation, job()], "move my trip goal forward", "", JOB_RESEARCH_STEP), null);
});

test("goal targeting: naming the job goal returns its research step", () => {
  const found = findStep([trip(), job()], "move my job goal forward", "", JOB_RESEARCH_STEP);
  assert.equal(found.goal.id, "g_job");
  assert.equal(found.step.text, "Identify job boards and companies to target");
  assert.equal(found.index, 0);
});

test("goal targeting: with no goal named, the most recently updated actionable goal wins", () => {
  assert.equal(findStep([trip(), job()], "move my goal forward", "", JOB_RESEARCH_STEP).goal.id, "g_job");
  const job2 = { ...job(), id: "g_job2", goal: "Switch careers", updatedAt: 5 };
  assert.equal(findStep([job(), job2], "move my goal forward", "", JOB_RESEARCH_STEP).goal.id, "g_job2");
  assert.deepEqual(targetGoal([trip(), job()], "move my goal forward", ""), { named: false, goal: null });
});

test("goal targeting: a yes follows the goal Muse's last message named", () => {
  const found = findStep([trip(), job()], "yes", "Shall I move your trip goal forward?", JOB_RESEARCH_STEP);
  assert.equal(found, null);
});

test("goal targeting: a résumé step in another goal is not selected", () => {
  const other = { id: "g_b", goal: "Land a new job", steps: [{ text: "Update résumé", status: "todo" }] };
  const a = { id: "g_a", goal: "Plan a trip to Japan", steps: [{ text: "Book flights", status: "todo" }] };
  assert.equal(findStep([a, other], "update my trip goal", "", DOCUMENT_STEP), null);
  assert.equal(findStep([a, other], "update my job goal", "", DOCUMENT_STEP).step.text, "Update résumé");
});

test("goal targeting: an earlier undone step blocks a later matching step", () => {
  const g = { id: "g_c", goal: "Land a new job", steps: [{ text: "Update résumé", status: "todo" }, { text: "Research job openings", status: "todo" }] };
  assert.equal(findStep([g], "move my job goal forward", "", JOB_RESEARCH_STEP), null);
  assert.equal(findStep([g], "move my job goal forward", "", DOCUMENT_STEP).index, 0);
  g.steps[0].status = "done";
  assert.equal(findStep([g], "move my job goal forward", "", JOB_RESEARCH_STEP).index, 1);
});
