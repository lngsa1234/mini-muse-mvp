import { test } from "node:test";
import assert from "node:assert/strict";
import { SAFETY_RULES } from "../public/js/agent/policy.js";
import { EVAL_CASES } from "../evals/cases.js";

test("evaluation cases cover the supported-file and goal-progress guardrails", () => {
  assert.ok(SAFETY_RULES.some(rule => /résumé|resume/i.test(rule)));
  assert.ok(SAFETY_RULES.some(rule => /todo/i.test(rule)));
  assert.ok(EVAL_CASES.some(testCase => testCase.id === "resume-is-not-invented"));
  assert.ok(EVAL_CASES.some(testCase => testCase.id === "plan-is-not-progress"));
});
