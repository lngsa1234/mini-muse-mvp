/*
 * The agent loop (server side): send the conversation + tools, run any tools the
 * model asks for, feed the results back, repeat until the model answers (or
 * MAX_STEPS). Same algorithm the browser used to run (ADR-0001 → ADR-0009).
 */
export const MAX_STEPS = 12; // safety cap on tool-use loop iterations

export const toApiTools = tools => (tools || []).map(t => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.inputSchema || { type: "object", properties: {} } }
}));

const cancelled = () => Object.assign(new Error("cancelled"), { code: "cancelled" });

// messages: OpenAI-format conversation (system first). tools: [{ name, execute(input) }].
// Returns { text, truncated, steps }.
export async function runLoop({ llm, messages, tools, tier = "quick", signal, onText }) {
  const apiTools = toApiTools(tools);
  let finalText = "", truncated = false, step = 0;
  for (; step < MAX_STEPS; step++) {
    if (signal?.aborted) throw cancelled();
    const turn = await llm.chat({ tier, messages, ...(apiTools.length ? { tools: apiTools } : {}) }, { signal, onText, step });
    finalText = turn.text;
    if (turn.stopReason === "length" || turn.stopReason === "max_tokens") truncated = true;
    if (turn.stopReason !== "tool_calls" || !turn.toolUses.length) break;
    messages.push(turn.assistantMessage);
    for (const tu of turn.toolUses) {
      const tool = tools.find(t => t.name === tu.name);
      let content, isError = false;
      if (!tool) { content = "unknown tool " + tu.name; isError = true; }
      else {
        try {
          const out = await tool.execute(tu.input);
          content = typeof out === "string" ? out : JSON.stringify(out);
        } catch (e) {
          if (e?.code === "cancelled") throw e;
          content = e?.message || String(e); isError = true;
        }
      }
      messages.push({ role: "tool", tool_call_id: tu.id, content: isError ? `Error: ${content}` : content });
    }
  }
  return { text: finalText, truncated, steps: step + 1 };
}
