---
title: Workflows
type: Workflow
owner: Alex (Technical Lead)
---

# Workflows

How the product works at runtime, flow by flow. Mapped by Alex from the code on 2026-11-18; every step's code is checked against the repository.

- [How a chat turn runs](chat-turn.md) — A user message goes through a few built-in shortcuts, then through a model-and-tools loop that runs in the browser. The model's reply streams back into the chat.
- [How sensitive actions get approved](tool-approval.md) — A tool that changes something outside the app pauses the turn and shows an approval card in chat. It continues only after the user answers.
- [How a goal step advances](goal-step-progress.md) — Muse creates a goal with steps and may mark a step doing or done only when a tool did that step's work in the same turn. Job applications are tracked with the same kind of proof.
- [How Google connectors sign in](google-connect.md) — Gmail and Calendar share one Google sign-in. The server keeps the tokens in a cookie, and the browser only learns whether Google is connected.
- [How documents enter the Library](library-ingest.md) — A user pastes text or uploads a file. The server keeps only the extracted text, and the agent can then search and cite it.

## Not confirmed

- Not read: the Chrome extension, the application-form fill flow, and the Ideas and jobs_search tools.
- Not read: the server Google handlers, so the OAuth redirect, callback and cookie handling are inferred from the route adapter and the connectors page.
- Not read: the client API module, the goals server handlers and database, and the tracing backend. Their steps are described only at the level the callers show.
- Not read: the prompt builder and intent regexes, which I treated as black boxes.
- I did not confirm the server-side model routing details.
