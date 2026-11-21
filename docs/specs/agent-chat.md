---
title: Agent chat
type: Feature spec
featureId: agent-chat
status: Written from code
owner: Product Manager (Maya)
---

# Agent chat

_Written by Maya from the code on 2026-11-21. It describes the feature as built._

## Summary

Agent Chat lets a user type a request to the Muse assistant. The assistant answers with streamed text and runs tools (Library, goals, connectors, browser bridge) on the user's behalf. Sensitive actions show as approval cards.

The Chat page has a message log, an examples welcome screen, and a composer. Submitting a message calls run() in public/js/agent/run.js. run() pushes the user message and a live assistant placeholder, starts a trace, builds the tools and prompt, and calls the agent loop. Before the model is called, run() applies deterministic shortcuts: Library verification for document goal steps, a job-research nudge, and opening an application link in Chrome. The loop in agent/loop.js POSTs the conversation and tool definitions to /api/llm through transport.js. It streams the SSE reply into the message, executes any requested tools locally, feeds the results back, and repeats up to 12 steps. The server proxy (server/proxy.js) injects the API key and maps the tier (Fast = quick, Thorough = default) to a model, so the browser never names a model. Errors map to user-facing messages. This spec describes the code as read; QA has not verified it.

## User stories

- As a user, I want to send a message and see Muse's reply stream in, so that I get answers without waiting for the full response.
- As a user, I want to stop a response in progress, so that I can cancel a turn I no longer want.
- As a user, I want clear error messages when the assistant is unavailable or rate-limited, so that I know how to recover.
- As a user, I want example prompts on an empty chat, so that I can see what Muse can do.
- As a user, I want to see which tools Muse ran and to approve sensitive actions, so that I stay in control.

## Scope

**In scope**

- Chat page rendering: welcome screen with example chips, message log, tool-activity rows, approval cards
- Composer: Enter to send, Shift+Enter for newline, Stop button that cancels the in-flight turn
- Agent loop: streaming, tool execution, 12-step cap, truncation notice
- LLM proxy: server-side key injection and tier-to-model routing
- Error-to-message mapping
- Pre-model intent shortcuts in run.js: document-step verification, job-research nudge, open application link

**Out of scope**

- Internals of individual tools, such as Library, Goals, Ideas, Gmail and the Chrome extension
- Approval workflow logic in workflow/approvals.js (not read)
- Prompt content in agent/prompt.js and the intent regexes in agent/intent.js (not read in detail)
- Tracing and observability backend
- Settings page, memory and reset

## Requirements

| ID | Requirement |
|---|---|
| FS-R01 | Pressing Enter without Shift submits the composer text; Shift+Enter inserts a newline; empty text or a busy state does nothing. |
| FS-R02 | While a turn runs, the Send button is hidden, the Stop button is shown, and the input and check-in button are disabled. |
| FS-R03 | The agent loop repeats model calls while the model requests tools, up to 12 steps. |
| FS-R04 | Tool errors and unknown tools are returned to the model as 'Error: …' tool results instead of crashing the turn. |
| FS-R05 | The browser sends only a tier; the server pins the model (quick = gpt-4o-mini, default = gpt-4o unless overridden by env). |
| FS-R06 | If the server has no API key, the proxy returns 503 code no_api_key and the UI shows the 'assistant isn't available' message and disables the composer. |
| FS-R07 | A reply that ends at the token limit shows 'The reply was cut short. Ask for less at once.' |
| FS-R08 | Pending approvals are rendered as cards with Allow and Don't allow buttons. |
| FS-R09 | When the user asks to apply, the Gmail tools (mail_search, mail_send) are withheld from the model for that turn. |

## Acceptance criteria

- **AC1** ✓ (web): Given The chat composer is focused with text entered, when The user presses Enter without Shift, then The form is submitted and the message is sent; Shift+Enter does not send..
  - `public/js/features/chat/chat.js:67`: `e.key === "Enter" && !e.shiftKey && !e.isComposing`
- **AC2** ✓ (web): Given A turn is in progress, when The user clicks Stop, then The request is aborted. No error banner is shown for the cancellation..
  - `public/js/features/chat/chat.js:69`: `rt.ctl?.abort()`
  - `public/js/agent/run.js:174`: `if (e?.code !== "cancelled")`
