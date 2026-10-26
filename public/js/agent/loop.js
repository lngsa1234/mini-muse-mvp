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
  const out = system ? [{ role: "system", content: system }] : [];
  for (const m of arr) {
    if (m.role === "assistant" && Array.isArray(m.content)) {
      const text = m.content.filter(b => b.type === "text").map(b => b.text).join("");
      const tool_calls = m.content.filter(b => b.type === "tool_use").map(b => ({
        id: b.id,
        type: "function",
        function: { name: b.name, arguments: JSON.stringify(b.input || {}) }
      }));
      out.push({ role: "assistant", content: text || null, ...(tool_calls.length ? { tool_calls } : {}) });
      continue;
    }
    if (m.role === "user" && Array.isArray(m.content)) {
      for (const result of m.content) {
        if (result.type === "tool_result") out.push({ role: "tool", tool_call_id: result.tool_use_id, content: String(result.content || "") });
      }
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.role === m.role && typeof last.content === "string" && typeof m.content === "string") {
      last.content += "\n\n" + m.content;
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  if (out.length === (system ? 1 : 0)) out.push({ role: "user", content: "Hello" });
  return { messages: out };
}

export function toApiTools(tools) {
  return (tools || []).map(t => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema || { type: "object", properties: {} }
    }
  }));
}

/* ---------- run one chat turn through the tool-use loop ---------- */
export async function runLoop(turns, opts) {
  opts = opts || {};
  const signal = opts.signal;
  const tier = opts.modelTier === "default" ? "default" : "quick";
  const tools = opts.tools || [];
  const apiTools = toApiTools(tools);

  const { messages } = normalize(turns);
  let finalText = "";
  let truncated = false;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal && signal.aborted) throw cancelled();
    const turn = await streamTurn(
      { tier, messages, tools: apiTools },
      signal,
      opts.onText
    );
    finalText = turn.text;
    if (turn.stopReason === "max_tokens") truncated = true;

    if (turn.stopReason === "tool_calls" && turn.toolUses.length) {
      messages.push(turn.assistantMessage);
      const results = [];
      for (const tu of turn.toolUses) {
        const tool = tools.find(t => t.name === tu.name);
        let content, isError = false;
        if (!tool) { content = "unknown tool " + tu.name; isError = true; }
        else {
          try {
            const out = await tool.execute(tu.input, { signal });
            content = typeof out === "string" ? out : JSON.stringify(out);
          } catch (e) {
              content = e && e.message ? e.message : String(e);
            isError = true;
          }
        }
        results.push({ role: "tool", tool_call_id: tu.id, content: isError ? `Error: ${content}` : content });
      }
      messages.push(...results);
      continue;
    }
    break;
  }
  return { text: finalText, truncated };
}
