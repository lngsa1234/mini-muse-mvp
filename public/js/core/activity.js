// Activity log: every tool call, approval and user change. Rendered by features/hood.
import { state } from "./state.js";
import { short } from "./format.js";
import { emit } from "./registry.js";

// by: "muse" for agent tool calls, "you" for things the user did.
export function audit(tool, input, result, by = "muse") {
  state.audit.unshift({ t: Date.now(), tool, input, result: short(result, 300), by });
  emit("audit");
}

// Agent-loop phase for the "How Muse works" panel: thinking | tool | waiting | answering | null
export const setPhase = p => emit("phase", p);
