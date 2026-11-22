// Library page: documents Muse can search and cite.
// Documents live in the backend (Neon Postgres); see core/api.js. They are
// loaded into state.docs at boot (main.js). The docs_* tools run in the server
// agent (server/agent/tools/library.js).
import { $, esc } from "../../core/dom.js";
import { state } from "../../core/state.js";
import { defineFeature, onClick, onSubmit, renderMine } from "../../core/registry.js";
import { audit } from "../../core/activity.js";
import * as api from "../../core/api.js";

function renderLibrary() {
  const n = state.docs.length;
  $("libSummary").textContent = n ? `${n} ${n === 1 ? "document" : "documents"} Muse can search and cite.` : "";
  $("libList").innerHTML = n ? state.docs.map(d =>
    `<li class="item"><span class="grow"><strong>${esc(d.title)}</strong> ${d.example ? `<span class="tag ex">example</span>` : ""}<br><span class="sub">${(d.text || "").length.toLocaleString()} characters</span></span><button class="x" data-del-doc="${d.id}" aria-label="Remove document">×</button></li>`
  ).join("")
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
  render: renderLibrary
});
