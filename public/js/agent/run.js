// Run one chat turn: push the messages, call the agent loop, render progress.
import { $, rid } from "../core/dom.js";
import { state, rt } from "../core/state.js";
import { renderMine } from "../core/registry.js";
import { save } from "../core/storage.js";
import { setPhase } from "../core/activity.js";
import { go } from "../core/nav.js";
import { renderChat, updateMsg } from "../features/chat/chat.js";
import { expireApprovals } from "../workflow/approvals.js";
import { buildInput } from "./prompt.js";
import { makeTools } from "./tools.js";
import { ERR } from "./errors.js";
import { startTrace, setActive, flush } from "../core/trace.js";

const DOCUMENT_STEP = /\b(?:résumé|resume|cv|cover letter)\b/i;
const COMPLETION_CLAIM = /\b(?:updated|finished|completed|done|marked|mark)\b/i;

function documentCompletionStep(text) {
  if (!DOCUMENT_STEP.test(String(text || "")) || !COMPLETION_CLAIM.test(String(text || ""))) return null;
  return state.plans.flatMap(goal => goal.steps.map((step, index) => ({ goal, step, index })))
    .find(({ step }) => step.status !== "done" && DOCUMENT_STEP.test(step.text)) || null;
}

async function verifyDocumentCompletion(check, tools, signal) {
  const search = tools.find(tool => tool.name === "docs_search");
  if (!check || !search) return null;
  const result = await search.execute({ query: "résumé resume cover letter CV" }, { signal });
  return { ...check, matches: Array.isArray(result) ? result : [] };
}

function documentCompletionReply(verification) {
  const step = verification.step.text;
  if (verification.matches.length) {
    const titles = verification.matches.map(match => match.title).join(", ");
    return `I checked your Library and found ${titles}. I did not mark “${step}” done: you said you completed the update yourself, so please click that goal step to record it.`;
  }
  return `I checked your Library but could not find a résumé or cover letter to verify “${step}.” Please add the document to the Library, or click the goal step yourself if you completed it outside Mini Muse.`;
}

export async function run(userMsg) {
  if (rt.busy || !rt.sample) return;
  rt.busy = true; setBusy(true); go("chat");
  state.chat.push(userMsg);
  const msg = { id: rid(), role: "assistant", text: "", acts: [], live: true, status: "Thinking…", t: Date.now() };
  state.chat.push(msg);
  renderChat(); setPhase("thinking");
  rt.ctl = new AbortController();
  // Root span for the whole turn: every LLM call, tool call and backend span
  // this turn produces attaches under it (see core/trace.js).
  const turnSpan = startTrace("agent.turn", {
    rootKind: "agent_turn",
    attributes: { "app.mode": rt.mode, "app.user_message_length": (userMsg.text || "").length }
  });
  const prevActive = setActive(turnSpan);
  try {
    const tools = makeTools(msg, turnSpan);
    const verification = await verifyDocumentCompletion(documentCompletionStep(userMsg.text), tools, rt.ctl.signal);
    const input = buildInput();
    if (verification) input.push({ role: "user", content: `Mandatory document verification ran before this reply. Library matches: ${verification.matches.length ? verification.matches.map(match => match.title).join(", ") : "none"}. Do not claim the user’s résumé or cover letter was verified, changed, or marked done beyond this result.` });
    const { text, truncated } = await rt.sample(input, {
      modelTier: rt.mode, signal: rt.ctl.signal, tools, trace: turnSpan,
      onText: ({ text }) => { setPhase("answering"); msg.text = text; updateMsg(msg); }
    });
    const finalText = verification ? documentCompletionReply(verification) : text;
    msg.text = finalText;
    if (truncated) msg.error = "The reply was cut short. Ask for less at once.";
    turnSpan.set({ "app.final_text_length": (finalText || "").length, "app.truncated": !!truncated }).end("ok");
  } catch (e) {
    if (e?.text && e.code !== "refused") msg.text = e.text;
    if (e?.code === "refused") msg.text = "";
    if (e?.code !== "cancelled") msg.error = ERR[e?.code] || "Muse couldn't reach the assistant. Send your message again.";
    if (["not_granted", "sampling_disabled", "tools_unavailable"].includes(e?.code)) disableChat(ERR[e.code]);
    turnSpan.set({ "error.code": e?.code || "unknown" }).fail(e);
  } finally {
    setActive(prevActive);
    flush();
  }
  expireApprovals();
  msg.live = false; if (!msg.text && !msg.error && msg.acts.length) msg.text = "Done.";
  if (!msg.text && !msg.acts.length && !msg.error) state.chat.pop();
  updateMsg(msg); renderMine(); save();
  rt.busy = false; setBusy(false); setPhase(null);
}

// Send text as the user. Features use this for "Do it", "Make it a goal", etc.
export const say = text => run({ id: rid(), role: "user", text, t: Date.now() });

export function setBusy(b) {
  $("send").hidden = b; $("stop").hidden = !b; $("checkinBtn").disabled = b; $("box").disabled = b;
  if (!b) $("box").focus();
}
export function disableChat(text) {
  rt.sample = null; $("send").disabled = true; $("checkinBtn").disabled = true; $("box").disabled = true;
  $("note").textContent = text;
}
