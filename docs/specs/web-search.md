---
title: Web search
type: Feature spec
featureId: web-search
status: Written from code
owner: Product Manager (Maya)
---

# Web search

_Written by Maya from the code on 2026-11-21. It describes the feature as built._

## Summary

Lets Muse search the web and read pages, through the server, so it can research current information and cite sources.

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

- **AC1** ✓ (web): Given Muse calls web_search, when with an empty query, then the tool refuses.
  - `public/js/features/web/web.js:15`: `if (!q) throw new Error("need a search query");`
- **AC2** ✓ (API): Given a search runs, when the server calls Tavily, then it asks for at most five results.
  - `server/web.js:43`: `max_results: 5, search_depth: "basic"`
- **AC3** ✓ (web): Given Muse calls web_open, when with a URL that isn't http(s), then the tool refuses.
  - `public/js/features/web/web.js:25`: `if (!/^https?:\/\//i.test(u)) throw new Error("need a valid http(s) url");`
- **AC4** ✓ (API): Given a page is opened, when its text is long, then the text is cut to 20,000 characters.
  - `server/web.js:16`: `const TEXT_CAP = 20000;`
- **AC5** ✓ (API): Given the server has no TAVILY_API_KEY, when a search or open is requested, then it returns 503 no_api_key.
  - `server/web.js:21`: `const noKey = () => err(503, "no_api_key", "TAVILY_API_KEY is not set on the server.");`
- **AC6** ✓ (API): Given the page can't be read, when web_open runs, then the server returns 422 with the reason.
  - `server/web.js:89`: `return err(422, "open_failed", reason ? String(reason) : "The page could not be read.");`

## Risks

- Page text is untrusted input to the model.
