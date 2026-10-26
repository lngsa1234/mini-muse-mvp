/*
 * Tool assembly: collects tools from features and connected connectors and
 * wraps each one so it shows progress in chat, logs to Activity, and saves.
 * ---------------------------------------------------------------------------
 * A tool is defined in its feature/connector as:
 *
 *   { name, description, inputSchema, writes?,      // writes: connector tools only
 *     run(input, context, h) => result | Promise }  // result: string or JSON-able
 *
 * `h` (helpers) gives you:
 *   h.act(label)                 show a chip in the chat message ("save_idea  My idea")
 *   h.ask(tool, card, context)   ask the user to approve; resolves true | false | null
 *   h.needsAsk(connectorKey)     does this connector require approval for changes?
 *   h.refusal(ok)                standard text to return when the user declined
 * Throw an Error to report a problem to the model.
 */
import { state, isOn } from "../core/state.js";
import { features, CONNECTORS, renderMine } from "../core/registry.js";
import { audit, setPhase } from "../core/activity.js";
import { save } from "../core/storage.js";
import { rid } from "../core/dom.js";
import { updateMsg } from "../features/chat/chat.js";
import { requestApproval } from "../workflow/approvals.js";

// Names of the always-on tools, for display (features/hood).
export const coreToolNames = () => features.flatMap(f => (f.tools || []).map(t => t.name));

export function makeTools(msg) {
  const act = (tool, label, extra = {}) => { const a = { id: rid(), tool, label, ...extra }; (msg.acts ||= []).push(a); updateMsg(msg); return a; };
  const wrap = (name, fn) => async (input, context) => {
    setPhase("tool"); msg.status = "Using " + name + "…"; updateMsg(msg);
    try { const r = await fn(input || {}, context); audit(name, input, r); return r; }
    catch (e) { audit(name, input, "Error: " + e.message); throw e; }
    finally { renderMine(); save(); setPhase("thinking"); msg.status = "Thinking…"; updateMsg(msg); }
  };
  const helpersFor = name => ({
    act: label => act(name, label),
    ask: (tool, card, context) => requestApproval(msg, act, tool, card, context),
    needsAsk: k => CONNECTORS[k].lockAsk || state.connectors[k].writes === "ask",
    refusal: ok => ok === null ? "The user did not answer. Nothing was changed." : "The user declined. Nothing was changed."
  });
  const build = t => ({
    name: t.name, description: t.description, inputSchema: t.inputSchema,
    execute: wrap(t.name, (input, context) => t.run(input, context, helpersFor(t.name)))
  });

  const tools = features.flatMap(f => f.tools || []).map(build);
  for (const [k, c] of Object.entries(CONNECTORS)) if (isOn(k)) tools.push(...c.tools.map(build));
  return tools;
}
