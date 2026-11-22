---
title: Agent chat
type: Feature spec
featureId: agent-chat
status: Written from code
owner: Product Manager (Maya)
---

# Agent chat

**10 of 10** acceptance criteria checked against the code · 5 risks · 3 open questions

_Written by Maya from the code on 2026-11-22. It describes the feature as built, not as planned._

## Summary

**Lets a user ask Muse for something in plain words and watch it answer and act, using tools for goals, documents, connected services and the browser, with risky actions held for approval.**

Replies stream in as Muse writes them, and the user can stop a reply at any time. Muse can take up to 12 steps of tool use in one turn. Fast gives replies in seconds; Thorough uses a stronger model that can take up to a minute. When the assistant is unavailable or hits a usage limit, the chat says so in plain words. When the user asks to apply for a job, Muse can't use email in that turn.

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

| # | Given | When | Then | Where | In code |
|---|---|---|---|---|---|
| AC1 | the chat composer is focused with text entered | the user presses Enter without Shift | the form is submitted and the message is sent; Shift+Enter does not send | web | ✓ |
| AC2 | a turn is in progress | the user clicks Stop | the request is aborted. No error banner is shown for the cancellation | web | ✓ |
| AC3 | the model replies with tool calls | a turn runs | each tool is executed locally and its result is fed back to the model. The loop continues until the model answers or 12 steps are reached | web | ✓ |
| AC4 | the server has no OPENAI_API_KEY | the browser calls /api/llm | the server returns 503 with code no_api_key. The client maps it to sampling_disabled and chat is disabled with the message "The assistant isn't available on this account…" | API | ✓ |
| AC5 | a request carries tier "default" or any other value | the proxy builds the upstream request | "default" maps to the Thorough model and anything else maps to the quick model. A client-sent model is ignored | API | ✓ |
| AC6 | the provider returns HTTP 429 | a turn runs | the assistant message shows 'Muse hit a usage limit. Wait a minute, then send again.' | web | ✓ |
| AC7 | the chat is empty | the Chat page renders | a welcome screen with example prompt chips is shown. Clicking a chip fills the composer and submits it if the assistant is available and idle | web | ✓ |
| AC8 | a tool action needs approval | the assistant message renders | a card with the heading, detail rows, and Allow / Don't allow buttons is shown | web | ✓ |
| AC9 | the user asks to apply for a job and the message is not an email request | the model is called | mail_search and mail_send are removed from the tools offered for that turn | web | ✓ |
| AC10 | a reply stops because of the token limit | the turn finishes | the message shows 'The reply was cut short. Ask for less at once.' | web | ✓ |

_The code each criterion rests on is under Evidence, at the end._

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

## How it works

_For engineers: where the behavior above lives in the code._

The Chat page (features/chat/chat.js) submits to run() in agent/run.js, which records the message, starts a trace, applies a few deterministic shortcuts (document-step checks, a job-research nudge, opening an application link), then calls the loop in agent/loop.js. The loop posts the conversation and tool definitions to /api/llm via transport.js, streams the reply, runs requested tools in the browser and repeats up to MAX_STEPS = 12. server/proxy.js adds the API key and server/routing.js maps the tier to a model, so the browser never names one. agent/errors.js maps error codes to messages.

## Evidence

| # | Code | Quote |
|---|---|---|
| AC1 | `public/js/features/chat/chat.js:67` | `e.key === "Enter" && !e.shiftKey && !e.isComposing` |
| AC2 | `public/js/features/chat/chat.js:69` | `rt.ctl?.abort()` |
|  | `public/js/agent/run.js:174` | `if (e?.code !== "cancelled")` |
| AC3 | `public/js/agent/loop.js:8` | `export const MAX_STEPS = 12;` |
|  | `public/js/agent/loop.js:102` | `const out = await tool.execute(tu.input, { signal });` |
| AC4 | `server/proxy.js:16` | `status: 503, body: { code: "no_api_key"` |
|  | `public/js/agent/transport.js:27` | `if (serverCode === "no_api_key") code = "sampling_disabled";` |
|  | `public/js/agent/run.js:175` | `disableChat(ERR[e.code])` |
| AC5 | `server/routing.js:31` | `const tier = body && body.tier === "default" ? "default" : "quick";` |
|  | `server/proxy.js:19` | `Strip our 'tier' field and any client-sent model` |
| AC6 | `public/js/agent/transport.js:30` | `res.status === 429) code = "rate_limited"` |
|  | `public/js/agent/errors.js:5` | `Muse hit a usage limit. Wait a minute, then send again.` |
| AC7 | `public/js/features/chat/chat.js:40` | `Tell Muse what you want done` |
|  | `public/js/features/chat/chat.js:71` | `if (rt.sample && !rt.busy) $("form").requestSubmit();` |
| AC8 | `public/js/features/chat/chat.js:19` | `a.approval === "pending" && a.card` |
|  | `public/js/features/chat/chat.js:23` | `Don't allow</button>` |
| AC9 | `public/js/agent/run.js:160` | `tool.name !== "mail_search" && tool.name !== "mail_send"` |
| AC10 | `public/js/agent/run.js:169` | `The reply was cut short. Ask for less at once.` |

## Not confirmed from the code

- I did not read prompt.js, tools.js, intent.js, policy.js, core/*, workflow/approvals.js, server/index.js or api/llm.js.
- The clickable-link rendering (core/format.js rich) was not read.
- No tests were read, so nothing here is verified by QA.
- The quotes were copied from the numbered lines I read, but I did not run the app.
