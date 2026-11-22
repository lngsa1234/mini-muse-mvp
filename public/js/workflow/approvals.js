/*
 * Human-in-the-loop approvals. The server agent pauses a tool and saves an
 * approval card in the chat message (server/agent/runtime.js). The buttons
 * answer through /api/agent/answer, so a card can be approved from any device
 * showing the chat. The turn resumes on the server with the answer.
 */
import { onClick } from "../core/registry.js";
import { state } from "../core/state.js";
import { answerAgent } from "../core/api.js";
import { updateMsg } from "../features/chat/chat.js";
import { run } from "../agent/run.js";

function answer(id, ok) {
  const msg = state.chat.find(m => (m.acts || []).some(a => a.id === id));
  const a = msg?.acts.find(x => x.id === id);
  if (!a || a.approval !== "pending") return;
  a.approval = ok ? "approved" : "declined";   // optimistic; the server sends the real state
  a.label = (ok ? "Approved: " : "Declined: ") + (a.card?.summary || "");
  updateMsg(msg);
  answerAgent(id, { answer: ok }).then(out => {
    // The card outlasted its turn: this answer starts a follow-up turn that carries on.
    if (out?.resume) run({ id: "r" + Date.now(), role: "resume", resume: out.resume, text: "", t: Date.now() });
  }).catch(() => {
    a.approval = "expired"; a.label = "No answer: " + (a.card?.summary || ""); updateMsg(msg);
  });
}

onClick("approve", id => answer(id, true));
onClick("decline", id => answer(id, false));
