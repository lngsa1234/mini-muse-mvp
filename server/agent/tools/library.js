// Library: docs_search, docs_read, docs_add, docs_remove.
import { S } from "./schema.js";
import { rankDocs } from "../../../public/js/features/library/rank.js";

export default {
  id: "library",
  guidance: "Library: the Library holds the user's documents and notes and is always available. Use docs_search to find relevant passages and docs_read to read a whole document before answering questions about their notes, and say which document an answer came from. Use docs_add to save notes, text or a summary to the Library, and docs_remove to delete a document.",
  tools: [
    { name: "docs_search", description: "Search the user's Library of documents and notes by keywords. Returns the best matching passages with doc_id, title and a relevance score. Use it before answering questions about their notes.",
      inputSchema: { type: "object", properties: { query: S }, required: ["query"] },
      run: async ({ query }, ctx, h) => {
        const r = rankDocs(await ctx.docs(), String(query || ""));
        h.act(`“${query}” → ${r.length ? r.map(x => x.title + " (" + x.score + ")").join(", ") : "no matches"}`, { query: String(query || ""), matches: r.length });
        return r.length ? r : "No passages matched. Try other keywords.";
      } },
    { name: "docs_read", description: "Read a whole document from the Library by doc_id (first 6000 characters).",
      inputSchema: { type: "object", properties: { doc_id: S }, required: ["doc_id"] },
      run: async ({ doc_id }, ctx, h) => {
        const key = String(doc_id), docs = await ctx.docs();
        // Models sometimes pass the human-readable title returned by docs_search
        // instead of its opaque doc_id. Accept an exact title as a safe fallback.
        const d = docs.find(x => x.id === key) || docs.find(x => x.title === key);
        if (!d) throw new Error("no document " + doc_id);
        h.act(d.title); return { title: d.title, text: String(d.text || "").slice(0, 6000) };
      } },
    { name: "docs_add", description: "Add a document or note to the user's Library so it can be searched and cited later. title is a short label; text is the full content. Returns the doc_id.",
      inputSchema: { type: "object", properties: { title: S, text: S }, required: ["title", "text"] },
      run: async ({ title, text }, ctx, h) => {
        const t = String(title || "").trim(), body = String(text || "").trim();
        if (!t) throw new Error("title is empty"); if (!body) throw new Error("text is empty");
        const doc = await ctx.repo.createDoc(t, body); ctx.changed("docs");
        h.act(`${t} (${body.length} characters)`); return { doc_id: doc.id };
      } },
    { name: "docs_remove", description: "Remove a document from the Library by doc_id. Returns what was removed.",
      inputSchema: { type: "object", properties: { doc_id: S }, required: ["doc_id"] },
      run: async ({ doc_id }, ctx, h) => {
        const d = (await ctx.docs()).find(x => x.id === String(doc_id)); if (!d) throw new Error("no document " + doc_id);
        await ctx.repo.removeDoc(d.id); ctx.changed("docs"); h.act(d.title); return { removed: d.title };
      } }
  ]
};
