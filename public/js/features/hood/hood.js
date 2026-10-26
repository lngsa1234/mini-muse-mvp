// "How Muse works" panel: agent-loop phases, the live tool list, recent activity,
// plus Settings → Activity. Listens to events from core/activity.js.
import { $, esc } from "../../core/dom.js";
import { clock, short } from "../../core/format.js";
import { state, isOn } from "../../core/state.js";
import { defineFeature, on, CONNECTORS, isConnTool } from "../../core/registry.js";
import { coreToolNames } from "../../agent/tools.js";

function setPhase(p) { document.querySelectorAll("#loop li").forEach(li => li.classList.toggle("on", li.dataset.p === p)); }

const auditItem = x => `<li><div class="top"><span class="${x.by === "you" ? "by" : "tool" + (isConnTool(x.tool) ? " c" : "")}">${x.by === "you" ? "you · " : isConnTool(x.tool) ? "connector · " : ""}${esc(x.tool)}</span><span class="sub">${clock(x.t)}</span></div>
     <div class="io">in: ${esc(short(x.input))}<br>out: ${esc(short(x.result))}</div></li>`;
function renderHood() {
  const a = state.audit, empty = `<li><p class="empty" style="font-family:var(--f-body)">Nothing yet. Every tool Muse uses shows up here, with what it sent and what came back.</p></li>`;
  $("auCount").textContent = a.length ? a.length + " entries" : "";
  $("audit").innerHTML = a.length ? a.slice(0, 150).map(auditItem).join("") : empty;
  const mine = a.filter(x => x.by !== "you").slice(0, 6);
  $("hoodRecent").innerHTML = mine.length ? mine.map(auditItem).join("") : empty;
}
function renderToolsNow() {
  const list = [...coreToolNames().map(n => [n, ""]), ...Object.keys(CONNECTORS).filter(isOn).flatMap(k => CONNECTORS[k].tools.map(t => [t.name, "c"]))];
  $("toolCount").textContent = list.length;
  $("toolNow").innerHTML = list.map(([n, c]) => `<code style="${c ? "color:var(--link)" : ""}">${n}</code>`).join("");
}

on("audit", renderHood);
on("phase", setPhase);

defineFeature({ id: "hood", render: renderToolsNow, renderAll: renderHood });
