// Acceptance tests: Goals (docs/specs/goals.md), server criteria.
// The database is replaced with an in-memory fake; the model is scripted.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../testkit/fake-db.js";

const goalsDb = [];
mock.module("../server/db.js", { namedExports: { ...fakeDb, createGoal: async (userId, g) => { const goal = { id: "g" + (goalsDb.length + 1), ...g }; goalsDb.push(goal); return goal; } } });
const goalsApi = await import("../server/goals.js");
const { setup, call, waitForEvent, toolReply, U } = await import("../testkit/agent.js");
const { answerWait } = await import("../server/agent/runtime.js");

const steps = n => Array.from({ length: n }, (_, i) => `Step ${i + 1}`);
const jobGoal = (applications = []) => ({ id: "g1", goal: "Land 3 interviews", steps: steps(3).map(text => ({ text, status: "todo" })), applications });

test("goals AC2: create_goal with fewer than 3 or more than 6 steps is refused", async () => {
  for (const n of [0, 2, 7]) {
    const t = setup({ script: [{ tools: [call("create_goal", { goal: "Get fit", steps: steps(n) })] }, { text: "ok" }] });
    await t.turn({ text: "make a goal" });
    assert.match(toolReply(t.llm), /^Error: a goal needs 3 to 6 steps/);
    assert.equal(t.repo.data.goals.length, 0);
  }
  for (const n of [3, 6]) {
    const t = setup({ script: [{ tools: [call("create_goal", { goal: "Get fit", steps: steps(n) })] }, { text: "ok" }] });
    await t.turn({ text: "make a goal" });
    assert.equal(t.repo.data.goals[0].steps.length, n);
  }
});

test("goals AC4: marking a step done citing a tool that didn't run is refused, naming the tools that did", async () => {
  const goal = { id: "g1", goal: "Find a PM role", steps: steps(3).map(text => ({ text, status: "todo" })), applications: [] };
  const t = setup({ repoSeed: { goals: [goal] }, services: { webSearch: async () => ({ status: 200, json: { results: [] } }) },
    script: [{ tools: [call("web_search", { query: "PM roles Detroit" })] }, { tools: [call("update_step", { goal_id: "g1", step: 2, status: "done", evidence: "jobs_search" })] }, { text: "ok" }] });
  await t.turn({ text: "work on my goal" });
  assert.match(toolReply(t.llm, 2), /Tools used this turn: web_search/);
  assert.equal(t.repo.data.goals[0].steps[1].status, "todo");
});

test("goals AC5: jobs_search with neither keywords nor boards is refused", async () => {
  let searched = false;
  const t = setup({ services: { jobsSearch: async () => { searched = true; return { status: 200, json: { jobs: [] } }; } }, script: [{ tools: [call("jobs_search", {})] }, { text: "ok" }] });
  await t.turn({ text: "find jobs" });
  assert.match(toolReply(t.llm), /give keywords \(the job title\)/);
  assert.equal(searched, false);
});

test("goals AC6: score_fit without a résumé in the Library asks the user to add one", async () => {
  const t = setup({ script: [{ tools: [call("score_fit", { company: "Acme", role: "PM", posting_text: "x".repeat(300) })] }, { text: "ok" }] });
  await t.turn({ text: "score this job" });
  assert.match(toolReply(t.llm), /No résumé in the Library\. Ask the user to add their résumé/);
});

test("goals AC7: marking a job applied with no proof and no word from the user is refused", async () => {
  const t = setup({ repoSeed: { goals: [jobGoal([{ company: "Acme", role: "PM", status: "drafted" }])] },
    script: [{ tools: [call("track_application", { goal_id: "g1", company: "Acme", role: "PM", status: "applied" })] }, { text: "ok" }] });
  await t.turn({ text: "how is Acme going?" });
  assert.match(toolReply(t.llm), /^Error: Cannot mark Acme · PM as applied/);
  assert.equal(t.repo.data.goals[0].applications[0].status, "drafted");
});