- **AC3** ✓ (web): Given The model replies with tool calls, when A turn runs, then Each tool is executed locally and its result is fed back to the model. The loop continues until the model answers or 12 steps are reached..
  - `public/js/agent/loop.js:8`: `export const MAX_STEPS = 12;`
  - `public/js/agent/loop.js:102`: `const out = await tool.execute(tu.input, { signal });`
- **AC4** ✓ (API): Given The server has no OPENAI_API_KEY, when The browser calls /api/llm, then The server returns 503 with code no_api_key. The client maps it to sampling_disabled and chat is disabled with the message "The assistant isn't available on this account…"..
  - `server/proxy.js:16`: `status: 503, body: { code: "no_api_key"`
  - `public/js/agent/transport.js:27`: `if (serverCode === "no_api_key") code = "sampling_disabled";`
  - `public/js/agent/run.js:175`: `disableChat(ERR[e.code])`
- **AC5** ✓ (API): Given A request carries tier "default" or any other value, when The proxy builds the upstream request, then "default" maps to the Thorough model and anything else maps to the quick model. A client-sent model is ignored..
  - `server/routing.js:31`: `const tier = body && body.tier === "default" ? "default" : "quick";`
  - `server/proxy.js:19`: `Strip our 'tier' field and any client-sent model`
- **AC6** ✓ (web): Given The provider returns HTTP 429, when A turn runs, then The assistant message shows 'Muse hit a usage limit. Wait a minute, then send again.'..
  - `public/js/agent/transport.js:30`: `res.status === 429) code = "rate_limited"`
  - `public/js/agent/errors.js:5`: `Muse hit a usage limit. Wait a minute, then send again.`
- **AC7** ✓ (web): Given The chat is empty, when The Chat page renders, then A welcome screen with example prompt chips is shown. Clicking a chip fills the composer and submits it if the assistant is available and idle..
  - `public/js/features/chat/chat.js:40`: `Tell Muse what you want done`
  - `public/js/features/chat/chat.js:71`: `if (rt.sample && !rt.busy) $("form").requestSubmit();`
- **AC8** ✓ (web): Given A tool action needs approval, when The assistant message renders, then A card with the heading, detail rows, and Allow / Don't allow buttons is shown..
  - `public/js/features/chat/chat.js:19`: `a.approval === "pending" && a.card`
  - `public/js/features/chat/chat.js:23`: `Don't allow</button>`
- **AC9** ✓ (web): Given The user asks to apply for a job and the message is not an email request, when The model is called, then mail_search and mail_send are removed from the tools offered for that turn..
  - `public/js/agent/run.js:160`: `tool.name !== "mail_search" && tool.name !== "mail_send"`
- **AC10** ✓ (web): Given A reply stops because of the token limit, when The turn finishes, then The message shows 'The reply was cut short. Ask for less at once.'..
  - `public/js/agent/run.js:169`: `The reply was cut short. Ask for less at once.`

## Risks

- run.js uses regex intent heuristics (affirmations, 'again', 'continue') to force deterministic paths, and these may misfire on ordinary messages.
- The 12-step cap ends a turn with whatever text exists, and the user gets no specific notice.
- The composer note says 'Connectors use sample data; nothing leaves this page', which may contradict the real Gmail/Google connectors and the server-side LLM calls.
- Chat history is persisted client-side via save(). I did not check how large it can grow or how it is protected.
- No test or QA evidence for this feature was reviewed, so it is shipped but unverified.

## Open questions

- Is the 'Connectors use sample data' note still accurate now that Google OAuth connectors exist?
- Should the user be told when the 12-step cap is reached?
- Is /api/llm protected by authentication or rate limiting? server/auth.js was not read.

## Not confirmed from the code

- I did not read prompt.js, tools.js, intent.js, policy.js, core/*, workflow/approvals.js, server/index.js or api/llm.js.
- The clickable-link rendering (core/format.js rich) was not read.
- No tests were read, so nothing here is verified by QA.
- The quotes were copied from the numbered lines I read, but I did not run the app.
