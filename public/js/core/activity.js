// Activity log: every tool call, approval and user change. Rendered by features/hood.
// The log lives on the server (append-only, ADR-0008). The server agent records
// its own tool calls; this module records what the user does in the page.
import { state } from "./state.js";
import { short } from "./format.js";
import { emit } from "./registry.js";
import { appendAudit } from "./api.js";

let pending = [], timer = null;
function post(entry) {
  pending.push(entry); clearTimeout(timer);
  timer = setTimeout(() => { const batch = pending.reverse(); pending = []; appendAudit(batch).catch(() => {}); }, 400);
}

// by: "muse" for agent tool calls, "you" for things the user did.
export function audit(tool, input, result, by = "muse") {
  const entry = { t: Date.now(), tool, input, result: short(result, 300), by };
  state.audit.unshift(entry);
  post(entry);
  emit("audit");
}

// Show an entry the server already saved (the agent's tool calls).
export function showAudit(entry) {
  state.audit.unshift(entry);
  state.audit.length = Math.min(state.audit.length, 150);
  emit("audit");
}

// Agent-loop phase for the "How Muse works" panel: thinking | tool | waiting | answering | null
export const setPhase = p => emit("phase", p);
