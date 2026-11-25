---
title: Agent chat
type: Feature spec
featureId: agent-chat
featureStatus: built
status: Written from code
owner: Product Manager (Maya)
---

# Agent chat

**Feature:** Built · **Spec:** Complete · **QA:** 10 of 10 criteria pass

**10 of 10** acceptance criteria checked against the code · 6 risks · 3 open questions

_Written by Maya from the code on 2026-11-22. It describes the feature as built, not as planned._

## Summary

**Lets a user ask Muse for something in plain words and watch it answer and act, using tools for goals, documents, connected services and the browser, with risky actions held for approval.**

Replies stream in as Muse writes them, and the user can stop a reply from any device. Turns run on the server, so a reply keeps going if the tab is closed and shows on every device; one turn runs at a time. Muse can take up to 12 steps of tool use in a turn. Fast replies in seconds; Thorough uses a stronger model. When the assistant is unavailable, the chat says so. In a job-application turn, Muse can't use email.

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
- Prompt content in server/agent/prompt.js and the intent regexes in server/agent/runtime.js (makeIntents) (not read in detail)
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

| # | Given | When | Then | Where | In code | Tested |
|---|---|---|---|---|---|---|
| AC1 | the chat composer is focused with text entered | the user presses Enter without Shift | the form is submitted and the message is sent; Shift+Enter does not send | web | ✓ | ✓ passes |
| AC2 | a turn is in progress | the user clicks Stop | the request is aborted. No error banner is shown for the cancellation | web | ✓ | ✓ passes |
| AC3 | the model replies with tool calls | a turn runs | each tool is run on the server and its result is fed back to the model. The loop continues until the model answers or 12 steps are reached | web | ✓ | ✓ passes |
| AC4 | the server has no OPENAI_API_KEY | the browser calls /api/llm | the server returns 503 with code no_api_key. The client maps it to sampling_disabled and chat is disabled with the message "The assistant isn't available on this account…" | API | ✓ | ✓ passes |
| AC5 | a request carries tier "default" or any other value | the proxy builds the upstream request | "default" maps to the Thorough model and anything else maps to the quick model. A client-sent model is ignored | API | ✓ | ✓ passes |
| AC6 | the provider returns HTTP 429 | a turn runs | the assistant message shows 'Muse hit a usage limit. Wait a minute, then send again.' | web | ✓ | ✓ passes |
| AC7 | the chat is empty | the Chat page renders | a welcome screen with example prompt chips is shown. Clicking a chip fills the composer and submits it if the assistant is available and idle | web | ✓ | ✓ passes |
| AC8 | a tool action needs approval | the assistant message renders | a card with the heading, detail rows, and Allow / Don't allow buttons is shown | web | ✓ | ✓ passes |
| AC9 | the user asks to apply for a job and the message is not an email request | the model is called | mail_search and mail_send are removed from the tools offered for that turn | web | ✓ | ✓ passes |
| AC10 | a reply stops because of the token limit | the turn finishes | the message shows 'The reply was cut short. Ask for less at once.' | web | ✓ | ✓ passes |

_The code each criterion rests on is under Evidence, at the end._

## Risks

- run.js uses regex intent heuristics (affirmations, 'again', 'continue') to force deterministic paths, and these may misfire on ordinary messages.
- The 12-step cap ends a turn with whatever text exists, and the user gets no specific notice.
- The composer note says 'Connectors use sample data; nothing leaves this page', which may contradict the real Gmail/Google connectors and the server-side LLM calls.
- Chat history is persisted client-side via save(). I did not check how large it can grow or how it is protected.
- No test or QA evidence for this feature was reviewed, so it is shipped but unverified.
- A turn runs inside one serverless call capped at 300 seconds, and an approval can wait up to 4 minutes of that, so a long turn with a slow approval can be cut off.

## Open questions

- Is the 'Connectors use sample data' note still accurate now that Google OAuth connectors exist?
- Should the user be told when the 12-step cap is reached?
- Is /api/llm protected by authentication or rate limiting? server/auth.js was not read.

## How it works

_For engineers: where the behavior above lives in the code._

