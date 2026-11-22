// Memory: lasting facts about the user (Settings → Memory). They are saved on the
// server; the remember / forget tools run in the server agent (server/agent/tools/memory.js).
import { $, esc } from "../../core/dom.js";
import { state } from "../../core/state.js";
import { defineFeature, onClick, renderMine } from "../../core/registry.js";
import { save } from "../../core/storage.js";
import { audit } from "../../core/activity.js";

function renderMemory() {
  const m = state.memory;
  $("memCount").textContent = m.length ? `${m.length} ${m.length === 1 ? "thing" : "things"}` : "";
  $("memList").innerHTML = m.length ? m.map(f =>
    `<li class="item"><span class="grow">${esc(f.fact)}</span><button class="x" data-del-mem="${f.id}" aria-label="Forget this">×</button></li>`).join("")
    : `<li><p class="empty">Muse doesn't know anything about you yet. Tell it a preference in Chat, like “I'm vegetarian”.</p></li>`;
}

onClick("delMem", id => { const f = state.memory.find(x => x.id === id); state.memory = state.memory.filter(x => x.id !== id); audit("forget", { fact: f?.fact }, "Deleted by you", "you"); renderMine(); save(); });

defineFeature({
  id: "memory",
  render: renderMemory
});
