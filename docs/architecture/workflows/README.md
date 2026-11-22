---
title: Workflows
type: Workflow
owner: Alex (Technical Lead)
---

# Workflows

How the product works at runtime, flow by flow. Mapped by Alex from the code on 2026-11-22; every step's code is checked against the repository.

- [How a chat turn runs](chat-turn.md) — A user message goes to the server agent. It builds the prompt from the user's saved data, runs the tool loop against OpenAI, saves the reply as it goes, and streams progress to the page.
- [How sensitive actions get approval](tool-approval.md) — A tool that changes something pauses the turn and shows an approval card in chat. It continues only after the user answers.
- [How a goal step advances](goal-step-progress.md) — Muse creates a goal with a plan and moves a step to doing or done only when a tool did that step's work in the same turn. Application statuses are checked against proof in the same way.
- [How Google connectors sign in](google-connect.md) — Gmail and Calendar share one Google sign-in. The server keeps the tokens in an HttpOnly cookie, and the browser only learns whether Google is connected.
- [How documents enter the Library](library-ingest.md) — A user pastes text or uploads a file. The server stores only the extracted text, and the agent can then search and cite it.
- [How the daily check-in runs](daily-check-in.md) — Once a day, or when the user clicks the button, Muse works on the user’s goals without being asked and leaves a short progress brief in chat. It only runs while the app is open.
- [How Muse fills an application in Chrome](browser-bridge-fill.md) — Muse fills in a job application in the user’s own Chrome tab through the optional extension, and only submits it after the user has reviewed it and approved.
- [How turns are traced](tracing.md) — Each chat turn and model call is recorded as a trace, with prompts, replies and tool inputs and outputs, so the builder can replay it on the Observability page.

## Not confirmed

- The check-in steps that search Gmail and update applications follow the check-in instruction; which tools the model calls depends on the model.
- I did not read the extension popup that grants site access.

