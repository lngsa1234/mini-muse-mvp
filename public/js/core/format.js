// Formatting helpers for dates, rich text and previews.
import { esc } from "./dom.js";

export function fmtWhen(iso) {
  const d = new Date(iso); if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + " · " +
         d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
export const fmtDay = t => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export const clock = t => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
export const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
export function short(v, n = 140) { const s = typeof v === "string" ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + "…" : s; }

// Keyword tokenizer used by Library search and the Mail connector.
const STOP = new Set("a an the and or of to in on at for is are was were be it this that with as by from what when where who how do does did my me i you your we our they".split(" "));
export const toks = s => (String(s).toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => !STOP.has(w) && w.length > 1);
