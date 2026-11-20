---
title: Workflows
type: Workflow
owner: Alex (Technical Lead)
---

# Workflows

How the product works at runtime, flow by flow. Mapped by Alex from the code on 2026-11-18; every step's code is checked against the repository.

- [How a chat turn runs](chat-turn.md) — A user message goes to the server agent. It builds the prompt from the user's saved data, runs the tool loop against OpenAI, saves the reply as it goes, and streams progress to the page.
- [How sensitive actions get approval](tool-approval.md) — A tool that changes something pauses the turn and shows an approval card in chat. It continues only after the user answers.
- [How a goal step advances](goal-step-progress.md) — Muse creates a goal with a plan and moves a step to doing or done only when a tool did that step's work in the same turn. Application statuses are checked against proof in the same way.
- [How Google connectors sign in](google-connect.md) — Gmail and Calendar share one Google sign-in. The server keeps the tokens in an HttpOnly cookie, and the browser only learns whether Google is connected.
- [How documents enter the Library](library-ingest.md) — A user pastes text or uploads a file. The server stores only the extracted text, and the agent can then search and cite it.

## Not confirmed

- I did not read the Library UI code, server/db.js, server/extract.js, server/google.js, the API route wrappers or server/index.js. Those steps rely on the handler code I read and on the existing workflow docs.
- I did not read server/routing.js or api/llm.js. The tier-to-model mapping comes from the proxy and the agent-chat spec.
- The calls the mail, calendar and contacts tools make, and the Google OAuth details, are described only at route level.
- The Ideas flows, web and job search tools, daily check-in and the Chrome bridge extension are not mapped as flows. I saw them only where run.js calls the browser tools.
- I did not read the prompt and intent code, so the shortcut triggers are described only at the level visible in run.js.