test("goals AC8: counting an interview from an employer's email asks the user to confirm", async () => {
  const google = async action => action === "mail/search" ? { messages: [{ id: "m1", subject: "Interview with Acme" }] } : {};
  const t = setup({ google, repoSeed: { goals: [jobGoal([{ company: "Acme", role: "PM", status: "applied" }])] },
    script: [{ tools: [call("mail_search", { query: "Acme" })] }, { tools: [call("track_application", { goal_id: "g1", company: "Acme", role: "PM", status: "interview" })] }, { text: "ok" }] });
  const running = t.turn({ text: "did Acme reply?" });
  const msg = await waitForEvent(t.events, "msg", 5);
  const card = msg.acts.find(a => a.approval === "pending");
  assert.equal(card.card.heading, "Count this as an interview?");
  assert.equal(t.repo.data.goals[0].applications[0].status, "applied", "not counted before the answer");
  await answerWait(t.store, U, card.id, { answer: true });
  await running;
  assert.equal(t.repo.data.goals[0].applications[0].status, "interview");
});

test("goals AC9: revise_plan shows a before/after card and changes nothing unless approved", async () => {
  const t = setup({ repoSeed: { goals: [jobGoal()] }, script: [{ tools: [call("revise_plan", { goal_id: "g1", steps: ["Step 1", "Step 2", "Call a recruiter"] })] }, { text: "ok" }] });
  const running = t.turn({ text: "swap the last step for calling a recruiter" });
  const msg = await waitForEvent(t.events, "msg", 3);
  const card = msg.acts.find(a => a.approval === "pending");
  assert.match(card.card.heading, /^Change the plan for/);
  assert.ok(card.card.rows.length > 0);
  await answerWait(t.store, U, card.id, { answer: false });
  await running;
  assert.deepEqual(t.repo.data.goals[0].steps.map(s => s.text), steps(3));
});

test("goals AC10: revise_plan with fewer than 3 or more than 6 steps is refused", async () => {
  for (const n of [2, 7]) {
    const t = setup({ repoSeed: { goals: [jobGoal()] }, script: [{ tools: [call("revise_plan", { goal_id: "g1", steps: steps(n) })] }, { text: "ok" }] });
    await t.turn({ text: "change the plan" });
    assert.match(toolReply(t.llm), /^Error: a plan needs 3 to 6 steps/);
  }
});

test("goals AC11: when the user says they applied, Muse can mark the job applied", async () => {
  const t = setup({ repoSeed: { goals: [jobGoal([{ company: "Acme", role: "PM", status: "drafted" }])] },
    script: [{ tools: [call("track_application", { goal_id: "g1", company: "Acme", role: "PM", status: "applied" })] }, { text: "Marked it applied." }] });
  await t.turn({ text: "I applied to the Acme PM job this morning" });
  assert.equal(t.repo.data.goals[0].applications[0].status, "applied");
  // Saying you haven't applied is not the same.
  const no = setup({ repoSeed: { goals: [jobGoal([{ company: "Acme", role: "PM", status: "drafted" }])] },
    script: [{ tools: [call("track_application", { goal_id: "g1", company: "Acme", role: "PM", status: "applied" })] }, { text: "ok" }] });
  await no.turn({ text: "I haven't applied to Acme yet" });
  assert.equal(no.repo.data.goals[0].applications[0].status, "drafted");
});

test("goals AC12: the goals API refuses a goal with fewer than 3 or more than 6 steps", async () => {
  for (const n of [1, 7]) {
    const out = await goalsApi.handleCreate("u1", { goal: "Get fit", steps: steps(n) });
    assert.deepEqual([out.status, out.json.error], [400, "a goal needs 3 to 6 steps"]);
  }
  assert.equal((await goalsApi.handleCreate("u1", { goal: "Get fit", steps: steps(4) })).status, 201);
});
