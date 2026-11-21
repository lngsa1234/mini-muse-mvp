---
status: accepted
paths:
  - server/proxy.js
  - server/routing.js
  - api/llm.js
---

# ADR-0002: Proxy LLM calls server-side with a pinned model and a tier

**Date**: 2026-11-18
**Status**: accepted
**Deciders**: Recorded by Alex (Technical Lead) from the code
**Shipped**: Implemented

> Recorded from the code on 2026-11-18. The decision predates this record; its original date is not known.

## Context

The browser needs a model, but an API key must not reach it and the model choice should be controllable. The proxy must run both locally and on Vercel.

## Decision

We route calls through server/proxy.js. It injects OPENAI_API_KEY, strips any client-sent model, and sets the model via routeModel from a tier (quick or default). A missing key returns 503 no_api_key. The proxy is runtime-neutral, so Express and the Vercel Edge function share it.

## Alternatives Considered

### Alternative 1: Call OpenAI directly from the browser
- **Pros**: No server hop.
- **Cons**: The key is exposed and the model cannot be controlled.
- **Why not**: It leaks the secret.

### Alternative 2: Let the client choose the model
- **Pros**: Flexible.
- **Cons**: Cost and policy cannot be controlled.
- **Why not**: The proxy pins the model for control.

## Consequences

### Positive
- The key stays on the server.
- Model changes need only an env or routing change.
- One proxy serves both runtimes.

### Negative
- An extra hop for every streamed token.

### Risks
- The proxy has no per-user auth or rate limiting in the code read. Abuse could spend the key's budget, so add auth at the currentUserId seam.

## Evidence in the code

- `server/proxy.js`
- `server/routing.js`
