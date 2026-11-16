import { test } from "node:test";
import assert from "node:assert/strict";
import { isEmailRequest } from "../public/js/agent/intent.js";
import { SAFETY_RULES } from "../public/js/agent/policy.js";

test("email requests are recognised so forced web research is skipped", () => {
  for (const msg of [
    "send an email to jane@example.com",
    "Go ahead and email the recruiter",
    "please e-mail my manager the update",
    "continue — send it via Gmail",
    "Can you mail this to Sam?"
  ]) assert.ok(isEmailRequest(msg), msg);
});

test("non-email goal continuations still allow web research", () => {
  for (const msg of ["go ahead", "move my goal forward", "continue with the next step", "find open positions"])
    assert.equal(isEmailRequest(msg), false, msg);
});

test("prompt routes email to Gmail, never web_search", () => {
  assert.ok(SAFETY_RULES.some(rule => /mail_send/.test(rule) && /web_search/.test(rule)));
  assert.ok(!SAFETY_RULES.some(rule => /cannot browse the web/i.test(rule)), "rule contradicts the web tools");
});
