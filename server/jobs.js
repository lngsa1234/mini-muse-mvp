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
 *
 * Without boards, it runs in discovery mode: a Tavily web search limited to a
 * fixed list of employer hiring sites (JOB_SITES), keeping only results that
 * are single job postings. That finds openings at companies the user didn't
 * name, including Workday employers, and never returns aggregator pages.
 */
import { traceChild, SPAN_KIND, STATUS } from "./trace-core.js";
import { TAVILY_SEARCH_URL } from "./web.js";

// Employer hiring sites searched in discovery mode. Edit this list to add or
// remove sites; each needs a pattern in POSTING below.
export const JOB_SITES = [
  "boards.greenhouse.io", "job-boards.greenhouse.io", "jobs.lever.co", "jobs.ashbyhq.com",
  "jobs.smartrecruiters.com", "apply.workable.com", "myworkdayjobs.com"
];
// Path shapes of a single posting (not a board home or search page) per site;
// group 1 is the company.
const POSTING = [
  { site: "greenhouse", host: /(^|\.)greenhouse\.io$/, path: /^\/([\w.-]+)\/jobs\/\d+/ },
  { site: "lever", host: /^jobs\.lever\.co$/, path: /^\/([\w.-]+)\/[0-9a-f-]{36}/i },
  { site: "ashby", host: /^jobs\.ashbyhq\.com$/, path: /^\/([\w.%-]+)\/[0-9a-f-]{36}/i },
  { site: "smartrecruiters", host: /^jobs\.smartrecruiters\.com$/, path: /^\/([\w.-]+)\/\d+/ },
  { site: "workable", host: /^apply\.workable\.com$/, path: /^\/([\w.-]+)\/j\/[\w]+/ },
  { site: "workday", host: /^([\w-]+)\.wd\d+\.myworkdayjobs\.com$/, path: /\/job\// }
];

// A posting URL -> { source, company }, or null for anything that isn't one job.
export function postingInfo(url) {
  let u; try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase();
  for (const p of POSTING) {
    const h = host.match(p.host); if (!h) continue;
    const m = u.pathname.match(p.path); if (!m) return null;
    const company = p.site === "workday" ? h[1] : decodeURIComponent(m[1]);
    return { source: p.site, company };
  }
  return null;
}

const timeRange = days => { const d = Number(days) || 0; return !d ? undefined : d <= 1 ? "day" : d <= 7 ? "week" : d <= 31 ? "month" : "year"; };

// Discovery mode: search the fixed hiring sites by title keywords and location.
export async function handleDiscover(body, env, fetchImpl = fetch) {
  const keywords = String(body?.keywords || "").trim();
  if (!keywords) return err(400, "bad_request", "keywords are required when no boards are given, e.g. \"business analyst\"");
  if (!env.TAVILY_API_KEY) return err(503, "no_api_key", "TAVILY_API_KEY is not set on the server.");
  const location = String(body?.location || "").trim();
  const query = `${keywords.split(",")[0].trim()} job ${location}`.trim();
  const payload = { query, max_results: 20, search_depth: "advanced", include_domains: JOB_SITES };
  const range = timeRange(body?.days); if (range) payload.time_range = range;

  const span = traceChild("jobs.discover", { kind: SPAN_KIND.HTTP });
  span?.set({ "http.url": TAVILY_SEARCH_URL, "jobs.query": query });
  let res;
  try {
    res = await fetchImpl(TAVILY_SEARCH_URL, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.TAVILY_API_KEY}` }, body: JSON.stringify(payload) });
  } catch { span?.fail(new Error("upstream unreachable")); return err(502, "upstream_unreachable", "Could not reach the search provider."); }
  if (!res.ok) { span?.set({ "http.response.status_code": res.status }).end(STATUS.ERROR, `search failed (${res.status})`); return err(res.status, "search_failed", `Search failed (${res.status}).`); }
  const data = await res.json();
  const seen = new Set(), jobs = [];
  for (const r of Array.isArray(data.results) ? data.results : []) {
    const url = String(r.url || "").split("#")[0], info = postingInfo(url);
    if (!info || seen.has(url)) continue;
    seen.add(url);
    jobs.push({ source: info.source, company: info.company, title: String(r.title || "").replace(/^Job Application for\s+/i, "").trim(), location: "", remote: /remote/i.test(`${r.title} ${r.content}`), url, posted: null, snippet: String(r.content || "").replace(/\s+/g, " ").trim().slice(0, SNIPPET) });
  }
  span?.set({ "jobs.results": (data.results || []).length, "jobs.postings": jobs.length }).end(STATUS.OK);
  return { status: 200, json: { mode: "discover", sites: JOB_SITES, searched: (data.results || []).length, total: jobs.length, jobs, errors: [] } };
}

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

export async function handleSearch(body, env = {}, fetchImpl = fetch) {
  const list = (Array.isArray(body?.boards) ? body.boards : []).filter(b => String(b || "").trim());
  if (!list.length) return handleDiscover(body, env, fetchImpl);
  const boards = list.map(parseBoard);
  const bad = list.filter((_, i) => !boards[i]);
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
  return { status: 200, json: { mode: "boards", searched: all.length, total: matches.length, jobs: matches.slice(0, MAX_RESULTS).map(summary), errors } };
}
