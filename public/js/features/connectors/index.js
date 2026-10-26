/*
 * Connectors page: connect / disconnect, consent, per-connector permissions.
 * ---------------------------------------------------------------------------
 * Each connector is its own file (mail.js, calendar.js, contacts.js) calling
 * defineConnector(). To add one, create a file next to these and import it
 * below; the page, prompt, tool list and state pick it up automatically.
 * Import order = display order.
 */
import "./mail.js";
import "./calendar.js";
import "./contacts.js";

import { $, esc } from "../../core/dom.js";
import { state, isOn } from "../../core/state.js";
import { defineFeature, onClick, renderMine, CONNECTORS } from "../../core/registry.js";
import { save } from "../../core/storage.js";
import { audit } from "../../core/activity.js";
import { renderChat } from "../chat/chat.js";

const ui = { consent: null, manage: {} };
const toolList = c => c.tools.map(t => [t.name, t.writes ? "w" : "r"]);

function renderConnectors() {
  $("connList").innerHTML = Object.entries(CONNECTORS).map(([k, c]) => {
    const st = state.connectors[k], on = st.on;
    const tools = toolList(c).map(([n, rw]) => `<code class="${rw === "w" ? "w" : ""}" title="${rw === "w" ? "Changes something" : "Only reads"}">${n}</code>`).join("");
    let body;
    if (ui.consent === k) {
      body = `<div class="consent" role="group" aria-label="Allow access"><strong>Mini Muse wants access to ${c.name}</strong>
        <span>It will be able to:</span><ul>${c.scopes.map(s => `<li>${esc(s)}</li>`).join("")}</ul>
        <div class="row" style="display:flex;gap:8px"><button class="btn primary small" data-allow="${k}">Allow</button><button class="btn small" data-cancel-connect>Cancel</button></div></div>`;
    } else if (on) {
      const perm = c.readOnly ? `<span class="sub">Read-only: Muse can't change anything here.</span>`
        : `<div class="row"><span>When Muse wants to change something:</span>
           <span class="seg" role="group" aria-label="${c.name} permission"><button class="small" data-perm="${k}:ask" aria-pressed="${st.writes === "ask" || c.lockAsk}">Ask me first</button><button data-perm="${k}:auto" aria-pressed="${st.writes === "auto" && !c.lockAsk}" ${c.lockAsk ? "disabled title='Sending email always needs your approval'" : ""}>Allow</button></span></div>
           ${c.lockAsk ? `<span class="sub">Sending email always needs your approval.</span>` : ""}`;
      body = `<div class="perm">${perm}</div>
        <div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn small" data-manage="${k}" aria-expanded="${!!ui.manage[k]}">${ui.manage[k] ? "Hide data" : "See data"}</button><button class="btn small" data-disconnect="${k}">Disconnect</button></div>
        ${ui.manage[k] ? `<div class="manage">${c.manageHtml()}</div>` : ""}`;
    } else {
      body = `<div><button class="btn primary small" data-connect="${k}">Connect</button></div>`;
    }
    return `<article class="conn${on ? " on" : ""}"><div class="top"><div class="logo" aria-hidden="true">${c.glyph}</div><div><h3>${c.name}</h3><div class="like">${c.like}</div></div><span class="pill">${on ? "Connected" : "Not connected"}</span></div>
      <p>${esc(c.desc)}</p><div><div class="sub" style="margin-bottom:5px">Adds these tools</div><div class="toolchips">${tools}</div></div>${body}</article>`;
  }).join("");
}

onClick("connect", k => { ui.consent = k; renderConnectors(); });
onClick("cancelConnect", () => { ui.consent = null; renderConnectors(); });
onClick("allow", k => {
  state.connectors[k].on = true; ui.consent = null; ui.manage[k] = true;
  if (!state.seeded[k] && CONNECTORS[k].seed) { CONNECTORS[k].seed(); }
  state.seeded[k] = true;
  audit("connect", CONNECTORS[k].name, "Connected · tools added: " + toolList(CONNECTORS[k]).map(x => x[0]).join(", "), "you"); renderMine(); renderChat(); save();
});
onClick("disconnect", k => { state.connectors[k].on = false; ui.manage[k] = false; audit("disconnect", CONNECTORS[k].name, "Disconnected · tools removed", "you"); renderMine(); renderChat(); save(); });
onClick("perm", v => { const [k, w] = v.split(":"); if (CONNECTORS[k].lockAsk && w === "auto") return; state.connectors[k].writes = w; audit("permission", CONNECTORS[k].name, w === "ask" ? "Ask me first" : "Allow without asking", "you"); renderMine(); save(); });
onClick("manage", k => { ui.manage[k] = !ui.manage[k]; renderConnectors(); });

defineFeature({
  id: "connectors",
  nav: { el: "navConns", badge: () => { const on = Object.keys(CONNECTORS).filter(isOn).length; return on ? `${on} on` : ""; } },
  render: renderConnectors,
  guidance: [
    "Connected services: look things up with their tools instead of guessing (search mail, list the calendar, look up contacts). Before emailing someone, look up their address with contacts_lookup if Contacts is connected.",
    "If a task needs a service that is not connected, say which connector it needs and that the user can connect it on the Connectors page. Still do the parts you can."
  ]
});
