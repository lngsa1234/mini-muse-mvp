/*
 * The agent loop: send the conversation + tools, run any tools the model asks
 * for, feed the results back, repeat until the model answers (or MAX_STEPS).
 */
import { streamTurn, cancelled } from "./transport.js";

export const MAX_STEPS = 12; // safety cap on tool-use loop iterations

/* ---------- turn the app's loose message list into a valid request ---------- */
// buildInput() (agent/prompt.js) returns [{role:"user", content: <instructions>}, ...chat].
// We lift the leading instruction block into `system`, drop any leading
// assistant turns, and merge consecutive same-role string messages.
export function normalize(turns) {
  const arr = Array.isArray(turns) ? turns.slice() : [];
  let system = "";
  if (arr.length && arr[0].role === "user" && typeof arr[0].content === "string") {
    system = arr.shift().content;
  }
  while (arr.length && arr[0].role === "assistant") arr.shift();
  const out = [];
  for (const m of arr) {
    const last = out[out.length - 1];
    if (last && last.role === m.role && typeof last.content === "string" && typeof m.content === "string") {
      last.content += "\n\n" + m.content;
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  if (!out.length) out.push({ role: "user", content: "Hello" });
  return { system, messages: out };
}

export function toApiTools(tools) {
  return (tools || []).map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema || { type: "object", properties: {} }
  }));
}

/* ---------- run one chat turn through the tool-use loop ---------- */
export async function runLoop(turns, opts) {
  opts = opts || {};
  const signal = opts.signal;
  const tier = opts.modelTier === "default" ? "default" : "quick";
  const tools = opts.tools || [];
  const apiTools = toApiTools(tools);

  const { system, messages } = normalize(turns);
  let finalText = "";
  let truncated = false;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal && signal.aborted) throw cancelled();
    const turn = await streamTurn(
      { tier, system, messages, tools: apiTools },
      signal,
      opts.onText
    );
    finalText = turn.text;
    if (turn.stopReason === "max_tokens") truncated = true;

    if (turn.stopReason === "tool_use" && turn.toolUses.length) {
      messages.push({ role: "assistant", content: turn.assistantContent });
      const results = [];
      for (const tu of turn.toolUses) {
        const tool = tools.find(t => t.name === tu.name);
        let content, isError = false;
        if (!tool) { content = "Error: unknown tool " + tu.name; isError = true; }
        else {
          try {
            const out = await tool.execute(tu.input, { signal });
            content = typeof out === "string" ? out : JSON.stringify(out);
          } catch (e) {
            content = "Error: " + (e && e.message ? e.message : String(e));
            isError = true;
          }
        }
        results.push({ type: "tool_result", tool_use_id: tu.id, content, is_error: isError });
      }
      messages.push({ role: "user", content: results });
      continue;
    }
    break;
  }
  return { text: finalText, truncated };
}
