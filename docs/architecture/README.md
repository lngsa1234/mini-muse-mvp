---
title: Architecture overview — Mini Muse
type: Reference
status: Living
owner: Alex (Technical Lead)
---

# Architecture overview — Mini Muse

A **living** map of the system: what it is today, where it is heading, and which decision governs each part. Read this first, then follow the links.

This page is deliberately thin. The detail lives in the decision records, which are **point-in-time deltas**: written once, not edited as the system evolves. *This* page is kept current — when a decision ships, it moves from "where we are going" to "today", and the record stays as written.

## System today

Mini Muse is a no-build browser app whose chat agent loop runs client-side. A Node/Express server (or Vercel functions) provides the REST APIs and an LLM proxy. A chat turn goes from the browser to the proxy, which adds the API key and streams OpenAI's reply back. The browser then runs tools locally, and those tools call the server APIs for goals, ideas, documents, web search, jobs and Google. The server reads and writes Postgres.

- [System context](c4-context.md) — who uses it and what it depends on (C4 level 1)
- [Containers](c4-containers.md) — its deployable parts and how they talk (C4 level 2)
- [Workflows](workflows/README.md) — a chat turn runs; sensitive actions get approval; a goal step advances; google connectors sign in; documents enter the library

| Part | Layer | Technology | Governed by |
|---|---|---|---|
| Browser app and agent | client | ES modules | [ADR-0001](../adr/0001-run-the-agent-loop-in-the-browser-not-on-the-server.md), [ADR-0007](../adr/0007-gate-agent-actions-on-approvals-and-tool-evidence.md) |
| Browser storage | data | localStorage | [ADR-0001](../adr/0001-run-the-agent-loop-in-the-browser-not-on-the-server.md), [ADR-0004](../adr/0004-store-documents-goals-ideas-and-traces-in-neon-postgres-scop.md) |
| API server | server | Express / Vercel functions | [ADR-0001](../adr/0001-run-the-agent-loop-in-the-browser-not-on-the-server.md), [ADR-0002](../adr/0002-proxy-llm-calls-server-side-with-a-pinned-model-and-a-tier.md), [ADR-0003](../adr/0003-share-request-handlers-between-express-and-vercel-functions.md), [ADR-0006](../adr/0006-keep-google-oauth-tokens-in-an-httponly-cookie-with-one-cons.md) |
| Postgres database | data | Neon Postgres | [ADR-0004](../adr/0004-store-documents-goals-ideas-and-traces-in-neon-postgres-scop.md) |
| OpenAI API | external | Chat Completions | — |
| Google APIs | external | OAuth 2.0, Gmail, Calendar | [ADR-0006](../adr/0006-keep-google-oauth-tokens-in-an-httponly-cookie-with-one-cons.md) |
| Web search and job boards | external | Tavily, Greenhouse/Lever/Ashby | — |
| Chrome bridge extension | client | Chrome extension | — |

## Where we are vs. where we are going

Nothing is planned. When a plan changes the architecture, its decision appears here until it ships.

## The decisions (decision trail)

| Decision | Status | Shipped | Owns |
|---|---|---|---|
| [ADR-0001](../adr/0001-run-the-agent-loop-in-the-browser-not-on-the-server.md) Run the agent loop in the browser, not on the server | accepted | yes | We run the agent loop (public/js/agent/loop.js) in the browser. It POSTs the conversation and tool definitions to /api/llm, runs the requested tools locally, and repeats for up to 12 steps. Tools reach server data through the REST APIs. |
| [ADR-0002](../adr/0002-proxy-llm-calls-server-side-with-a-pinned-model-and-a-tier.md) Proxy LLM calls server-side with a pinned model and a tier | accepted | yes | We route calls through server/proxy.js. It injects OPENAI_API_KEY, strips any client-sent model, and sets the model via routeModel from a tier (quick or default). A missing key returns 503 no_api_key. The proxy is runtime-neutral, so Express and the Vercel Edge function share it. |
| [ADR-0003](../adr/0003-share-request-handlers-between-express-and-vercel-functions.md) Share request handlers between Express and Vercel functions | accepted | yes | We write runtime-neutral handlers that take a userId and parsed input and return { status, json }. server/index.js and the thin api/* Vercel functions both call them. The Google routes go through one adapter, server/google-route.js. |
| [ADR-0004](../adr/0004-store-documents-goals-ideas-and-traces-in-neon-postgres-scop.md) Store documents, goals, ideas and traces in Neon Postgres, scoped by user_id | accepted | yes | We store documents, goals, ideas and traces in Postgres through server/db.js, keyed by user_id. Only extracted document text is stored, never the original file. localStorage keeps chat, preferences and connector state. |
| [ADR-0005](../adr/0005-single-seam-for-user-identity-with-a-hardcoded-dev-user.md) Single seam for user identity with a hardcoded dev user | accepted | yes | We resolve every request to one user through currentUserId in server/auth.js, which returns DEV_USER_ID (default 'dev'). Every handler takes a userId from that function. |
| [ADR-0006](../adr/0006-keep-google-oauth-tokens-in-an-httponly-cookie-with-one-cons.md) Keep Google OAuth tokens in an HttpOnly cookie, with one consent for Gmail and Calendar | accepted | yes | We run the OAuth flow on the server (/api/google/authorize and /callback) and keep tokens in an HttpOnly cookie. The browser only learns connected or not through /api/google/status. Gmail and Calendar share one consent. |
| [ADR-0007](../adr/0007-gate-agent-actions-on-approvals-and-tool-evidence.md) Gate agent actions on approvals and tool evidence | accepted | yes | We require a non-bookkeeping tool to have run in the same turn, matching the cited evidence, before a goal step becomes doing or done. Application statuses need proof. Write tools show approval cards, and mail_send always asks. |

All records: [docs/adr](../adr/README.md).

## Invariants (hold across today and the target)

- **The browser never names a model or holds the API key. The proxy strips client model fields and pins the model from the tier.** (`server/proxy.js`, `server/routing.js`)
- **Every server handler is scoped by a userId obtained only from currentUserId, and returns { status, json }.** (`server/auth.js`, `server/goals.js`, `server/docs.js`, `server/ideas.js`)
- **A goal step moves to doing or done only when a matching tool ran in the same turn. The model has no bypass.** (`public/js/features/goals/goals.js`, `public/js/agent/run.js`)
- **mail_send always requires user approval, and the Gmail permission cannot be set to Allow.** (`public/js/features/connectors`, `public/js/workflow/approvals.js`)
- **Tool errors return to the model as 'Error: ...' results, and a turn is capped at 12 steps.** (`public/js/agent/loop.js`)

## Keeping this current

- **A plan that changes the architecture** (a new or removed container, data store, external system or connection, or a change to authentication, security or a technology choice) carries its decision record. The record is *proposed* with the plan and *accepted* when the plan is approved.
- **When the work ships**, the record is marked shipped, it moves to "today" above, and Alex maps the architecture again. The record itself is not edited.
- **If today and a record disagree**, this page wins for current state; the record is history.

_Kept by AgentForge for https://github.com/lngsa1234/mini-muse-mvp. Every file reference is checked against the repository._
