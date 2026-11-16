/*
 * Job search request handler, shared by the local Express server
 * (server/index.js) and the Vercel Node function (api/jobs/search.js).
 * Returns { status, json }, mirroring server/web.js.
 *
 * Reads companies' public job boards through the applicant tracking systems'
 * official, key-free posting APIs (no scraping, no LinkedIn):
 *   Greenhouse  GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
 *   Lever       GET https://api.lever.co/v0/postings/{site}?mode=json
 *   Ashby       GET https://api.ashbyhq.com/posting-api/job-board/{name}
 * Each API lists one company's board, so the caller names the boards to search
 * (e.g. "greenhouse:stripe" or "https://jobs.lever.co/palantir").
 */
import { traceChild, SPAN_KIND, STATUS } from "./trace-core.js";

export const SOURCES = ["greenhouse", "lever", "ashby"];
const MAX_BOARDS = 15, MAX_RESULTS = 25, SNIPPET = 280;
const err = (status, code, message) => ({ status, json: { code, error: message } });

// "greenhouse:stripe", "lever:palantir", or a board URL -> { source, token }.
export function parseBoard(input) {
  const s = String(input || "").trim();
  const pair = s.match(/^(greenhouse|lever|ashby)\s*:\s*([\w.-]+)$/i);
  if (pair) return { source: pair[1].toLowerCase(), token: pair[2] };
  let u; try { u = new URL(s); } catch { return null; }
  const seg = u.pathname.split("/").filter(Boolean);
  const host = u.hostname.toLowerCase();
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    const t = u.searchParams.get("for") || (seg[0] === "v1" && seg[1] === "boards" ? seg[2] : seg[0]);
    return t ? { source: "greenhouse", token: t } : null;
  }
  if (/(^|\.)lever\.co$/.test(host)) {
    const t = seg[0] === "v0" && seg[1] === "postings" ? seg[2] : seg[0];
    return t ? { source: "lever", token: t } : null;
  }
  if (/(^|\.)ashbyhq\.com$/.test(host)) {
    const t = seg[0] === "posting-api" ? seg[2] : seg[0];
    return t ? { source: "ashby", token: t } : null;
  }
  return null;
}

export function boardUrl({ source, token }) {
  const t = encodeURIComponent(token);
  if (source === "greenhouse") return `https://boards-api.greenhouse.io/v1/boards/${t}/jobs?content=true`;
  if (source === "lever") return `https://api.lever.co/v0/postings/${t}?mode=json`;
  return `https://api.ashbyhq.com/posting-api/job-board/${t}`;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
const decode = s => String(s || "").replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, k) => ENTITIES[k]);
// Greenhouse sends HTML-escaped HTML: decode, drop tags, decode again, squash spaces.
export const toText = html => decode(decode(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const iso = v => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

// One API response -> [{ source, company, title, location, remote, url, posted, text }].
export function normalizeJobs(source, token, data) {
  if (source === "greenhouse") return (data?.jobs || []).map(j => ({
    source, company: token, title: String(j.title || ""), location: String(j.location?.name || ""),
    remote: /remote/i.test(j.location?.name || ""), url: String(j.absolute_url || ""),
    posted: iso(j.updated_at), text: toText(j.content)
  }));
  if (source === "lever") return (Array.isArray(data) ? data : []).map(j => ({
    source, company: token, title: String(j.text || ""), location: String(j.categories?.location || ""),
    remote: j.workplaceType === "remote" || /remote/i.test(j.categories?.location || ""), url: String(j.hostedUrl || ""),
    posted: iso(j.createdAt), text: String(j.descriptionPlain || toText(j.description)).replace(/\s+/g, " ").trim()
  }));
  return (data?.jobs || []).filter(j => j.isListed !== false).map(j => ({
    source, company: token, title: String(j.title || ""), location: String(j.location || ""),
    remote: !!j.isRemote || j.workplaceType === "Remote", url: String(j.jobUrl || ""),
    posted: iso(j.publishedAt), text: String(j.descriptionPlain || toText(j.descriptionHtml)).replace(/\s+/g, " ").trim()
  }));
}

// keywords: comma-separated phrases; a title matches if it holds every word of any phrase.
// location: substring of the location, or "remote" for remote jobs.
export function filterJobs(jobs, { keywords = "", location = "", days = 0 } = {}, now = Date.now()) {
  const phrases = String(keywords).toLowerCase().split(",").map(p => p.trim().split(/\s+/).filter(Boolean)).filter(p => p.length);
  const loc = String(location).trim().toLowerCase();
  const since = Number(days) > 0 ? now - Number(days) * 86400000 : 0;
  return jobs.filter(j => {
    const title = j.title.toLowerCase();
    if (phrases.length && !phrases.some(words => words.every(w => title.includes(w)))) return false;
    if (loc && !(loc === "remote" ? j.remote : j.location.toLowerCase().includes(loc) || (j.remote && /remote/.test(loc)))) return false;
    if (since && (!j.posted || Date.parse(j.posted) < since)) return false;
    return true;
  }).sort((a, b) => (Date.parse(b.posted || 0) || 0) - (Date.parse(a.posted || 0) || 0));
}

const summary = j => ({ source: j.source, company: j.company, title: j.title, location: j.location, remote: j.remote, url: j.url, posted: j.posted ? j.posted.slice(0, 10) : null, snippet: j.text.slice(0, SNIPPET) });

export async function handleSearch(body, _env, fetchImpl = fetch) {
  const list = Array.isArray(body?.boards) ? body.boards : [];
  const boards = list.map(parseBoard);
  const bad = list.filter((_, i) => !boards[i]);
  if (!list.length) return err(400, "bad_request", "boards is required, e.g. [\"greenhouse:stripe\", \"https://jobs.lever.co/palantir\"]");
  if (bad.length) return err(400, "bad_request", `Unrecognized board: ${bad.join(", ")}. Use greenhouse:<token>, lever:<site>, ashby:<name>, or the board's URL.`);
  if (boards.length > MAX_BOARDS) return err(400, "bad_request", `At most ${MAX_BOARDS} boards per search.`);

  const span = traceChild("jobs.search", { kind: SPAN_KIND.HTTP });
  span?.set({ "jobs.boards": boards.map(b => `${b.source}:${b.token}`).join(","), "jobs.keywords": String(body.keywords || "") });
  const errors = [];
  const fetched = await Promise.all(boards.map(async b => {
    try {
      const r = await fetchImpl(boardUrl(b), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (r.status === 404) { errors.push(`${b.source}:${b.token} not found`); return []; }
      if (!r.ok) { errors.push(`${b.source}:${b.token} returned ${r.status}`); return []; }
      if (!/json/i.test(r.headers.get("content-type") || "")) { errors.push(`${b.source}:${b.token} did not return JSON`); return []; }
      return normalizeJobs(b.source, b.token, await r.json());
    } catch (e) {
      errors.push(`${b.source}:${b.token} unreachable`); return [];
    }
  }));
  const all = fetched.flat();
  const matches = filterJobs(all, body);
  span?.set({ "jobs.total": all.length, "jobs.matches": matches.length }).end(STATUS.OK);
  return { status: 200, json: { searched: all.length, total: matches.length, jobs: matches.slice(0, MAX_RESULTS).map(summary), errors } };
}
