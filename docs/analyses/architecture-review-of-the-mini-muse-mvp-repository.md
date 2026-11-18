# Architecture review of mini-muse-mvp

_By Alex (Technical Lead) · 2026-11-17 · model claude-sonnet-5-5 · 12 files read_

> Produce an architecture review of the mini-muse-mvp repository
> 
> Assess the repository's architecture across the browser agent loop (public/js/agent), the Express and Vercel API layer (server/index.js, api/), Neon Postgres persistence, localStorage state, and the connector and browser-bridge components (chrome-extension/). Use docs/ARCHITECTURE.md and README.md as the reference, and report where the implementation matches or departs from them.

## Summary

Mini Muse is a no-build ES-module browser app with a thin Express/Vercel proxy and Neon persistence. The agent loop, the /api/llm proxy and the pinned-model design match docs/ARCHITECTURE.md and the README. The main departures are these. Every API route, including the OpenAI proxy, resolves to one hardcoded user with no authentication, so a public deployment is effectively open. Both the loop and the proxy have no server-side limits on tool-use cost or request abuse. The docs omit several modules that now exist: browser, web, observability, policy, intent, trace, google and the extra api/ routes. Persistence is split three ways (Neon, localStorage or an optional host doc, and an encrypted cookie), and the localStorage layer keeps a legacy `agent.use("db")` path that the docs do not mention. The Chrome bridge is reasonably scoped (origin allowlist, optional host permissions, http(s)-only), but its allowlist is hardcoded to one Vercel domain. I did not read server/google.js, the Neon data-access files or most feature modules, so the Google cookie handling and SQL safety are unconfirmed.

## Browser agent loop (public/js/agent)

`public/js/agent/loop.js` implements the loop as documented. `normalize` lifts the instruction block into a system message (`loop.js:14-48`). `runLoop` calls `streamTurn`, runs each requested tool client-side, appends the results and repeats, capped by `MAX_STEPS = 12` (`loop.js:8,74-115`). Tool errors are returned to the model as `Error: ...` strings (`loop.js:109`). Tracing wraps each round-trip in a `gen_ai.chat` span. The code matches ARCHITECTURE.md, but the doc's agent/ folder list (`docs/ARCHITECTURE.md:45-52`) omits `intent.js`, `policy.js` and `trace.js` in core. The loop and its tools run entirely in the browser, so any safety policy (goal-step evidence, approvals) is enforceable only client-side.

## Express and Vercel API layer

`server/index.js` serves `public/` and registers CRUD routes for docs, ideas and goals, plus web, jobs, google, trace and llm. `api/` mirrors these as Vercel functions. `/api/llm` is the only Edge function, and it shares `server/proxy.js` and `server/routing.js` (`api/llm.js:9-10`). The proxy strips the client `model` and `tier` and pins the model server-side (`server/proxy.js:18-23`). The `max_tokens` field is client-controlled with no upper bound. The Express route wraps handlers in `withTrace`, while the Vercel functions are separate files. The Google rewrite in `vercel.json:4-8` folds all Google actions into `api/google.js` for the Hobby plan. Per-user identity comes from `server/auth.js:11-13`, which always returns `dev`.

## Neon Postgres persistence

Docs, ideas, goals and traces are stored in Neon. `db/schema.sql` carries the base schema, but `server/db.js` and `public/js/features/goals/goals.js` also contain `ALTER TABLE` statements. That means schema evolution happens at runtime as well as in `npm run db:init`, matching the commit "self-migrating goal columns". The README says only the Library uses Neon, but ideas, goals and traces are now DB-backed too.

## localStorage state

`public/js/core/storage.js` persists chat, audit, memory, prefs and connector flags. It trims chat to 40 messages and audit to 150 (`storage.js:40-41`), and strips docs, ideas and plans (`storage.js:43`). It first tries a host-provided `agent.use("db")` doc and falls back to localStorage (`storage.js:20-30`). Failures are swallowed silently, and `flush` has no error surface. State is per-browser, so there is no cross-device sync, and the file's header comment about a host doc is not in the docs.

## Connectors and Chrome bridge (chrome-extension/)

Gmail and Calendar go through server-side OAuth routes in `server/index.js:84-93`. I did not read `server/google.js`. The Contacts and sample connectors are client-side. The browser bridge is a page-to-content-script-to-service-worker chain. `muse-bridge.js` accepts only same-window, same-origin messages (`muse-bridge.js:4`). `background.js` checks the sender origin against a fixed allowlist (`background.js:1,12`), requires a per-site host permission, and opens only http(s) URLs (`background.js:23,41`). The bridge has no per-action user approval in the extension itself; approval relies on the web app's approval cards. The README and ARCHITECTURE.md don't describe the bridge in the architecture, only in setup guides.

## Findings

6 findings: 6 verified against the code, 0 partly verified, 0 unverified.

### F1. No authentication: every API route, including the OpenAI proxy, runs as one shared user — High

**Area:** API layer / auth · **Category:** security

`currentUserId` returns the constant `dev` for every request. All docs, ideas, goals and trace routes are therefore open to anyone who can reach the deployment, and they share one dataset. `/api/llm` also has no auth or rate limit, so anyone can spend the OpenAI key. The Google OAuth cookie is per-browser, but the Neon data is not. The README acknowledges the hardcoded user, but a Vercel deployment at a public URL is exposed.

**Evidence**

- `server/auth.js:11-13` ✓ — `export function currentUserId(_req) {
  return DEV_USER_ID;`
- `server/index.js:111-113` ✓ — `app.post("/api/llm", async (req, res) => {`