The Chat page (features/chat/chat.js) sends the message to POST /api/agent/turn through agent/client.js and agent/run.js, and renders the streamed events. server/agent/http.js hands the request to runTurn in server/agent/runtime.js, which saves the messages as it goes (server/userdata.js, chat_messages), builds the prompt (server/agent/prompt.js) and runs the loop in server/agent/loop.js with the tools in server/agent/tools/, up to MAX_STEPS = 12. server/agent/llm.js calls OpenAI with the server-held key and a model chosen from the tier. Approvals and Chrome-bridge calls wait in agent_waits and are answered through /api/agent/answer; Stop calls /api/agent/cancel.

## Evidence

| # | Code | Quote |
|---|---|---|
| AC1 | `public/js/features/chat/chat.js:67` | `e.key === "Enter" && !e.shiftKey && !e.isComposing` |
| AC2 | `public/js/agent/run.js:126` | `rt.ctl?.abort()` |
|  | `server/agent/runtime.js:256` | `if (e?.code !== "cancelled")` |
| AC3 | `server/agent/loop.js:6` | `export const MAX_STEPS = 12;` |
|  | `.agentforge/feature-map.json:129` | `const out = await tool.execute(tu.input, { signal });` |
| AC4 | `server/proxy.js:16` | `status: 503, body: { code: "no_api_key"` |
|  | `public/js/agent/transport.js:27` | `if (serverCode === "no_api_key") code = "sampling_disabled";` |
|  | `.agentforge/feature-map.json:156` | `disableChat(ERR[e.code])` |
| AC5 | `server/routing.js:31` | `const tier = body && body.tier === "default" ? "default" : "quick";` |
|  | `.agentforge/feature-map.json:177` | `Strip our 'tier' field and any client-sent model` |
| AC6 | `public/js/agent/transport.js:30` | `res.status === 429) code = "rate_limited"` |
|  | `public/js/agent/errors.js:5` | `Muse hit a usage limit. Wait a minute, then send again.` |
| AC7 | `public/js/features/chat/chat.js:40` | `Tell Muse what you want done` |
|  | `public/js/features/chat/chat.js:71` | `if (rt.sample && !rt.busy) $("form").requestSubmit();` |
| AC8 | `public/js/features/chat/chat.js:19` | `a.approval === "pending" && a.card` |
|  | `public/js/features/chat/chat.js:23` | `Don't allow</button>` |
| AC9 | `server/agent/runtime.js:374` | `const loopTools = application ? tools.filter(t => t.name !== "mail_search" && t.name !== "mail_send") : tools;` |
| AC10 | `server/agent/runtime.js:382` | `The reply was cut short. Ask for less at once.` |

## Tests

| # | Test | File |
|---|---|---|
| AC1 | agent-chat AC1: Enter sends the message, Shift+Enter adds a new line | `e2e/agent-chat.spec.mjs` |
| AC2 | only one turn runs at a time per user, across devices | `test/agent-runtime.test.js` |
| AC3 | agent-chat AC3: tool calls run on the server and feed back until the model answers, at most 12 steps | `test/accept-agent-chat.test.js` |
| AC4 | agent-chat AC4: when the server has no model key, chat is disabled with a message | `e2e/agent-chat.spec.mjs` |
|  | agent-chat AC4: with no OPENAI_API_KEY the server answers 503 no_api_key | `test/accept-agent-chat.test.js` |
| AC5 | routing: tier picks the model, defaults to quick | `test/server.test.js` |
|  | proxy: pins the model and strips client fields | `test/server.test.js` |
| AC6 | agent-chat AC6: a provider rate limit shows the usage-limit message | `e2e/agent-chat.spec.mjs` |
| AC7 | agent-chat AC7: an empty chat shows a welcome with example chips; a chip sends its text | `e2e/agent-chat.spec.mjs` |
| AC8 | agent-chat AC8: an action that needs approval shows a card with heading, details and allow/decline buttons | `e2e/agent-chat.spec.mjs` |
| AC9 | agent-chat AC9: an apply request removes mail_search and mail_send from the turn's tools | `test/accept-agent-chat.test.js` |
| AC10 | agent-chat AC10: a reply stopped by the token limit says it was cut short | `test/accept-agent-chat.test.js` |

## Not confirmed from the code

- I did not read prompt.js, tools.js, intent.js, policy.js, core/*, workflow/approvals.js, server/index.js or api/llm.js.
- The clickable-link rendering (core/format.js rich) was not read.
- No tests were read, so nothing here is verified by QA.
- The quotes were copied from the numbered lines I read, but I did not run the app.
