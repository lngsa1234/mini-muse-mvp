// Acceptance tests: Daily check-in (docs/specs/daily-check-in.md), server criteria.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "../testkit/agent.js";

test("daily-check-in AC5: a check-in tells Muse the user is away and not to send emails", async () => {
  const t = setup({ script: [{ text: "Brief." }] });
  await t.turn({ checkin: true });
  const instruction = t.llm.seen[0].messages.at(-1).content;
  assert.match(instruction, /the user is away/);
  assert.match(instruction, /Do not send emails\./);
});

test("daily-check-in AC6: a check-in tells Muse to finish with a three-line brief and what needs the user's decision", async () => {
  const t = setup({ script: [{ text: "Brief." }] });
  await t.turn({ checkin: true });
  const instruction = t.llm.seen[0].messages.at(-1).content;
  assert.match(instruction, /write a progress brief of 3 short lines, list what needs my decision/);
});
