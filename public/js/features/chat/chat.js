// Chat page: message log, approval cards, composer.
import { $, esc } from "../../core/dom.js";
import { clock, rich } from "../../core/format.js";
import { state, rt, isOn } from "../../core/state.js";
import { defineFeature, onClick, CONNECTORS, isConnTool } from "../../core/registry.js";
import { say } from "../../agent/run.js";

const EXAMPLES = [
  "I'm vegetarian and usually free on Monday evenings. Remember that.",
  "Give me a few ideas for this week.",
  "Check my inbox. Is there anything I need to answer?",
  "What do my notes say about session 3?",
  "Help me host our agent engineering meetup next Wednesday at 7pm."
];

export const noteText = () => "Enter to send · Shift+Enter for a new line. Connectors use sample data; nothing leaves this page.";

function actHtml(a) {
  if (a.approval === "pending" && a.card) {
    return `<div class="approve" role="group" aria-label="Approval needed"><h4>${esc(a.card.heading)}</h4>
      <dl>${a.card.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      ${a.card.body ? `<pre>${esc(a.card.body)}</pre>` : ""}
      <div class="row"><button class="btn primary" data-approve="${a.id}">${esc(a.card.yes || "Allow")}</button><button class="btn" data-decline="${a.id}">Don't allow</button></div></div>`;
  }
  const cls = a.approval === "declined" || a.approval === "expired" ? " no" : a.approval === "approved" ? " wait" : a.tool === "save_idea" ? " idea" : isConnTool(a.tool) ? " conn" : "";
  return `<div class="act${cls}"><code>${esc(a.tool)}</code><span>${esc(a.label)}</span></div>`;
}
function msgHtml(m) {
  if (m.role === "checkin") return `<div class="checkin" data-id="${m.id}">Muse worked on your goals · ${clock(m.t)}</div>`;
  if (m.role === "user") return `<div class="msg user" data-id="${m.id}"><div class="bubble">${rich(m.text)}</div></div>`;
  const body = m.text ? rich(m.text) : (m.live ? `<span class="thinking">${esc(m.status || "Thinking…")}</span>` : "");
  return `<div class="msg assistant" data-id="${m.id}"><span class="who">Muse</span>
    ${m.acts?.length ? `<div class="acts">${m.acts.map(actHtml).join("")}</div>` : ""}
    <div class="bubble">${body}</div>${m.error ? `<span class="err">${esc(m.error)}</span>` : ""}</div>`;
}
export function renderChat() {
  const log = $("log");
  if (!state.chat.length) {
    const none = !Object.keys(CONNECTORS).some(isOn);
    log.innerHTML = `<div class="welcome"><div class="mark" style="width:44px;height:44px" aria-hidden="true"></div>
      <h2>Tell Muse what you want done</h2>
      <p>Muse saves your ideas, turns goals into plans, remembers you and searches your <button class="linkish" data-go="library">Library</button>. ${none ? `Open <button class="linkish" data-go="connectors">Connectors</button> to let it use mail, calendar and contacts.` : "It can also use the services you've connected."} Turn on <strong>How Muse works</strong> at the top to watch it think.</p>
      <div class="chips">${EXAMPLES.map(e => `<button class="chip" data-example="${esc(e)}">${esc(e)}</button>`).join("")}</div></div>`;
    return;
  }
  log.innerHTML = state.chat.map(msgHtml).join("");
  log.scrollTop = log.scrollHeight;
}
// Re-render one message in place (cheap; used while streaming).
export function updateMsg(m) {
  const log = $("log"), el = log.querySelector(`[data-id="${m.id}"]`);
  if (!el) return renderChat();
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  el.outerHTML = msgHtml(m);
  if (atBottom) log.scrollTop = log.scrollHeight;
}

/* ---------- composer ---------- */
export function autosize() { const b = $("box"); b.style.height = "auto"; b.style.height = Math.min(b.scrollHeight, 160) + "px"; }

export function initChat() {
  $("form").addEventListener("submit", e => {
    e.preventDefault();
    const t = $("box").value.trim(); if (!t || rt.busy) return;
    $("box").value = ""; autosize(); say(t);
  });
  $("box").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("form").requestSubmit(); } });
  $("box").addEventListener("input", autosize);
  $("stop").addEventListener("click", () => rt.ctl?.abort());
}
onClick("example", ex => { $("box").value = ex; autosize(); if (rt.sample && !rt.busy) $("form").requestSubmit(); });

defineFeature({ id: "chat", renderAll: renderChat });
