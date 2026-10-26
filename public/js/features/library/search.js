// Document search (simple RAG: paragraph chunks ranked by TF-IDF keyword overlap).
// A good place to experiment: embeddings, better chunking, citations.
import { state } from "../../core/state.js";
import { toks } from "../../core/format.js";

function chunks() {
  const out = [];
  for (const d of state.docs) {
    const paras = d.text.split(/\n\s*\n/); let buf = "";
    for (const p of paras) { if ((buf + p).length > 600 && buf) { out.push({ doc: d, text: buf.trim() }); buf = ""; } buf += p + "\n\n"; }
    if (buf.trim()) out.push({ doc: d, text: buf.trim() });
  }
  return out;
}

// Returns the top k passages: [{ doc_id, title, score, passage }]
export function searchDocs(query, k = 3) {
  const cs = chunks(), q = [...new Set(toks(query))];
  if (!cs.length || !q.length) return [];
  const df = {}; const tf = cs.map(c => { const m = {}; for (const w of toks(c.doc.title + " " + c.text)) m[w] = (m[w] || 0) + 1; return m; });
  for (const w of q) df[w] = tf.filter(m => m[w]).length;
  return cs.map((c, i) => ({ c, score: q.reduce((s, w) => s + (tf[i][w] ? (1 + Math.log(tf[i][w])) * Math.log(1 + cs.length / df[w]) : 0), 0) }))
    .filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, k)
    .map(r => ({ doc_id: r.c.doc.id, title: r.c.doc.title, score: +r.score.toFixed(2), passage: r.c.text }));
}
