# ADR-0009: Run the agent loop on the server

**Date**: 2026-11-20
**Status**: accepted
**Deciders**: Ling
**Shipped**: Implemented
**Supersedes**: [ADR-0001](0001-run-the-agent-loop-in-the-browser-not-on-the-server.md)

## Context

ADR-0001 ran the agent loop in the browser and listed its costs: guardrails such as step evidence ran only in client code, so a modified client could skip them, and a turn was bound to an open tab. Goals make this worse: an agent working toward "land 3 interviews in 30 days" should not need a tab open, and its proof rules are what make its progress trustworthy. With chat and memory on the server (ADR-0008), the browser no longer holds the state the loop needs.

## Decision

The server runs the turn (`server/agent/`):

- `POST /api/agent/turn` saves the user message, builds the system prompt from the user's saved memory, ideas, goals and connector settings, runs the tool loop (12-step cap), and saves the assistant message as it goes. Progress streams back as Server-Sent Events.
- Tools are defined on the server (`server/agent/tools/`), one module per feature with its guidance. Evidence rules and approvals are enforced there.
- An approval card is saved in the message, and the turn waits on a row in `agent_waits`. The user answers through `POST /api/agent/answer` from any device showing the chat. Unanswered cards expire (4 minutes by default, `AGENT_APPROVAL_TIMEOUT_MS`).
- Chrome Browser Bridge tools can only run in the tab that started the turn. The server sends a `client_tool` event, the tab runs the tool, and the result comes back through the same answer endpoint.
- Stop works from any device (`POST /api/agent/cancel`). One turn runs at a time per user.
- The page keeps no tool code except the browser-bridge executor. Pure modules (goal model, intent checks, safety rules, document ranking, fit scoring) are shared from `public/js` so tests and evals use one copy.

## Alternatives Considered

### Alternative 1: Keep the browser loop and only sync chat (ADR-0008 alone)
- **Pros**: Small change.
- **Cons**: Guardrails stay bypassable and turns stay bound to the tab.
- **Why not**: It fixes the symptom, not the goal-agent problem.

### Alternative 2: A job queue with a separate worker
- **Pros**: Turns survive any request, and scheduled check-ins become easy.
- **Cons**: A queue and a worker to deploy and operate.
- **Why not**: Too much for now. The runtime takes plain dependencies (store, repo, llm, services), so it can move into a worker later without changes.

## Consequences

### Positive
- Approvals and evidence rules can't be skipped by a modified client.
- A turn keeps running if the tab closes (on the Express server), and its result is waiting on every device.
- Approvals can be answered from another device.

### Negative
- On Vercel, a turn is limited by the function's maxDuration (300s in vercel.json), including time spent waiting for an approval.
- Gmail and Calendar tools use the Google cookie of the request that started the turn. A future scheduled check-in with no browser request would need server-held Google tokens (a change to ADR-0006).
- A refreshed Google access token can't be written back to the cookie mid-stream, so it is refreshed again on the next call.

### Risks
- A crashed server leaves a message marked live. It is treated as ended after 10 minutes.

## Evidence in the code

- `server/agent/runtime.js`
- `server/agent/http.js`
- `server/agent/tools/index.js`
- `public/js/agent/run.js`
- `test/agent-runtime.test.js`
