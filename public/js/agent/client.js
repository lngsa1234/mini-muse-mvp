/*
 * Agent client: the window.agent.use(...) API the app was written against.
 *
 *   agent.use("sample") -> { json(prompt, opts), limits() }
 *                          one-shot JSON for Ideas / Goals suggestions (agent/transport.js)
 *
 * Chat turns run on the server (server/agent/, ADR-0009); agent/run.js talks to
 * /api/agent/turn. Saved state lives on the server too (core/storage.js).
 * The API key never reaches the browser.
 */
import { completeJson } from "./transport.js";

const sample = { json: completeJson, limits: async () => ({ tools: true }) };

export const agent = {
  use: async name => (name === "sample" ? sample : null)
};

if (!window.agent) window.agent = agent;
