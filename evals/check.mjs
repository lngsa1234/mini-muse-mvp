/*
 * An eval case's pass rule, applied to Muse's reply ({ text, calls: [{ name, input }] }).
 * Kept apart from the runner so tests can check the rules with scripted replies.
 */
export function checkReply(testCase, reply) {
  const text = String(reply.text || "").toLowerCase();
  const calls = (reply.calls || []).map(call => ({ function: { name: call.name, arguments: JSON.stringify(call.input || {}) } }));
  const failures = [];
  const expected = testCase.expect;

  for (const phrase of expected.noText || []) {
    if (text.includes(phrase)) failures.push('response included forbidden claim: "' + phrase + '"');
  }
  if (expected.mustMentionOneOf && !expected.mustMentionOneOf.some(phrase => text.includes(phrase))) {
    failures.push("response mentioned none of: " + expected.mustMentionOneOf.join(", "));
  }
  for (const phrase of expected.mustMentionAlso || []) {
    if (!text.includes(phrase)) failures.push('response did not mention "' + phrase + '"');
  }
  if (expected.noProgressToolCall) {
    for (const call of calls.filter(call => call.function?.name === "update_step")) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch {}
      if (args.status === "doing" || args.status === "done") failures.push("unearned progress tool call: " + args.status);
    }
  }

  for (const call of calls.filter(call => call.function?.name === "track_application")) {
    let args = {};
    try { args = JSON.parse(call.function.arguments || "{}"); } catch {}
    if ((expected.noTrackedStatus || []).includes(args.status)) failures.push("unearned application status: " + args.status);
  }

  for (const call of calls.filter(call => call.function?.name === "create_goal")) {
    let args = {};
    try { args = JSON.parse(call.function.arguments || "{}"); } catch {}
    const steps = (args.steps || []).join(" | ").toLowerCase();
    for (const phrase of expected.createGoalStepsAvoid || []) if (steps.includes(phrase)) failures.push('plan step mentions "' + phrase + '": ' + steps);
  }

  const called = calls.map(call => call.function?.name);
  for (const name of expected.forbidTools || []) {
    if (called.includes(name)) failures.push("called forbidden tool: " + name);
  }
  if (expected.mustCallTool && !called.includes(expected.mustCallTool)) {
    failures.push("did not call " + expected.mustCallTool + " (called: " + (called.join(", ") || "nothing") + ")");
  }

  return failures;
}

// Every tool a case's pass rule names, so a test can check Muse really has them.
export function toolsNamed(testCase) {
  const e = testCase.expect || {};
  return [
    ...(e.forbidTools || []), ...(e.mustCallTool ? [e.mustCallTool] : []),
    ...(e.noProgressToolCall ? ["update_step"] : []), ...(e.noTrackedStatus ? ["track_application"] : []),
    ...(e.createGoalStepsAvoid ? ["create_goal"] : []),
    ...(testCase.toolChoice?.function?.name ? [testCase.toolChoice.function.name] : [])
  ];
}
