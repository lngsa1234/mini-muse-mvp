// Library page: documents Muse can search and cite, and the docs_* tools.
// Documents live in the backend (Neon + Vercel Blob); see core/api.js. They are
// loaded into state.docs at boot (main.js) and kept in sync here, so the
// client-side search in search.js keeps working unchanged.
import { $, esc } from "../../core/dom.js";
import { state } from "../../core/state.js";
import { defineFeature, onClick, onSubmit, renderMine } from "../../core/registry.js";
import { audit } from "../../core/activity.js";
import { S } from "../../core/schema.js";
import { searchDocs } from "./search.js";
import * as api from "../../core/api.js";

function renderLibrary() {
  const n = state.docs.length;
  $("libSummary").textContent = n ? `${n} ${n === 1 ? "document" : "documents"} Muse can search and cite.` : "";
  $("libList").innerHTML = n ? state.docs.map(d => {
    const file = d.url ? ` <a class="tag" href="${esc(d.url)}" target="_blank" rel="noopener">file</a>` : "";
    return `<li class="item"><span class="grow"><strong>${esc(d.title)}</strong> ${d.example ? `<span class="tag ex">example</span>` : ""}${file}<br><span class="sub">${(d.text || "").length.toLocaleString()} characters</span></span><button class="x" data-del-doc="${d.id}" aria-label="Remove document">×</button></li>`;
  }).join("")
    : `<li><p class="empty">No documents yet. Paste notes or upload a file (PDF, DOCX, TXT) above, or ask Muse to save something for you.</p></li>`;
}

onSubmit("docForm", async () => {
  const title = $("docTitle").value.trim(), text = $("docText").value.trim();
  const fileInput = $("docFile"), file = fileInput && fileInput.files && fileInput.files[0];
  if (!file && (!title || !text)) return;
  try {
    const doc = file ? await api.uploadDoc(file, title) : await api.createTextDoc(title, text);
    state.docs.unshift(doc);
    $("docTitle").value = ""; $("docText").value = ""; if (fileInput) fileInput.value = "";
    audit("docs_add", doc.title, `Added by you (${(doc.text || "").length} characters)`, "you");
    renderMine();
  } catch (e) {
    $("libSummary").textContent = "Could not add document: " + e.message;
  }
});
onClick("delDoc", async id => {
  const x = state.docs.find(v => v.id === id);
  try {
    await api.removeDoc(id);
    state.docs = state.docs.filter(v => v.id !== id);
    audit("docs_remove", x?.title, "Removed by you", "you"); renderMine();
  } catch (e) {
    $("libSummary").textContent = "Could not remove document: " + e.message;
  }
});

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
      run: async ({ title, text }, _ctx, h) => {
        const t = String(title || "").trim(), body = String(text || "").trim();
        if (!t) throw new Error("title is empty"); if (!body) throw new Error("text is empty");
        const doc = await api.createTextDoc(t, body); state.docs.unshift(doc);
        h.act(`${t} (${body.length} characters)`); return { doc_id: doc.id };
      } },
    { name: "docs_remove", description: "Remove a document from the Library by doc_id. Returns what was removed.",
      inputSchema: { type: "object", properties: { doc_id: S }, required: ["doc_id"] },
      run: async ({ doc_id }, _ctx, h) => {
        const d = state.docs.find(x => x.id === String(doc_id)); if (!d) throw new Error("no document " + doc_id);
        await api.removeDoc(d.id); state.docs = state.docs.filter(x => x !== d); h.act(d.title); return { removed: d.title };
      } }
  ]
});
