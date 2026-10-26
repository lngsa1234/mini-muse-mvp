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

export async function run(userMsg) {
  if (rt.busy || !rt.sample) return;
  rt.busy = true; setBusy(true); go("chat");
  state.chat.push(userMsg);
  const msg = { id: rid(), role: "assistant", text: "", acts: [], live: true, status: "Thinking…", t: Date.now() };
  state.chat.push(msg);
  renderChat(); setPhase("thinking");
  rt.ctl = new AbortController();
  try {
    const { text, truncated } = await rt.sample(buildInput(), {
      modelTier: rt.mode, signal: rt.ctl.signal, tools: makeTools(msg),
      onText: ({ text }) => { setPhase("answering"); msg.text = text; updateMsg(msg); }
    });
    msg.text = text; if (truncated) msg.error = "The reply was cut short. Ask for less at once.";
  } catch (e) {
    if (e?.text && e.code !== "refused") msg.text = e.text;
    if (e?.code === "refused") msg.text = "";
    if (e?.code !== "cancelled") msg.error = ERR[e?.code] || "Muse couldn't reach the assistant. Send your message again.";
    if (["not_granted", "sampling_disabled", "tools_unavailable"].includes(e?.code)) disableChat(ERR[e.code]);
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
