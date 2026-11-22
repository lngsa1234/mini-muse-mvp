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
