---
status: accepted
paths:
  - public/js/agent
---

# ADR-0001: Run the agent loop in the browser, not on the server

**Date**: 2026-11-18
**Status**: superseded by [ADR-0009](0009-run-the-agent-loop-on-the-server.md)
**Deciders**: Recorded by Alex (Technical Lead) from the code
**Shipped**: Implemented

> Recorded from the code on 2026-11-18. The decision predates this record; its original date is not known.

## Context

Mini Muse is a no-build ES-module app. The chat agent streams model replies, runs tools and shows approval cards in the UI. Many tools are client-side by nature: local state, the Chrome bridge, and approval prompts that pause a turn.

## Decision

We run the agent loop (public/js/agent/loop.js) in the browser. It POSTs the conversation and tool definitions to /api/llm, runs the requested tools locally, and repeats for up to 12 steps. Tools reach server data through the REST APIs.

## Alternatives Considered

### Alternative 1: Server-side agent loop
- **Pros**: Secrets and tool logic stay server-side. Turns could continue after the tab closes.
- **Cons**: Approvals would need server-held pending state. Browser-only tools would need a relay.
- **Why not**: Approvals and browser tools sit naturally in the client, and the server stays a thin stateless proxy plus CRUD.

## Consequences

### Positive
- The server stays simple and stateless.
- Approval cards pause the turn in the UI.
- Streaming goes straight to the UI.

### Negative
- Guardrails such as step evidence are enforced in client code only.
- Turns are bound to an open tab.

### Risks
- Client-side rules can be bypassed by a modified client. The server validates only shapes and statuses, not step evidence.

## Evidence in the code

- `public/js/agent/loop.js`
- `public/js/agent/run.js`
- `server/proxy.js`
