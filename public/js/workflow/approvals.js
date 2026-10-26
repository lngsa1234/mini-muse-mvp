/*
 * Human-in-the-loop approvals: a tool pauses, an approval card appears in
 * chat, and the tool resumes with the user's answer.
 * Resolves true (approved), false (declined) or null (no answer / cancelled).
 */
import { onClick } from "../core/registry.js";
import { audit, setPhase } from "../core/activity.js";
import { go } from "../core/nav.js";
import { updateMsg } from "../features/chat/chat.js";

const approvals = new Map(); // act id -> resolve

// card: { heading, rows: [[label, value]], body?, yes?, summary }
export async function requestApproval(msg, act, tool, card, context) {
  setPhase("waiting"); msg.status = "Waiting for your approval…"; go("chat");
  const a = act(tool, "", { approval: "pending", card });
  const ok = await new Promise(res => { approvals.set(a.id, res); context?.signal?.addEventListener("abort", () => res(null), { once: true }); });
  approvals.delete(a.id);
  a.approval = ok === true ? "approved" : ok === null ? "expired" : "declined";
  a.label = (ok === true ? "Approved: " : ok === null ? "No answer: " : "Declined: ") + card.summary;
  audit("approval", { [tool]: card.summary }, a.approval, "you");
  setPhase("tool"); updateMsg(msg);
  return ok;
}

// End of a turn: anything still waiting gets "no answer".
export function expireApprovals() { for (const [, res] of approvals) res(null); }

onClick("approve", id => approvals.get(id)?.(true));
onClick("decline", id => approvals.get(id)?.(false));
