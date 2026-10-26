// Library page: documents Muse can search and cite, and the docs_* tools.
import { $, esc, rid } from "../../core/dom.js";
import { state } from "../../core/state.js";
import { defineFeature, onClick, onSubmit, renderMine } from "../../core/registry.js";
import { save } from "../../core/storage.js";
import { audit } from "../../core/activity.js";
import { S } from "../../core/schema.js";
import { searchDocs } from "./search.js";

// The example document every new user starts with.
export function seedLibrary() {
  state.docs.push({ id: "d" + rid(), title: "Learning circle notes", example: true, t: Date.now(),
    text: "Agent engineering learning circle.\n\nWe meet on Wednesday evenings. Sessions run 90 minutes: 15 minutes of check-ins, 45 minutes of hands-on building, 30 minutes of show and tell.\n\nSession plan: Session 1 covers the agent loop and why tools matter. Session 2: everyone adds a tool and writes a clear description for it. Session 3: safety, approvals and prompt injection. Session 4: memory and background work, then demos.\n\nGround rules: no question is too basic. Pair beginners with someone who has built an agent before. Share your screen when you get stuck.\n\nOpen questions: should we move to a bigger room once the waitlist clears? Who wants to host the demo night?" });
}

function renderLibrary() {
  const n = state.docs.length;
  $("libSummary").textContent = n ? `${n} ${n === 1 ? "document" : "documents"} Muse can search and cite.` : "";
  $("libList").innerHTML = n ? state.docs.map(d =>
    `<li class="item"><span class="grow"><strong>${esc(d.title)}</strong> ${d.example ? `<span class="tag ex">example</span>` : ""}<br><span class="sub">${d.text.length.toLocaleString()} characters</span></span><button class="x" data-del-doc="${d.id}" aria-label="Remove document">×</button></li>`).join("")
    : `<li><p class="empty">No documents yet. Add notes, a syllabus or an article above, or ask Muse to save something for you.</p></li>`;
}

onSubmit("docForm", () => {
  const title = $("docTitle").value.trim(), text = $("docText").value.trim(); if (!title || !text) return;
  state.docs.push({ id: "d" + rid(), title, text: text.slice(0, 60000), t: Date.now() });
  $("docTitle").value = ""; $("docText").value = "";
  audit("docs_add", title, `Added by you (${text.length} characters)`, "you"); renderMine(); save();
});
onClick("delDoc", id => { const x = state.docs.find(v => v.id === id); state.docs = state.docs.filter(v => v.id !== id); audit("docs_remove", x?.title, "Removed by you", "you"); renderMine(); save(); });

defineFeature({
  id: "library",
  nav: { el: "navLibrary", badge: () => state.docs.length ? `${state.docs.length}` : "" },
  render: renderLibrary,
  guidance: "Library: the Library holds the user's documents and notes and is always available. Use docs_search to find relevant passages and docs_read to read a whole document before answering questions about their notes, and say which document an answer came from. Use docs_add to save notes, text or a summary to the Library, and docs_remove to delete a document.",
  tools: [
    { name: "docs_search", description: "Search the user's Library of documents and notes by keywords. Returns the best matching passages with doc_id, title and a relevance score. Use it before answering questions about their notes.",
      inputSchema: { type: "object", properties: { query: S }, required: ["query"] },
      run: ({ query }, _ctx, h) => {
        const r = searchDocs(String(query || ""));
        h.act(`“${query}” → ${r.length ? r.map(x => x.title + " (" + x.score + ")").join(", ") : "no matches"}`);
        return r.length ? r : "No passages matched. Try other keywords.";
      } },
    { name: "docs_read", description: "Read a whole document from the Library by doc_id (first 6000 characters).",
      inputSchema: { type: "object", properties: { doc_id: S }, required: ["doc_id"] },
      run: ({ doc_id }, _ctx, h) => {
        const d = state.docs.find(x => x.id === String(doc_id)); if (!d) throw new Error("no document " + doc_id);
        h.act(d.title); return { title: d.title, text: d.text.slice(0, 6000) };
      } },
    { name: "docs_add", description: "Add a document or note to the user's Library so it can be searched and cited later. title is a short label; text is the full content. Returns the doc_id.",
      inputSchema: { type: "object", properties: { title: S, text: S }, required: ["title", "text"] },
      run: ({ title, text }, _ctx, h) => {
        const t = String(title || "").trim(), body = String(text || "").trim();
        if (!t) throw new Error("title is empty"); if (!body) throw new Error("text is empty");
        const id = "d" + rid(); state.docs.push({ id, title: t, text: body, t: Date.now() });
        h.act(`${t} (${body.length} characters)`); return { doc_id: id };
      } },
    { name: "docs_remove", description: "Remove a document from the Library by doc_id. Returns what was removed.",
      inputSchema: { type: "object", properties: { doc_id: S }, required: ["doc_id"] },
      run: ({ doc_id }, _ctx, h) => {
        const d = state.docs.find(x => x.id === String(doc_id)); if (!d) throw new Error("no document " + doc_id);
        state.docs = state.docs.filter(x => x !== d); h.act(d.title); return { removed: d.title };
      } }
  ]
});
