---
title: Workflows
type: Workflow
owner: Alex (Technical Lead)
---

# Workflows

How the product works at runtime, flow by flow. Mapped by Alex from the code on 2026-11-22; every step's code is checked against the repository.

- [How a chat turn runs](chat-turn.md) — A message goes to the agent runtime on the server, which saves it, builds the prompt from the user’s saved data, calls the model and runs the tools it asks for, and streams progress back to the page. The turn keeps going if the tab closes.
- [How sensitive actions get approval](tool-approval.md) — Before a tool changes or sends something, the agent runtime saves an approval card and waits. The user answers on any device; the change runs only if they approved.
- [How a goal step advances](goal-step-progress.md) — A goal is planned as steps, and a step only moves forward when a tool did real work in the same turn. The agent runtime enforces this on the server.
- [How Google connectors sign in](google-connect.md) — Gmail and Calendar share one Google sign-in. The server keeps the tokens in an HttpOnly cookie, and the browser only learns whether Google is connected.
- [How documents enter the Library](library-ingest.md) — A user pastes text or uploads a file. The server stores only the extracted text, and the agent can then search and cite it.
- [How the daily check-in runs](daily-check-in.md) — Once a day, or when the user clicks the button, the open app starts a turn in which Muse works on the user’s goals without being asked and leaves a short progress brief. The turn runs on the server, but only an open app can start it.
- [How Muse fills an application in Chrome](browser-bridge-fill.md) — Muse fills in a job application in the user’s own Chrome tab: the agent runtime on the server asks the Mini Muse tab that started the turn to run each browser tool through the extension, and only submits after the user approves.
- [How turns are traced](tracing.md) — Each chat turn is recorded as a trace on the server, with the model calls and each tool as spans, so the builder can replay it on the Observability page. The browser still sends its own spans for page activity.

## Not confirmed

- The check-in steps that search Gmail and update applications follow the check-in instruction; which tools the model calls depends on the model.
- I did not read the extension popup that grants site access.

