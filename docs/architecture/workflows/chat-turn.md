---
title: How a chat turn runs
type: Workflow
owner: Alex (Technical Lead)
---

# How a chat turn runs

Repository: https://github.com/lngsa1234/mini-muse-project · Updated: 2026-11-20 for [ADR-0009](../../adr/0009-run-the-agent-loop-on-the-server.md)

A user message goes to the server. The server agent builds the prompt from the user's saved data, runs the tool loop against OpenAI, saves the assistant message as it goes, and streams progress back to the page.

**Starts when:** The user presses Send in chat, another page sends a message such as New goal, Do it or Ask Muse to move this forward, or the background check-in runs.

```mermaid
sequenceDiagram
  autonumber
  actor user as User
  participant client as Browser
  participant agent as Server agent
  participant data as Postgres
  participant external as OpenAI
  user->>client: Sends a message
  client->>agent: POST /api/agent/turn (text, tier, tz)
  agent->>data: Saves the user message and a live reply
  agent->>data: Reads memory, ideas, goals, settings
  agent->>external: Chat completion (stream)
  external-->>agent: Text and tool calls
  agent->>agent: Runs tools, repeats up to 12 steps
  agent-->>client: SSE: msg, text, phase, audit, data
  agent->>data: Saves the finished reply
  client->>client: Renders; other devices see it on their next load
```

## Steps

| # | Who | What happens | Hands to | Code |
|---|---|---|---|---|
| 1 | User | Submits a message from the composer or from a feature button. | Browser: `run(userMsg)` | `public/js/agent/run.js` |
| 2 | Browser | Shows the message, disables the composer and POSTs it with the response tier and the user's time zone. | Server: `POST /api/agent/turn` | `public/js/agent/run.js` |
| 3 | Server | Refuses if another turn for this user is still live. Saves the user message and a live assistant message. | Postgres: `chat_messages` | `server/agent/runtime.js`, `server/userdata.js` |
| 4 | Server | Builds the tool list (features, Web search setting, connected connectors) and runs the pre-model shortcuts: Library check for résumé steps, a job-research nudge, opening an application link in Chrome. |  | `server/agent/runtime.js`, `server/agent/tools/index.js` |
| 5 | Server | Builds the system prompt from saved memory, ideas, goals and connector settings, in the user's time zone, plus the last 18 chat messages. |  | `server/agent/prompt.js` |
| 6 | Server | Streams a model turn. The tier maps to a pinned model and the key never leaves the server. | External: `POST chat completions` | `server/agent/llm.js`, `server/proxy.js`, `server/routing.js` |
| 7 | Server | Runs each requested tool, records it in the activity log, and feeds the result back. Repeats up to 12 steps. Approvals and Chrome-bridge tools wait for the page (see [approvals](tool-approval.md)). |  | `server/agent/loop.js`, `server/agent/tools/*` |
| 8 | Server | Streams events to the page while it works and saves the message every few seconds. | Browser: `SSE msg / text / phase / audit / data / changed / done` | `server/agent/http.js` |
| 9 | Server | Ends the turn: expires unanswered approvals, marks the message not live, adds a truncation notice if needed, and saves it. | Postgres: `chat_messages` | `server/agent/runtime.js` |

## When it goes wrong

- No API key: the turn ends with sampling_disabled, and the page shows the assistant-unavailable message and disables the composer.
- Upstream 401, 403, 429 and 400 map to session_expired, not_granted, rate_limited, prompt_too_large or refused, as before.
- A tool that throws, or an unknown tool, goes back to the model as an 'Error: …' tool result instead of ending the turn.
- Stop (from any device) cancels the turn through `/api/agent/cancel`; no error is shown.
- If the page's stream drops, the turn keeps running on the server. The page polls `/api/state` until the message is no longer live.
- Another turn already live: the server answers `busy` and the page puts the text back in the composer.
