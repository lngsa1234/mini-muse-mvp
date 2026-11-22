# Architecture Decision Records

Each record is a point-in-time decision: written once and not edited to match later changes — a later decision supersedes it. Where the system stands today is in the [architecture overview](../architecture/README.md).

| ADR | Title | Status | Date | Shipped |
|-----|-------|--------|------|---------|
| [0001](0001-run-the-agent-loop-in-the-browser-not-on-the-server.md) | Run the agent loop in the browser, not on the server | superseded by [0009](0009-run-the-agent-loop-on-the-server.md) | 2026-11-18 | yes |
| [0002](0002-proxy-llm-calls-server-side-with-a-pinned-model-and-a-tier.md) | Proxy LLM calls server-side with a pinned model and a tier | accepted | 2026-11-18 | yes |
| [0003](0003-share-request-handlers-between-express-and-vercel-functions.md) | Share request handlers between Express and Vercel functions | accepted | 2026-11-18 | yes |
| [0004](0004-store-documents-goals-ideas-and-traces-in-neon-postgres-scop.md) | Store documents, goals, ideas and traces in Neon Postgres, scoped by user_id | accepted | 2026-11-18 | yes |
| [0005](0005-single-seam-for-user-identity-with-a-hardcoded-dev-user.md) | Single seam for user identity with a hardcoded dev user | accepted | 2026-11-18 | yes |
| [0006](0006-keep-google-oauth-tokens-in-an-httponly-cookie-with-one-cons.md) | Keep Google OAuth tokens in an HttpOnly cookie, with one consent for Gmail and Calendar | accepted | 2026-11-18 | yes |
| [0007](0007-gate-agent-actions-on-approvals-and-tool-evidence.md) | Gate agent actions on approvals and tool evidence | accepted | 2026-11-18 | yes |
| [0008](0008-keep-chat-memory-and-settings-on-the-server-not-in-localstorage.md) | Keep chat, memory and settings on the server, not in localStorage | accepted | 2026-11-20 | yes |
| [0009](0009-run-the-agent-loop-on-the-server.md) | Run the agent loop on the server | accepted | 2026-11-20 | yes |
