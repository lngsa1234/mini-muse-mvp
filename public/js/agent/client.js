/*
 * Agent client: the window.agent.use(...) API the app was written against.
 * It replaces the original artifact-sandbox API so the same app runs as a
 * plain web page served by our backend.
 *
 *   agent.use("sample") -> sample(turns, opts) runs the agent loop (agent/loop.js)
 *                          sample.json(prompt, opts) one-shot JSON (agent/transport.js)
 *   agent.use("db")     -> null  (app falls back to localStorage)
 *   agent.use("user")   -> null  (app falls back to localStorage)
 *
 * The API key never reaches the browser: the backend injects it.
 */
import { runLoop } from "./loop.js";
import { completeJson } from "./transport.js";

const sample = (turns, opts) => runLoop(turns, opts);
sample.json = completeJson;
sample.limits = async () => ({ tools: true });

export const agent = {
  use: async name => {
    if (name === "sample") return sample;
    return null; // "db" and "user": app falls back to localStorage
  }
};

// Keep the global the app (and core/storage.js) looks for.
if (!window.agent) window.agent = agent;
