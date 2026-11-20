// Run one chat turn on the server (ADR-0009) and show its progress.
// ---------------------------------------------------------------------------
// The agent loop, prompt and tools run in server/agent/. This file POSTs the
// message to /api/agent/turn and renders the events it streams back. Two
// events need this page:
//   client_tool  run a Chrome Browser Bridge tool here, post the result back
//   approval     a card in the message; the buttons answer through
//                /api/agent/answer (workflow/approvals.js), from any device
// If another device is running a turn, followLive() polls until it finishes.
import { $, rid, TZ } from "../core/dom.js";
import { state, rt } from "../core/state.js";
import { renderMine } from "../core/registry.js";
import { adopt, loadState } from "../core/storage.js";
import { setPhase, showAudit } from "../core/activity.js";
import { go } from "../core/nav.js";
import { renderChat, updateMsg } from "../features/chat/chat.js";
import { runBrowserTool } from "../features/browser/browser.js";
import * as api from "../core/api.js";
import { apiError } from "./transport.js";
import { ERR } from "./errors.js";
import { activeTraceparent } from "../core/trace.js";

const FATAL = ["not_granted", "sampling_disabled", "tools_unavailable"];
const LIVE_WINDOW_MS = 10 * 60_000;

function upsert(m) {
  if (m.hidden) { state.chat = state.chat.filter(x => x.id !== m.id); renderChat(); return; }
  const i = state.chat.findIndex(x => x.id === m.id);
  if (i >= 0) { state.chat[i] = m; updateMsg(m); } else { state.chat.push(m); renderChat(); }
}

// Reload what the server agent changed (docs / ideas / goals).
export async function reloadLists(keys) {
  const jobs = [];
  if (keys.includes("docs")) jobs.push(api.listDocs().then(v => { state.docs = v; }).catch(() => {}));
  if (keys.includes("ideas")) jobs.push(api.listIdeas().then(v => { state.ideas = v; }).catch(() => {}));
  if (keys.includes("plans")) jobs.push(api.listGoals().then(v => { state.plans = v; }).catch(() => {}));
  await Promise.all(jobs); renderMine();
}

// Parse a text/event-stream body into [event, data] pairs.
async function* events(body) {
  const reader = body.getReader(), dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let sep;
    while ((sep = buf.indexOf("\n\n")) >= 0) {
      const raw = buf.slice(0, sep); buf = buf.slice(sep + 2);
      let event = "message", data = "";
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      try { yield [event, JSON.parse(data)]; } catch (_) {}
    }
  }
}

function handle(event, data, turn) {
  if (event === "user") {
    const i = state.chat.findIndex(x => x.id === turn.localId);
    if (i >= 0) state.chat[i] = data; else state.chat.push(data);
    renderChat();
  } else if (event === "msg") {
    turn.msgId = rt.turnId = data.id;
    if (data.live) $("stop").hidden = false;
    upsert(data);
  } else if (event === "text") {
    const m = state.chat.find(x => x.id === data.id);
    if (m) { m.text = data.text; updateMsg(m); }
  } else if (event === "phase") setPhase(data);
  else if (event === "audit") showAudit(data);
  else if (event === "data") { adopt(data); renderMine(); }
  else if (event === "changed") reloadLists(data.keys || []);
  else if (event === "client_tool") {
    runBrowserTool(data.name, data.input)
      .then(result => api.answerAgent(data.waitId, { result }), e => api.answerAgent(data.waitId, { error: e?.message || String(e) }))
      .catch(() => {});
  } else if (event === "error") turn.error = data;
}

export async function run(userMsg) {
  if (rt.busy || !rt.sample) return;
  rt.busy = true; setBusy(true); go("chat");
  const turn = { localId: userMsg.id, msgId: null, error: null };
  state.chat.push(userMsg);   // shown right away; replaced by the server's copy
  renderChat(); setPhase("thinking");
  rt.ctl = new AbortController(); rt.turnId = null;
  try {
    const headers = { "content-type": "application/json" };
    const tp = activeTraceparent(); if (tp) headers.traceparent = tp;
    const res = await fetch("/api/agent/turn", {
      method: "POST", headers, signal: rt.ctl.signal,
      body: JSON.stringify({ text: userMsg.text, checkin: userMsg.role === "checkin", tier: rt.mode, tz: TZ })
    });
    if (!res.ok || !res.body) throw await apiError(res);
    for await (const [event, data] of events(res.body)) handle(event, data, turn);
  } catch (e) {
    if (e?.name !== "AbortError") turn.error = { code: e?.code || "network", message: e?.message };
  }
  const err = turn.error;
  if (err) {
    if (FATAL.includes(err.code)) disableChat(ERR[err.code]);
    if (!turn.msgId) {
      // The server never started the turn (busy, offline...): put the text back and say why.
      state.chat = state.chat.filter(x => x.id !== turn.localId);
      if (userMsg.text && !$("box").value) $("box").value = userMsg.text;
      state.chat.push({ id: rid(), role: "assistant", text: "", acts: [], error: err.code === "busy" ? err.message : ERR[err.code] || "Muse couldn't reach the server. Send your message again.", t: Date.now() });
      renderChat();
    }
  }
  rt.busy = false; rt.turnId = null; setBusy(false); setPhase(null);
  // The stream dropped while the server was still working: follow it by polling.
  const mine = turn.msgId && state.chat.find(x => x.id === turn.msgId);
  if (mine?.live) followLive();
}

// Stop: tell the server (works for a turn started on another device too).
export function stopTurn() {
  const live = rt.turnId || [...state.chat].reverse().find(m => m.role === "assistant" && m.live)?.id;
  if (live) api.cancelAgent(live).catch(() => {});
  else rt.ctl?.abort();
}

// Send text as the user. Features use this for "Do it", "Make it a goal", etc.
export const say = text => run({ id: rid(), role: "user", text, t: Date.now() });

/* ---------- turns running elsewhere (another device, or a dropped stream) ---------- */
const isLive = m => m.role === "assistant" && m.live && Date.now() - (m.updatedAt || m.t) < LIVE_WINDOW_MS;
let following = false;
export async function followLive() {
  if (following || rt.busy || !state.chat.some(isLive)) return;
  following = true; $("stop").hidden = false; setPhase("thinking");
  try {
    while (!rt.busy) {
      await new Promise(r => setTimeout(r, 2000));
      if (rt.busy) break;
      const s = await loadState();
      if (!s) continue;
      adopt({ memory: s.memory, contacts: s.contacts });
      state.chat = s.chat; state.audit = s.audit;
      renderChat();
      if (!state.chat.some(isLive)) { await reloadLists(["docs", "ideas", "plans"]); break; }
    }
  } finally {
    following = false;
    if (!rt.busy) { $("stop").hidden = true; setPhase(null); }
  }
}

export function setBusy(b) {
  $("send").hidden = b; $("stop").hidden = !b; $("checkinBtn").disabled = b; $("box").disabled = b;
  if (!b) $("box").focus();
}
export function disableChat(text) {
  rt.sample = null; $("send").disabled = true; $("checkinBtn").disabled = true; $("box").disabled = true;
  $("note").textContent = text;
}
