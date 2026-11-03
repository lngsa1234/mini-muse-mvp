/*
 * Observability viewer: recent traces → span waterfall.
 * ---------------------------------------------------------------------------
 * Reads back what the tracer (core/trace.js) and the backend wrote to Neon via
 * /api/trace. The left column lists recent agent turns and one-shot
 * generations; selecting one draws a timing waterfall of its spans with the
 * full LLM prompt/response, token usage, and each tool call's raw input/output.
 * This is the view that would have exposed the "résumé — done" hallucination:
 * the claim appears in the model output while no tool.* span ran.
 */
import { $, esc } from "../../core/dom.js";
import { defineFeature, onClick } from "../../core/registry.js";
import { listTraces, getTrace } from "../../core/api.js";

let selected = null;      // currently open trace_id
let cache = null;         // last { trace, spans, logs } loaded

/* ---------- formatting helpers ---------- */
const ms = n => (n == null ? "—" : n < 1 ? "<1ms" : n < 1000 ? Math.round(n) + "ms" : (n / 1000).toFixed(2) + "s");
const when = t => (t ? new Date(t).toLocaleTimeString() : "");
const kindClass = k => "k-" + String(k || "internal").replace(/[^a-z]/gi, "");
const statusDot = s => `<span class="dot ${s === "error" ? "err" : "ok"}" title="${esc(s || "ok")}"></span>`;

// Attributes worth surfacing inline on a span row, in a readable order.
const BIG_ATTRS = ["gen_ai.prompt", "gen_ai.response.content", "tool.input", "tool.output", "db.statement"];

function attrValue(v) {
  if (v == null) return "";
  if (typeof v === "object") {
    // The tracer stores redacted content as { redacted:true, length } — show that.
    if (v.redacted) return `(redacted, ${v.length} chars)`;
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

/* ---------- left column: recent traces ---------- */
function traceRow(t) {
  const on = t.traceId === selected ? " on" : "";
  const kind = t.rootKind || "trace";
  return `<button class="obs-row${on}" data-obs-trace="${esc(t.traceId)}">
    <div class="r1">${statusDot(t.status)}<span class="nm">${esc(t.name || kind)}</span><span class="dur">${ms(t.durationMs)}</span></div>
    <div class="r2"><span class="rk">${esc(kind)}</span><span class="tm">${esc(when(t.startedAt))}</span></div>
  </button>`;
}

async function loadList() {
  $("obsNote").textContent = "Loading…";
  try {
    const traces = await listTraces(50);
    $("obsList").innerHTML = traces.length
      ? traces.map(traceRow).join("")
      : `<p class="empty">No traces yet. Send a chat message, then refresh.</p>`;
    $("obsNote").textContent = traces.length ? traces.length + " recent traces" : "";
    if (selected && !traces.some(t => t.traceId === selected)) { selected = null; cache = null; renderDetail(); }
  } catch (e) {
    $("obsList").innerHTML = "";
    $("obsNote").textContent = e?.message === "Request failed (404)" ? "Tracing endpoint not found." : "Couldn't load traces. Is the database configured?";
  }
}

/* ---------- right column: span waterfall ---------- */
// Lay spans out as a waterfall relative to the root's start/duration.
function waterfall(spans, root) {
  const t0 = root.startedAt;
  const total = Math.max(1, root.durationMs || (root.endedAt - root.startedAt) || 1);
  // Depth from parent chain so children indent under their parent.
  const byId = new Map(spans.map(s => [s.spanId, s]));
  const depth = s => { let d = 0, cur = s; while (cur && cur.parentSpanId && byId.get(cur.parentSpanId)) { d++; cur = byId.get(cur.parentSpanId); if (d > 20) break; } return d; };
  const ordered = [...spans].sort((a, b) => a.startedAt - b.startedAt);
  return ordered.map(s => {
    const left = Math.max(0, Math.min(100, ((s.startedAt - t0) / total) * 100));
    const width = Math.max(0.5, Math.min(100 - left, ((s.durationMs || 0) / total) * 100));
    return `<div class="span-row" style="padding-left:${depth(s) * 16}px">
      <div class="span-head">${statusDot(s.status)}<span class="span-name ${kindClass(s.kind)}">${esc(s.name)}</span><span class="span-dur">${ms(s.durationMs)}</span></div>
      <div class="span-bar"><span class="bar ${kindClass(s.kind)}" style="left:${left}%;width:${width}%"></span></div>
      ${spanDetail(s)}
    </div>`;
  }).join("");
}

function spanDetail(s) {
  const attrs = s.attributes || {};
  const big = BIG_ATTRS.filter(k => attrs[k] != null).map(k =>
    `<div class="attr-big"><div class="ak">${esc(k)}</div><pre>${esc(attrValue(attrs[k]))}</pre></div>`).join("");
  const small = Object.entries(attrs).filter(([k]) => !BIG_ATTRS.includes(k))
    .map(([k, v]) => `<span class="chip"><b>${esc(k)}</b> ${esc(attrValue(v))}</span>`).join("");
  const events = (s.events || []).map(e => `<span class="chip ev">${esc(e.name)}${e.attributes && e.attributes.names ? " · " + esc(String(e.attributes.names)) : ""}</span>`).join("");
  const err = s.status === "error" && s.status_message ? `<div class="attr-big err"><div class="ak">error</div><pre>${esc(s.status_message)}</pre></div>` : "";
  if (!big && !small && !events && !err) return "";
  return `<div class="span-attrs">${err}${big}${small ? `<div class="chips">${small}</div>` : ""}${events ? `<div class="chips">${events}</div>` : ""}</div>`;
}

function renderDetail() {
  const el = $("obsDetail");
  if (!el) return;
  if (!selected) { el.innerHTML = `<p class="empty">Select a trace to see its spans.</p>`; return; }
  if (!cache) { el.innerHTML = `<p class="empty">Loading trace…</p>`; return; }
  const { trace, spans } = cache;
  if (!trace) { el.innerHTML = `<p class="empty">Trace not found.</p>`; return; }
  const root = spans.find(s => !s.parentSpanId) || spans[0] || trace;
  const hasTools = spans.some(s => String(s.name).startsWith("tool."));
  const header = `<div class="obs-dh">
    <div><h3>${esc(trace.name)}</h3><span class="rk">${esc(trace.rootKind || "")}</span> · ${esc(when(trace.startedAt))} · ${ms(trace.durationMs)}</div>
    <div class="obs-flags">${statusDot(trace.status)} ${spans.length} spans · ${hasTools ? "ran tools" : "no tool calls"}</div>
  </div>`;
  el.innerHTML = header + `<div class="waterfall">${waterfall(spans, root)}</div>`;
}

async function openTrace(id) {
  selected = id; cache = null;
  // reflect selection in the list without a full reload
  document.querySelectorAll("#obsList .obs-row").forEach(b => b.classList.toggle("on", b.dataset.obsTrace === id));
  renderDetail();
  try { cache = await getTrace(id); }
  catch (e) { cache = { trace: null, spans: [] }; }
  renderDetail();
}

onClick("obsTrace", openTrace);
onClick("obsRefresh", () => loadList());

defineFeature({
  id: "observability",
  render() {},                 // list is populated on show / refresh, not on every state change
  onShow() { loadList(); if (selected) renderDetail(); }
});
