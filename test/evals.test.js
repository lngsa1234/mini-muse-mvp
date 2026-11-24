import { test } from "node:test";
import assert from "node:assert/strict";
import { SAFETY_RULES } from "../public/js/agent/policy.js";
import { EVAL_CASES } from "../evals/cases.js";

test("evaluation cases cover the supported-file and goal-progress guardrails", () => {
  assert.ok(SAFETY_RULES.some(rule => /résumé|resume/i.test(rule)));
  assert.ok(SAFETY_RULES.some(rule => /todo/i.test(rule)));
  assert.ok(EVAL_CASES.some(testCase => testCase.id === "resume-is-not-invented"));
  assert.ok(EVAL_CASES.some(testCase => testCase.id === "plan-is-not-progress"));
  assert.ok(SAFETY_RULES.some(rule => /submit/i.test(rule)));
  assert.ok(EVAL_CASES.some(testCase => testCase.id === "applications-are-not-invented"));
});

test("product evals and general-assistant evals are separate sets", async () => {
  const { GENERAL_EVAL_CASES } = await import("../evals/general-cases.js");
  const product = new Set(EVAL_CASES.map(testCase => testCase.id));
  const general = GENERAL_EVAL_CASES.map(testCase => testCase.id);
  assert.equal(product.size, EVAL_CASES.length, "product case ids are unique");
  assert.equal(new Set(general).size, general.length, "general case ids are unique");
  assert.ok(general.every(id => !product.has(id)), "no case is in both sets");
  // Weight management and shopping aren't product features: they live only in the general set.
  assert.ok(general.every(id => /^(weight-loss|shopping)-/.test(id)));
  assert.ok([...product].every(id => !/^(weight-loss|shopping)-/.test(id)));
});

test("evals send Muse's real prompt and tools, not a copy", async () => {
  const { museRequest, askMuse, museContext } = await import("../evals/muse.mjs");
  const { instructions } = await import("../server/agent/prompt.js");
  const { activeTools } = await import("../server/agent/tools/index.js");
  const testCase = EVAL_CASES.find(c => c.id === "email-request-uses-gmail-not-web");
  const { body } = museRequest(testCase);
  assert.equal(body.messages[0].content, instructions(museContext(testCase), [], []));
  assert.deepEqual(body.tools.map(t => t.function.name), activeTools(museContext(testCase)).map(t => t.name));
  assert.equal(body.messages[1].content, testCase.user);
  // Google can be switched off per case; then Gmail tools aren't offered.
  const offline = museRequest({ user: "hi", context: { google: false } }).body.tools.map(t => t.function.name);
  assert.ok(!offline.includes("mail_send"));
  // askMuse goes through Muse's LLM client shape and returns the tools it asked for.
  const seen = [];
  const llm = { chat: async b => { seen.push(b); return { text: "On it.", toolUses: [{ id: "1", name: "mail_send", input: { to: "jane@example.com" } }] }; } };
  const reply = await askMuse(llm, testCase);
  assert.deepEqual(reply, { text: "On it.", calls: [{ name: "mail_send", input: { to: "jane@example.com" } }] });
  assert.equal(seen[0].tier, "quick");
});

test("every tool an eval case names is one of Muse's real tools", async () => {
  const { GENERAL_EVAL_CASES } = await import("../evals/general-cases.js");
  const { toolsNamed } = await import("../evals/check.mjs");
  const { activeTools } = await import("../server/agent/tools/index.js");
  const real = new Set(activeTools({ data: { memory: [], connectors: {}, prefs: {} }, googleConnected: true }).map(t => t.name));
  for (const testCase of [...EVAL_CASES, ...GENERAL_EVAL_CASES]) {
    for (const name of toolsNamed(testCase)) assert.ok(real.has(name), `${testCase.id} names ${name}, which Muse doesn't have`);
  }
});

test("eval pass rules judge scripted replies", async () => {
  const { checkReply } = await import("../evals/check.mjs");
  const byId = id => EVAL_CASES.find(c => c.id === id);
  const email = byId("email-request-uses-gmail-not-web");
  assert.deepEqual(checkReply(email, { text: "", calls: [{ name: "mail_send", input: {} }] }), []);
  assert.match(checkReply(email, { text: "", calls: [{ name: "web_search", input: {} }] }).join(" "), /forbidden tool: web_search/);
  const plan = byId("plan-is-not-progress");
  assert.deepEqual(checkReply(plan, { text: "", calls: [{ name: "create_goal", input: { goal: "g", steps: ["a"] } }] }), []);
  assert.match(checkReply(plan, { text: "", calls: [{ name: "update_step", input: { status: "done" } }] }).join(" "), /unearned progress/);
  const resume = byId("resume-is-not-invented");
  assert.match(checkReply(resume, { text: "I updated your résumé.", calls: [] }).join(" "), /forbidden claim/);
});

test("eval timestamp checks compare instants, ignoring offset and look-alike characters", async () => {
  const { checkReply } = await import("../evals/check.mjs");
  const calendar = EVAL_CASES.find(c => c.id === "calendar-extracts-confirmed-event-from-email");
  const pass = text => assert.deepEqual(checkReply(calendar, { text, calls: [] }), [], text);
  const fail = (text, re) => assert.match(checkReply(calendar, { text, calls: [] }).join(" "), re, text);
  pass("Start: 2026-12-10T14:00:00-08:00, End: 2026-12-10T15:00:00-08:00");
  pass("Start: **2026-12-10T22:00:00Z** (UTC)\nEnd: **2026-12-10T23:00:00Z** (UTC)");
  pass("Start 2026-12-10T17:00-05:00, end 2026-12-10T23:00:00.000+0000");
  // Non-breaking hyphens (U+2011) and a minus sign (U+2212), as models often write them.
  pass("Start 2026\u201112\u201110T14:00:00\u221208:00, end 2026\u201112\u201110T15:00:00\u221208:00 (2:00\u202FPM PST)");
  fail("Start: 2026-12-10T14:00:00, End: 2026-12-10T15:00:00", /instant 2026-12-10T14:00:00-08:00/);
  fail("Start: 2026-12-10T14:00:00Z, End: 2026-12-10T15:00:00Z", /no ISO timestamp/);
  fail("Start: 2026-12-10T14:00:00-08:00 only", /instant 2026-12-10T15:00:00-08:00/);
  // A curly apostrophe still trips a forbidden claim.
  fail("I\u2019ve added 2026-12-10T22:00:00Z to 2026-12-10T23:00:00Z.", /forbidden claim/);
});
