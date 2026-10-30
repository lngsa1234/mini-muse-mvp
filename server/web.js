/*
 * Web browsing request handlers, shared by the local Express server
 * (server/index.js) and the Vercel Node functions (api/web/*). Each handler is
 * framework-agnostic: it takes already-parsed input plus env and returns
 * { status, json }, mirroring server/docs.js and server/proxy.js.
 *
 * Both tools are backed by Tavily (https://tavily.com): /search for web search
 * and /extract for reading a page's content. The key stays server-side; the
 * browser only ever calls our /api/web/* routes.
 */
export const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
export const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract";

const TEXT_CAP = 20000;

// Include `error` (what the browser's jcall reads) alongside `code` for callers
// that branch on it.
const err = (status, code, message) => ({ status, json: { code, error: message } });
const noKey = () => err(503, "no_api_key", "TAVILY_API_KEY is not set on the server.");
const unreachable = () => err(502, "upstream_unreachable", "Could not reach the search provider.");

function tavilyInit(apiKey, payload) {
  return {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload)
  };
}

export async function handleSearch(body, env) {
  const query = String((body && body.query) || "").trim();
  if (!query) return err(400, "bad_request", "query is required");
  const apiKey = env.TAVILY_API_KEY;
  if (!apiKey) return noKey();

  let res;
  try {
    res = await fetch(TAVILY_SEARCH_URL, tavilyInit(apiKey, { query, max_results: 5, search_depth: "basic" }));
  } catch {
    return unreachable();
  }
  if (!res.ok) return err(res.status, "search_failed", `Search failed (${res.status}).`);

  const data = await res.json();
  const results = (Array.isArray(data.results) ? data.results : []).map(r => ({
    title: String(r.title || r.url || ""),
    url: String(r.url || ""),
    snippet: String(r.content || "").slice(0, 1000)
  }));
  return { status: 200, json: { results } };
}

export async function handleOpen(body, env) {
  const url = String((body && body.url) || "").trim();
  if (!/^https?:\/\//i.test(url)) return err(400, "bad_request", "a valid http(s) url is required");
  const apiKey = env.TAVILY_API_KEY;
  if (!apiKey) return noKey();

  let res;
  try {
    res = await fetch(TAVILY_EXTRACT_URL, tavilyInit(apiKey, { urls: url, format: "text" }));
  } catch {
    return unreachable();
  }
  if (!res.ok) return err(res.status, "open_failed", `Could not open the page (${res.status}).`);

  const data = await res.json();
  const first = Array.isArray(data.results) ? data.results[0] : null;
  if (!first) {
    const reason = Array.isArray(data.failed_results) && data.failed_results[0]?.error;
    return err(422, "open_failed", reason ? String(reason) : "The page could not be read.");
  }
  const text = String(first.raw_content || "").slice(0, TEXT_CAP);
  return { status: 200, json: { title: String(first.title || url), url, text } };
}
