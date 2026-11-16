// Job search and fit scoring: `npm test` (no network, no API key).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBoard, boardUrl, normalizeJobs, filterJobs, toText, handleSearch, postingInfo, JOB_SITES } from "../server/jobs.js";
import { overallScore, verdict, keywordCoverage, buildFit } from "../public/js/features/jobs/fit.js";

const GREENHOUSE = { jobs: [
  { title: "Senior Product Manager, Connected Vehicles", location: { name: "Detroit, MI" }, absolute_url: "https://boards.greenhouse.io/acme/jobs/1", updated_at: "2026-11-10T10:00:00-05:00", content: "&lt;p&gt;Own the &lt;b&gt;telematics&lt;/b&gt; roadmap &amp;amp; OTA.&lt;/p&gt;" },
  { title: "Software Engineer", location: { name: "Remote - US" }, absolute_url: "https://boards.greenhouse.io/acme/jobs/2", updated_at: "2026-11-12T10:00:00Z", content: "" }
] };
const LEVER = [{ text: "Product Lead", categories: { location: "Remote" }, workplaceType: "remote", hostedUrl: "https://jobs.lever.co/beta/x", createdAt: Date.parse("2026-11-14T00:00:00Z"), descriptionPlain: "Lead the platform." }];
const ASHBY = { jobs: [
  { title: "Principal Product Manager", location: "San Francisco", isRemote: false, jobUrl: "https://jobs.ashbyhq.com/gamma/y", publishedAt: "2026-11-01T00:00:00Z", descriptionPlain: "Edge AI." },
  { title: "Hidden PM", location: "NYC", isListed: false, jobUrl: "https://jobs.ashbyhq.com/gamma/z" }
] };

test("jobs: boards parse from source:token pairs and board URLs", () => {
  assert.deepEqual(parseBoard("greenhouse:stripe"), { source: "greenhouse", token: "stripe" });
  assert.deepEqual(parseBoard("https://boards.greenhouse.io/figma"), { source: "greenhouse", token: "figma" });
  assert.deepEqual(parseBoard("https://job-boards.greenhouse.io/embed/job_board?for=anthropic"), { source: "greenhouse", token: "anthropic" });
  assert.deepEqual(parseBoard("https://jobs.lever.co/palantir/abc"), { source: "lever", token: "palantir" });
  assert.deepEqual(parseBoard("https://jobs.ashbyhq.com/openai"), { source: "ashby", token: "openai" });
  assert.equal(parseBoard("https://www.linkedin.com/jobs/view/1"), null);
  assert.equal(parseBoard("stripe"), null);
  assert.equal(boardUrl({ source: "lever", token: "palantir" }), "https://api.lever.co/v0/postings/palantir?mode=json");
});

test("jobs: each source normalizes to one shape; unlisted Ashby jobs are dropped", () => {
  const gh = normalizeJobs("greenhouse", "acme", GREENHOUSE);
  assert.equal(gh[0].text, "Own the telematics roadmap & OTA.");
  assert.equal(gh[1].remote, true);
  assert.equal(normalizeJobs("lever", "beta", LEVER)[0].title, "Product Lead");
  const ab = normalizeJobs("ashby", "gamma", ASHBY);
  assert.equal(ab.length, 1);
  assert.equal(ab[0].url, "https://jobs.ashbyhq.com/gamma/y");
  assert.equal(toText("&lt;br&gt;a&amp;nbsp;b"), "a b");
});

test("jobs: filters match title phrases, location or remote, and recency", () => {
  const all = [...normalizeJobs("greenhouse", "acme", GREENHOUSE), ...normalizeJobs("lever", "beta", LEVER), ...normalizeJobs("ashby", "gamma", ASHBY)];
  const now = Date.parse("2026-11-16T12:00:00Z");
  assert.deepEqual(filterJobs(all, { keywords: "product manager, product lead" }, now).map(j => j.title),
    ["Product Lead", "Senior Product Manager, Connected Vehicles", "Principal Product Manager"]);
  assert.deepEqual(filterJobs(all, { keywords: "product", location: "remote" }, now).map(j => j.title), ["Product Lead"]);
  assert.deepEqual(filterJobs(all, { keywords: "product manager", location: "detroit" }, now).map(j => j.company), ["acme"]);
  assert.equal(filterJobs(all, { keywords: "product manager", days: 7 }, now).length, 1);
});

test("jobs: handleSearch merges boards and reports the ones that failed", async () => {
  const fake = async url => {
    const json = body => ({ ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => body });
    if (url.includes("greenhouse")) return json(GREENHOUSE);
    if (url.includes("lever")) return json(LEVER);
    return { ok: false, status: 404, headers: new Headers(), json: async () => ({}) };
  };
  const out = await handleSearch({ boards: ["greenhouse:acme", "lever:beta", "ashby:missing"], keywords: "product" }, {}, fake);
  assert.equal(out.status, 200);
  assert.equal(out.json.total, 2);
  assert.deepEqual(out.json.errors, ["ashby:missing not found"]);
  assert.ok(out.json.jobs.every(j => j.snippet.length <= 280));
  assert.equal((await handleSearch({ boards: ["linkedin.com/jobs"] }, {}, fake)).status, 400);
  assert.equal((await handleSearch({}, {}, fake)).status, 400);
});

