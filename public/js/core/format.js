// Formatting helpers for dates, rich text and previews.
import { esc } from "./dom.js";

export function fmtWhen(iso) {
  const d = new Date(iso); if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + " · " +
         d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
export const fmtDay = t => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export const clock = t => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
// Chat text: escape everything, then allow **bold**, [label](https://…) links,
// bare https:// URLs, and line breaks. Only http(s) links are made clickable,
// and they open in a new tab. Runs on escaped text, so a URL can't break out
// of its href attribute.
const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g;
const anchor = (href, label) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
function linkify(html) {
  return html.replace(LINK, (_, label, href, bare) => {
    if (href) return anchor(href, label);
    const tail = bare.match(/(?:[.,;:!?)\]]|&#39;|&quot;)+$/)?.[0] || "";   // keep sentence punctuation outside the link
    const url = tail ? bare.slice(0, -tail.length) : bare;
    return anchor(url, url) + tail;
  });
}
export const rich = s => linkify(esc(s)).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
export function short(v, n = 140) { const s = typeof v === "string" ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + "…" : s; }

// Keyword tokenizer used by Library search and the Mail connector.
const STOP = new Set("a an the and or of to in on at for is are was were be it this that with as by from what when where who how do does did my me i you your we our they".split(" "));
export const toks = s => String(s)
  .normalize("NFKD").replace(/\p{M}/gu, "")
  .replace(/([a-z])([A-Z])/g, "$1 $2")
  .toLowerCase().match(/[a-z0-9]+/g)?.filter(w => !STOP.has(w) && w.length > 1) || [];
