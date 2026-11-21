---
title: Web search
type: Feature spec
featureId: web-search
status: Written from code
owner: Product Manager (Maya)
---

# Web search

**6 of 6** acceptance criteria checked against the code · 1 risk

_Written by Maya from the code on 2026-11-21. It describes the feature as built, not as planned._

## Summary

**Lets Muse search the web and read pages, through the server, so it can research current information and cite sources.**

web_search returns up to five results (title, URL, snippet) from Tavily's search API; web_open returns a page's readable text, capped at 20,000 characters, from Tavily's extract API. The server holds the Tavily key; without it, both return 503 no_api_key.

## User stories

- As a user, I want Muse to look up current information and tell me where it came from.

## Scope

**In scope**

- web_search and web_open tools
- The /api/web search and open handlers

**Out of scope**

- Job-board search (Goals)

## Requirements

| ID | Requirement |
|---|---|
| FS-R01 | The system returns at most five search results. |
| FS-R02 | The system only opens http(s) URLs. |
| FS-R03 | The system caps a page's text at 20,000 characters. |
| FS-R04 | The system returns 503 when the search key is missing. |

## Acceptance criteria

| # | Given | When | Then | Where | In code |
|---|---|---|---|---|---|
| AC1 | muse calls web_search | with an empty query | the tool refuses | web | ✓ |
| AC2 | a search runs | the server calls Tavily | it asks for at most five results | API | ✓ |
| AC3 | muse calls web_open | with a URL that isn't http(s) | the tool refuses | web | ✓ |
| AC4 | a page is opened | its text is long | the text is cut to 20,000 characters | API | ✓ |
| AC5 | the server has no TAVILY_API_KEY | a search or open is requested | it returns 503 no_api_key | API | ✓ |
| AC6 | the page can't be read | web_open runs | the server returns 422 with the reason | API | ✓ |

_The code each criterion rests on is under Evidence, at the end._

## Risks

- Page text is untrusted input to the model.

## How it works

_For engineers: where the behavior above lives in the code._

features/web/web.js defines web_search and web_open, which call /api/web. server/web.js forwards to Tavily's search and extract APIs with TAVILY_API_KEY, keeps five results and caps page text at TEXT_CAP = 20000.

## Evidence

| # | Code | Quote |
|---|---|---|
| AC1 | `public/js/features/web/web.js:15` | `if (!q) throw new Error("need a search query");` |
| AC2 | `server/web.js:43` | `max_results: 5, search_depth: "basic"` |
| AC3 | `public/js/features/web/web.js:25` | `if (!/^https?:\/\//i.test(u)) throw new Error("need a valid http(s) url");` |
| AC4 | `server/web.js:16` | `const TEXT_CAP = 20000;` |
| AC5 | `server/web.js:21` | `const noKey = () => err(503, "no_api_key", "TAVILY_API_KEY is not set on the server.");` |
| AC6 | `server/web.js:89` | `return err(422, "open_failed", reason ? String(reason) : "The page could not be read.");` |