test("fit: code computes the score, verdict, and keyword coverage", () => {
  assert.equal(overallScore({ role: 5, seniority: 5, skills: 5, domain: 5, logistics: 5 }), 100);
  assert.equal(overallScore({ role: 1, seniority: 1, skills: 1, domain: 1, logistics: 1 }), 0);
  assert.equal(overallScore({ role: 9, seniority: "x" }), 30); // clamped: role 5 -> 0.3; the rest 1
  assert.equal(verdict(85, ["requires a CPA license"]), "weak");
  assert.equal(verdict(55), "possible");
  const kc = keywordCoverage(["telematics", "OTA updates", "SQL", "C++"], "Led telematics and C++ edge AI work; OTA updates for 2M vehicles.");
  assert.deepEqual(kc, { found: ["telematics", "OTA updates", "C++"], missing: ["SQL"], percent: 75 });
  const fit = buildFit({ scores: { role: 4, seniority: 4, skills: 3, domain: 5, logistics: 3 }, keywords: ["telematics"], dealbreakers: [] }, "telematics PM");
  assert.equal(fit.overall, 70);
  assert.equal(fit.verdict, "strong");
});

test("discover: only single postings on the fixed hiring sites count", () => {
  assert.deepEqual(postingInfo("https://boards.greenhouse.io/acme/jobs/4012345"), { source: "greenhouse", company: "acme" });
  assert.deepEqual(postingInfo("https://job-boards.greenhouse.io/acme/jobs/4012345?gh_src=x"), { source: "greenhouse", company: "acme" });
  assert.deepEqual(postingInfo("https://jobs.lever.co/beta/0f7e1f3a-1b2c-4d5e-8f90-a1b2c3d4e5f6"), { source: "lever", company: "beta" });
  assert.deepEqual(postingInfo("https://jobs.ashbyhq.com/gamma/0f7e1f3a-1b2c-4d5e-8f90-a1b2c3d4e5f6/application"), { source: "ashby", company: "gamma" });
  assert.deepEqual(postingInfo("https://jobs.smartrecruiters.com/Bosch/744000012345678-business-analyst"), { source: "smartrecruiters", company: "Bosch" });
  assert.deepEqual(postingInfo("https://apply.workable.com/delta/j/AB12CD34EF/"), { source: "workable", company: "delta" });
  assert.deepEqual(postingInfo("https://ford.wd1.myworkdayjobs.com/en-US/FordCareers/job/Dearborn-MI/Business-Analyst_R123"), { source: "workday", company: "ford" });
  // Board home pages, search pages, and other sites are not postings.
  assert.equal(postingInfo("https://boards.greenhouse.io/acme"), null);
  assert.equal(postingInfo("https://jobs.lever.co/beta"), null);
  assert.equal(postingInfo("https://ford.wd1.myworkdayjobs.com/en-US/FordCareers"), null);
  assert.equal(postingInfo("https://www.zippia.com/business-finance-analyst-jobs/jobs"), null);
  assert.ok(!JOB_SITES.some(s => /handshake|linkedin|indeed/.test(s)));
});

test("discover: searches the fixed sites with keywords and keeps postings only", async () => {
  let sent;
  const fake = async (url, init) => {
    sent = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ results: [
      { title: "Job Application for Business Analyst at Acme", url: "https://boards.greenhouse.io/acme/jobs/1#app", content: "Remote friendly business analyst role." },
      { title: "Acme careers", url: "https://boards.greenhouse.io/acme", content: "All jobs" },
      { title: "Business Analyst", url: "https://ford.wd1.myworkdayjobs.com/en-US/FordCareers/job/Dearborn-MI/Business-Analyst_R1", content: "Dearborn" },
      { title: "Business Analyst", url: "https://boards.greenhouse.io/acme/jobs/1", content: "duplicate" }
    ] }) };
  };
  const out = await handleSearch({ keywords: "business analyst, data analyst", location: "Detroit, MI", days: 14 }, { TAVILY_API_KEY: "k" }, fake);
  assert.equal(out.status, 200);
  assert.equal(out.json.mode, "discover");
  assert.equal(sent.query, "business analyst job Detroit, MI");
  assert.deepEqual(sent.include_domains, JOB_SITES);
  assert.equal(sent.time_range, "month");
  assert.deepEqual(out.json.jobs.map(j => [j.source, j.company, j.title]), [["greenhouse", "acme", "Business Analyst at Acme"], ["workday", "ford", "Business Analyst"]]);
  assert.equal(out.json.jobs[0].remote, true);
  assert.equal((await handleSearch({ keywords: "analyst" }, {}, fake)).status, 503);
});