**Recommendation:** Add real session auth in `currentUserId` and apply it to /api/llm. At a minimum add a shared-secret or access gate and a rate limit for any public deployment.

**Proposed feature:** Add authentication and per-user scoping to all API routes

### F2. LLM proxy forwards arbitrary client payload and unbounded max_tokens — Medium

**Area:** server/proxy.js · **Category:** security

Everything except tier, model and max_tokens is spread into the upstream payload. Clients can therefore send any OpenAI parameters (n, tools, etc.) and any max_tokens value, and only the model is pinned. Combined with the lack of auth, this makes cost control weak. The 6mb JSON limit also applies to the proxy.

**Evidence**

- `server/proxy.js:19-23` ✓ — `const { tier, model, max_tokens, ...rest } = body || {};`

**Recommendation:** Allowlist fields (messages, tools, stream, stream_options) and clamp max_tokens to a server maximum.

**Proposed chore:** Allowlist and clamp LLM proxy request fields

### F3. Agent safety logic and loop limits live only in the browser — Medium

**Area:** public/js/agent · **Category:** reliability

Tool execution, approvals and goal-step evidence rules run in client JS, so they are advisory. Any client can call the server routes directly, including the Gmail send route, which relies on the browser-side approval card. The loop caps iterations at 12 but has no per-tool timeout or abort beyond the signal. Note that a truncated final state (`MAX_STEPS` reached) returns the last text with no signal that the cap was hit.

**Evidence**

- `public/js/agent/loop.js:74` ✓ — `for (let step = 0; step < MAX_STEPS; step++) {`
- `server/index.js:90` ✓ — `app.post("/api/google/mail/send"`

**Recommendation:** Return a flag when MAX_STEPS is exhausted. Re-verify high-impact actions (mail send, calendar writes) server-side with a confirmation token, not only a client approval card.

**Proposed feature:** Server-side confirmation for write actions and loop-cap signal

### F4. Architecture docs omit many modules that now exist — Low

**Area:** docs/ARCHITECTURE.md · **Category:** doc drift

The folder map lists server/ as index, proxy, routing and jobs, and features as chat, ideas, goals, jobs, library, memory, connectors, settings and hood. The repo also has server/{auth,db,docs,goals,ideas,google,web,trace*,extract}, api/{google,trace,web,docs,goals,ideas,healthz}, features/{browser,web,observability}, agent/{intent,policy}, core/{api,trace} and chrome-extension/. The README says non-Library data is localStorage-only, but ideas and goals moved to Neon and the code strips them from localStorage. The tracing and OTel layer and the Chrome bridge are absent from the architecture doc.

**Evidence**

- `docs/ARCHITECTURE.md:66-71` ✓ — `jobs.js                  job-board search handler (no keys; shared with api/jobs/)`
- `public/js/core/storage.js:14` ✓ — `out.ideas = []; out.plans = []; // ideas & goals live on the server too (main.js)`

**Recommendation:** Update the folder map, the persistence description and the README. Add sections for observability, the browser bridge and the Google OAuth connectors.

**Proposed chore:** Refresh ARCHITECTURE.md and README persistence/folder docs

### F5. Browser bridge origin allowlist is hardcoded and broad host permission is requested — Low

**Area:** chrome-extension · **Category:** maintainability

The origins are hardcoded in both background.js and the manifest `content_scripts.matches`, so any other deployment needs code edits in two places. The extension can request `<all_urls>` as an optional host permission, and the `tabs` permission is also granted. The access model is reasonable, but it is an unreviewed prototype (version 0.1.0).

**Evidence**

- `chrome-extension/background.js:1` ✓ — `const MUSE_ORIGINS = new Set(["https://mini-muse-project.vercel.app", "http://localhost:3000"]);`
- `chrome-extension/manifest.json:7` ✓ — `"optional_host_permissions": ["<all_urls>"]`

**Recommendation:** Make the app origin a single configurable constant, and document the permission model in the architecture doc.

**Proposed chore:** Centralize bridge origin configuration

### F6. Runtime schema migrations and silent persistence failures — Low

**Area:** Persistence · **Category:** reliability

Goal columns migrate at runtime via ALTER TABLE in client-facing code paths (goals.js and server/db.js), not only via db:init, so deployed schema drift is possible. In localStorage, `flush` swallows write errors, so quota failures lose state silently.

**Evidence**

- `public/js/core/storage.js:45` ✓ — `catch (e) { try { localStorage.setItem(LS, JSON.stringify(body)); } catch (_) {} }`

**Recommendation:** Move migrations into db:init, or a versioned migration step. Surface save failures in the UI.

**Proposed chore:** Consolidate DB migrations and surface save errors

## Limitations

- Did not read server/google.js, so OAuth state and cookie handling and the token encryption are unverified.
- Did not read the SQL in server/docs.js, goals.js, ideas.js, db.js or trace-store.js, so SQL injection safety and user scoping in queries are unconfirmed.
- Did not read the feature modules (goals, jobs, library, browser), transport.js, policy.js or approvals.js in detail.
- Did not read chrome-extension/target.js or the popup, so page-reading and form-fill behavior is unreviewed.
- No tests were run, and the deployed behavior on Vercel was not observed.

<details><summary>Files read</summary>

- `docs/ARCHITECTURE.md`
- `server/index.js`
- `server/auth.js`
- `chrome-extension/background.js`
- `chrome-extension/manifest.json`
- `public/js/core/storage.js`
- `api/llm.js`
- `public/js/agent/loop.js`
- `server/proxy.js`
- `vercel.json`
- `chrome-extension/muse-bridge.js`
- `api/trace.js`

</details>
