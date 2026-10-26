// Memory: lasting facts about the user (Settings → Memory) and the remember / forget tools.
import { $, esc, rid } from "../../core/dom.js";
import { state } from "../../core/state.js";
import { defineFeature, onClick, renderMine } from "../../core/registry.js";
import { save } from "../../core/storage.js";
import { audit } from "../../core/activity.js";
import { S } from "../../core/schema.js";

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
  render: renderMemory,
  guidance: "Memory: when the user shares a lasting fact or preference, call remember. When they ask you to forget something, call forget.",
  tools: [
    { name: "remember", description: "Save one lasting fact or preference about the user. Returns a confirmation.",
      inputSchema: { type: "object", properties: { fact: S }, required: ["fact"] },
      run: ({ fact }, _ctx, h) => {
        fact = String(fact || "").trim(); if (!fact) throw new Error("fact is empty");
        if (state.memory.some(f => f.fact.toLowerCase() === fact.toLowerCase())) return "Already remembered.";
        state.memory.push({ id: rid(), fact, t: Date.now() }); h.act(fact); return "Saved to memory.";
      } },
    { name: "forget", description: "Delete every memory containing the keyword. Returns what was removed.",
      inputSchema: { type: "object", properties: { keyword: S }, required: ["keyword"] },
      run: ({ keyword }, _ctx, h) => {
        const k = String(keyword || "").toLowerCase().trim(); if (!k) throw new Error("keyword is empty");
        const gone = state.memory.filter(f => f.fact.toLowerCase().includes(k));
        state.memory = state.memory.filter(f => !gone.includes(f));
        if (!gone.length) return "No memory matched '" + keyword + "'.";
        h.act("Forgot: " + gone.map(g => g.fact).join("; ")); return { removed: gone.map(g => g.fact) };
      } }
  ]
});
