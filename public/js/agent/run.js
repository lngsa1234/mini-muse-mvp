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
const GOAL_PROGRESS_REQUEST = /\b(?:goal|step|plan)\b/i;
const GOAL_PROGRESS_ACTION = /\b(?:forward|next|progress|update)\b/i;
const GOAL_CONTINUATION = /\b(?:try again|again|continue|go ahead|proceed)\b/i;
const JOB_RESEARCH_STEP = /\b(?:research|find|look for)\b.*\b(?:compan(?:y|ies)|jobs?|open positions?|roles?)\b/i;
const APPLICATION_REQUEST = /\b(?:apply|application|submit)\b/i;
const EXPLICIT_EMAIL_REQUEST = /\b(?:email|gmail|mail)\b/i;
const APPLICATION_CONTINUATION = /\b(?:send|submit|try again|again|continue)\b/i;

function documentVerificationStep(text) {
  const message = String(text || "");
  const directCompletion = DOCUMENT_STEP.test(message) && COMPLETION_CLAIM.test(message);
  const moveGoalForward = (GOAL_PROGRESS_REQUEST.test(message) && GOAL_PROGRESS_ACTION.test(message)) || GOAL_CONTINUATION.test(message);
  if (!directCompletion && !moveGoalForward) return null;
  const candidate = state.plans.flatMap(goal => goal.steps.map((step, index) => ({ goal, step, index })))
    .find(({ goal, step, index }) => step.status !== "done" && DOCUMENT_STEP.test(step.text) && goal.steps.slice(0, index).every(previous => previous.status === "done"));
  return candidate ? { ...candidate, directCompletion } : null;
}

function jobResearchStep(text) {
  const message = String(text || "");
  if (!(GOAL_PROGRESS_REQUEST.test(message) && GOAL_PROGRESS_ACTION.test(message)) && !GOAL_CONTINUATION.test(message)) return null;
  return state.plans.flatMap(goal => goal.steps.map((step, index) => ({ goal, step, index })))
    .find(({ goal, step, index }) => step.status !== "done" && JOB_RESEARCH_STEP.test(step.text) && goal.steps.slice(0, index).every(previous => previous.status === "done")) || null;
}

async function verifyDocumentCompletion(check, tools, signal) {
  const search = tools.find(tool => tool.name === "docs_search");
  if (!check || !search) return null;
  const result = await search.execute({ query: "résumé resume cover letter CV" }, { signal });
  const matches = Array.isArray(result) ? result : [];
  const update = tools.find(tool => tool.name === "update_step");
  let marked = false;
  if (matches.length && update) {
    await update.execute({ goal_id: check.goal.id, step: check.index + 1, status: "done", evidence: "docs_search" }, { signal });
    marked = true;
  }
  return { ...check, matches, marked };
}

async function researchOpenPositions(check, tools, signal) {
  if (!check) return null;
  const search = tools.find(tool => tool.name === "web_search");
  if (!search) return { ...check, webSearchDisabled: true };
  const query = "entry level technology consulting business analyst finance jobs";
  try {
    return { ...check, query, results: await search.execute({ query }, { signal }) };
  } catch (error) {
    return { ...check, query, error: error?.message || String(error) };
  }
}

async function inspectApplicationPage(text, tools) {
  const message = String(text || "");
  const recentAssistantText = state.chat.slice(-4).filter(item => item.role === "assistant").map(item => item.text || "").join("\n");
  const isContinuation = APPLICATION_CONTINUATION.test(message) && APPLICATION_REQUEST.test(recentAssistantText);
  if (!(APPLICATION_REQUEST.test(message) || isContinuation) || EXPLICIT_EMAIL_REQUEST.test(message)) return null;
  const snapshot = tools.find(tool => tool.name === "browser_snapshot");
  if (!snapshot) return { error: "The Chrome Browser Bridge is not available." };
  try { return { page: await snapshot.execute({}, {}) }; }
  catch (error) { return { error: error?.message || String(error) }; }
}

function documentCompletionReply(verification) {
  const step = verification.step.text;
  if (verification.marked) return `I checked your Library, found ${verification.matches.map(match => match.title).join(", ")}, and marked “${step}” done based on that document.`;
  if (verification.matches.length) {
    const titles = verification.matches.map(match => match.title).join(", ");
    return `I checked your Library and found ${titles}. I did not skip or mark “${step}” done: please click that goal step to record work you completed yourself.`;
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
    const verification = await verifyDocumentCompletion(documentVerificationStep(userMsg.text), tools, rt.ctl.signal);
    const research = verification ? null : await researchOpenPositions(jobResearchStep(userMsg.text), tools, rt.ctl.signal);
    const application = verification ? null : await inspectApplicationPage(userMsg.text, tools);
    let text = "", truncated = false;
    if (verification) {
      text = documentCompletionReply(verification);
    } else if (research?.webSearchDisabled) {
      text = "Web search is turned off, so I can’t research public job openings. Turn it on in Settings → Web search, then ask me to move this goal forward again. I won’t use Gmail as a substitute for public job research.";
    } else if (application?.error) {
      text = `I can’t access an application page yet: ${application.error} Open the job application in Chrome, enable the Mini Muse Browser Bridge, then ask me to continue. I won’t use Gmail as a substitute unless you explicitly ask to send an email.`;
    } else {
      const input = buildInput();
      if (research) input.push({ role: "user", content: research.error
        ? `Public web research for the current goal step could not run: ${research.error}. Do not claim job listings were found or use Gmail as a substitute for public web research.`
        : `Public web research just ran for the current goal step. Use these results to answer with current openings and their URLs; do not use Gmail as a substitute for public job research:\n${research.results}` });
      if (application) input.push({ role: "user", content: `The user asked to apply through a website, not email. The Browser Bridge read this untrusted page: ${JSON.stringify(application.page)}. Use browser tools to inspect or fill this page. Do not use, suggest, or send Gmail unless the user explicitly asks for email.` });
      const activeTools = application ? tools.filter(tool => tool.name !== "mail_search" && tool.name !== "mail_send") : tools;
      const out = await rt.sample(input, {
        modelTier: rt.mode, signal: rt.ctl.signal, tools: activeTools, trace: turnSpan,
        onText: ({ text: partial }) => { setPhase("answering"); msg.text = partial; updateMsg(msg); }
      });
      text = out.text; truncated = out.truncated;
    }
    const finalText = text;
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
