/*
 * Opt-in live agent evaluation runner.
 *
 * Run: npm run evals                 the product cases (evals/cases.js)
 *      npm run evals -- --general    general-assistant cases (evals/general-cases.js)
 *      npm run evals -- --all        both
 * Requires OPENAI_API_KEY in .env. It makes a few paid model requests and
 * exits non-zero when an agent behavior regresses.
 */
import "dotenv/config";
import { EVAL_CASES } from "./cases.js";
import { GENERAL_EVAL_CASES } from "./general-cases.js";
import { makeLlm } from "../server/agent/llm.js";
import { askMuse } from "./muse.mjs";
import { checkReply } from "./check.mjs";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OPENAI_API_KEY is required to run live evals.");

// Muse's own client and model routing (the Fast tier); OPENAI_EVAL_MODEL overrides the model.
const env = { ...process.env, ...(process.env.OPENAI_EVAL_MODEL ? { OPENAI_MODEL_QUICK: process.env.OPENAI_EVAL_MODEL } : {}) };
const model = env.OPENAI_MODEL_QUICK || "gpt-4o-mini";
const llm = makeLlm({ env });

async function runCase(testCase) {
  const reply = await askMuse(llm, testCase);
  const failures = checkReply(testCase, reply);
  return { id: testCase.id, pass: failures.length === 0, failures, text: reply.text, toolCalls: reply.calls.length };
}

const args = process.argv.slice(2);
const set = args.includes("--all") ? "all" : args.includes("--general") ? "general" : "product";
const selected = set === "all" ? [...EVAL_CASES, ...GENERAL_EVAL_CASES] : set === "general" ? GENERAL_EVAL_CASES : EVAL_CASES;
console.log("Running " + selected.length + " " + (set === "all" ? "product and general" : set) + " eval cases.\n");

const results = [];
for (const testCase of selected) {
  const result = await runCase(testCase);
  results.push(result);
  console.log((result.pass ? "PASS" : "FAIL") + "  " + result.id);
  for (const failure of result.failures) console.log("      " + failure);
  // Show the reply, with non-ASCII characters escaped so look-alikes (U+2011 etc.) are visible.
  if (!result.pass && result.text) {
    const shown = result.text.slice(0, 600).replace(/[^\x20-\x7E\n]/g, ch => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase());
    console.log("      reply: " + shown.split("\n").join("\n             "));
  }
}

const failed = results.filter(result => !result.pass);
console.log("\n" + (results.length - failed.length) + "/" + results.length + " eval cases passed using " + model + ".");
if (failed.length) process.exitCode = 1;
