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

test("intent: short go-aheads, apply offers, and single posting links", async () => {
  const { isAffirmation, offersToApply, applicationLink } = await import("../public/js/agent/intent.js");
  for (const t of ["yes", "yes please", "Yes, please!", "ok", "sure", "go ahead"]) assert.ok(isAffirmation(t), t);
  for (const t of ["yes but search Rivian first", "no", "what about remote jobs?"]) assert.ok(!isAffirmation(t), t);
  assert.ok(offersToApply("Would you like me to apply to the Acme role?"));
  assert.ok(!offersToApply("Would you like to start with the first step and identify job boards?"));
  // Search and listing pages, and general job sites, are never an application.
  assert.equal(applicationLink("[View Job](https://www.zippia.com/business-finance-analyst-jobs/jobs)"), null);
  assert.equal(applicationLink("https://www.builtinla.com/jobs/remote/data-analytics/search/business-analyst"), null);
  assert.equal(applicationLink("https://www.linkedin.com/jobs/view/123"), null);
  assert.equal(applicationLink("Apply here: https://boards.greenhouse.io/acme/jobs/123."), "https://boards.greenhouse.io/acme/jobs/123");
  // Two different postings: ambiguous, so no automatic open.
  assert.equal(applicationLink("https://jobs.lever.co/a/1 and https://jobs.lever.co/b/2"), null);
});
