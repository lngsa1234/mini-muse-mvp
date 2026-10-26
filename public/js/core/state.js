/*
 * App state: one plain object, saved as JSON.
 * ---------------------------------------------------------------------------
 * `state` is a single shared object. Mutate it in place (state.ideas.push(...))
 * and call save() afterwards. To swap it wholesale (load, reset) use
 * replaceState() so every module keeps the same reference.
 *
 * The shape lives here so everyone can see it in one place. If your feature
 * needs a new field, add it to blank() with a comment and handle old saves in
 * migrate().
 */
import { CONNECTORS } from "./registry.js";

export const blank = () => ({
  memory: [],                 // features/memory   { id, fact, t }
  ideas: [],                  // features/ideas    { id, title, why, kind, basedOn, action, status, by, t, goalId?, ruleKey? }
  plans: [],                  // features/goals    { id, goal, steps: [{ text, status }], t }
  goalSuggs: [], goalRuleDone: [], // features/goals suggestions
  docs: [],                   // features/library  { id, title, text, t, example? }
  inbox: [], outbox: [],      // connectors/mail
  events: [],                 // connectors/calendar
  contacts: [],               // connectors/contacts
  chat: [],                   // features/chat     messages, see agent/run.js
  audit: [],                  // core/activity     { t, tool, input, result, by }
  seeded: {},                 // which connectors already loaded their sample data
  prefs: { mode: "quick", learn: false }, // features/settings
  connectors: Object.fromEntries(Object.keys(CONNECTORS).map(k => [k, { on: false, writes: "ask" }]))
});

export const state = {};
export function replaceState(next) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, next);
}

// Session-only runtime flags (never saved).
export const rt = {
  mode: "quick",   // "quick" | "default": model tier sent to the server
  busy: false,     // a chat turn is running
  ctl: null,       // AbortController for the running turn
  sample: null     // the agent client, once connected (agent/client.js)
};

export const isOn = k => !!state.connectors[k]?.on;
