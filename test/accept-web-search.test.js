// Acceptance tests: Web search (docs/specs/web-search.md), one per criterion.
// Tavily is replaced by a stubbed fetch; nothing leaves the process.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handleSearch, handleOpen } from "../server/web.js";
import web from "../server/agent/tools/web.js";

const tool = name => web.tools.find(t => t.name === name);
const h = { act: () => {} };
const ctxWith = services => ({ services, data: {} });
const KEY = { TAVILY_API_KEY: "test-key" };
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const stubFetch = reply => {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => reply }; };
  return calls;
};

test("web-search AC1: web_search refuses an empty query", async () => {
  let searched = false;
  const ctx = ctxWith({ webSearch: async () => { searched = true; return { status: 200, json: { results: [] } }; } });
  await assert.rejects(tool("web_search").run({ query: "   " }, ctx, h), /need a search query/);
  assert.equal(searched, false);
});

test("web-search AC2: a search asks Tavily for at most five results", async () => {
  const calls = stubFetch({ results: [] });
  const out = await handleSearch({ query: "PM jobs Detroit" }, KEY);
  assert.equal(out.status, 200);
  assert.equal(calls[0].body.max_results, 5);
});

test("web-search AC3: web_open refuses a URL that isn't http(s)", async () => {
  let opened = false;
  const ctx = ctxWith({ webOpen: async () => { opened = true; return { status: 200, json: {} }; } });
  await assert.rejects(tool("web_open").run({ url: "file:///etc/passwd" }, ctx, h), /valid http\(s\) url/);
  assert.equal(opened, false);
  const direct = await handleOpen({ url: "javascript:alert(1)" }, KEY);
  assert.equal(direct.status, 400);
});

test("web-search AC4: an opened page's text is cut to 20,000 characters", async () => {
  stubFetch({ results: [{ title: "Long", raw_content: "a".repeat(30000) }] });
  const out = await handleOpen({ url: "https://example.com/long" }, KEY);
  assert.equal(out.status, 200);
  assert.equal(out.json.text.length, 20000);
});

test("web-search AC5: with no TAVILY_API_KEY, search and open return 503 no_api_key", async () => {
  const s = await handleSearch({ query: "x" }, {});
  const o = await handleOpen({ url: "https://example.com" }, {});
  assert.deepEqual([s.status, s.json.code], [503, "no_api_key"]);
  assert.deepEqual([o.status, o.json.code], [503, "no_api_key"]);
});

test("web-search AC6: a page that can't be read returns 422 with the reason", async () => {
  stubFetch({ results: [], failed_results: [{ url: "https://example.com", error: "blocked by robots.txt" }] });
  const out = await handleOpen({ url: "https://example.com" }, KEY);
  assert.equal(out.status, 422);
  assert.equal(out.json.code, "open_failed");
  assert.equal(out.json.error, "blocked by robots.txt");
});
