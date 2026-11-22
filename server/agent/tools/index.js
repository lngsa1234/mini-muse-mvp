/*
 * The agent's tools, assembled on the server (ADR-0009).
 * ---------------------------------------------------------------------------
 * One module per feature, each { id, guidance, tools, enabled?(ctx) }. A tool is
 *   { name, description, inputSchema, connector?, writes?, client?,
 *     run(input, ctx, h) => result }
 *   h.act(label, extra)  record an action chip on the chat message
 *   h.ask(tool, card)    ask the user to approve; resolves true | false | null
 *   h.needsAsk(key)      does this connector need approval for changes?
 *   h.refusal(ok)        standard text when the user declined / didn't answer
 *   h.turnActions()      actions already taken this turn (proof for goal steps)
 * `client: true` tools run in the user's open tab (the Chrome bridge).
 *
 * Order matters the same way it did in the browser: it is the order tools are
 * sent to the model and the numbering of the "How you work" rules.
 */
import ideas from "./ideas.js";
import goals from "./goals.js";
import memory from "./memory.js";
import library from "./library.js";
import connectors, { isOn } from "./connectors.js";
import web from "./web.js";
import browser from "./browser.js";
import jobs from "./jobs.js";

export const FEATURES = [ideas, goals, memory, library, connectors, web, browser, jobs];

const featureOn = (f, ctx) => !f.enabled || f.enabled(ctx);

// Every tool, for the "How Muse works" panel: [{ name, feature, connector? }].
export const allTools = () => [
  ...FEATURES.filter(f => f !== connectors).flatMap(f => f.tools.map(t => ({ name: t.name, feature: f.id }))),
  ...connectors.tools.map(t => ({ name: t.name, feature: "connectors", connector: t.connector }))
];

// The tools this turn may use: feature tools, then connected connectors' tools.
export function activeTools(ctx) {
  const out = FEATURES.filter(f => f !== connectors && featureOn(f, ctx)).flatMap(f => f.tools);
  return [...out, ...connectors.tools.filter(t => isOn(ctx, t.connector))];
}

// Every feature's rules, even when its tools are off (the web rule says what to do then).
export const guidanceRules = () => FEATURES.flatMap(f => [].concat(f.guidance || []));
