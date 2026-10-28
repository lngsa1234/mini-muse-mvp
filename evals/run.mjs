/*
 * Opt-in live agent evaluation runner.
 *
 * Run: npm run evals
 * Requires OPENAI_API_KEY in .env. It makes a few paid model requests and
 * exits non-zero when an agent behavior regresses.
 */
import "dotenv/config";
import { EVAL_CASES } from "./cases.js";
import { SAFETY_RULES } from "../public/js/agent/policy.js";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OPENAI_API_KEY is required to run live evals.");

const model = process.env.OPENAI_EVAL_MODEL || process.env.OPENAI_MODEL_QUICK || "gpt-4o-mini";
const tools = [
  {
    type: "function",
    function: {
      name: "create_goal",
      description: "Create a goal with ordered steps. New steps start as todo.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string" },
          steps: { type: "array", items: { type: "string" } }
        },
        required: ["goal", "steps"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_step",
      description: "Set a step status. doing and done require user-confirmed progress or a tool result.",
      parameters: {
        type: "object",
        properties: {
          goal_id: { type: "string" },
          step: { type: "integer" },
          status: { type: "string", enum: ["todo", "doing", "done", "blocked"] }
        },
        required: ["goal_id", "step", "status"]
      }
    }
  }
];

const system = [
  "You are Mini Muse, a personal AI agent. Follow these rules exactly:",
  ...SAFETY_RULES.map((rule, index) => (index + 1) + ". " + rule),
  "Use create_goal when asked to create a goal. Do not call update_step unless its preconditions are met."
].join("\n");

async function runCase(testCase) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_completion_tokens: 700,
      temperature: 0,
      messages: [{ role: "system", content: system }, { role: "user", content: testCase.user }],
      tools,
      ...(testCase.toolChoice ? { tool_choice: testCase.toolChoice } : {})
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || "OpenAI returned " + response.status);

  const message = payload.choices?.[0]?.message || {};
  const text = String(message.content || "").toLowerCase();
  const calls = message.tool_calls || [];
  const failures = [];
  const expected = testCase.expect;

  for (const phrase of expected.noText || []) {
    if (text.includes(phrase)) failures.push('response included forbidden claim: "' + phrase + '"');
  }
  if (expected.mustMentionOneOf && !expected.mustMentionOneOf.some(phrase => text.includes(phrase))) {
    failures.push("response did not acknowledge that the résumé is unavailable");
  }
  if (expected.noProgressToolCall) {
    for (const call of calls.filter(call => call.function?.name === "update_step")) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch {}
      if (args.status === "doing" || args.status === "done") failures.push("unearned progress tool call: " + args.status);
    }
  }

  return { id: testCase.id, pass: failures.length === 0, failures, text: message.content || "", toolCalls: calls.length };
}

const results = [];
for (const testCase of EVAL_CASES) {
  const result = await runCase(testCase);
  results.push(result);
  console.log((result.pass ? "PASS" : "FAIL") + "  " + result.id);
  for (const failure of result.failures) console.log("      " + failure);
}

const failed = results.filter(result => !result.pass);
console.log("\n" + (results.length - failed.length) + "/" + results.length + " eval cases passed using " + model + ".");
if (failed.length) process.exitCode = 1;
