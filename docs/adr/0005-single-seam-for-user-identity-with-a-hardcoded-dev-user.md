---
status: accepted
paths:
  - server/auth.js
---

# ADR-0005: Single seam for user identity with a hardcoded dev user

**Date**: 2026-11-18
**Status**: accepted
**Deciders**: Recorded by Alex (Technical Lead) from the code
**Shipped**: Implemented

> Recorded from the code on 2026-11-18. The decision predates this record; its original date is not known.

## Context

Tables carry user_id, but authentication is not built yet.

## Decision

We resolve every request to one user through currentUserId in server/auth.js, which returns DEV_USER_ID (default 'dev'). Every handler takes a userId from that function.

## Alternatives Considered

### Alternative 1: Build auth now (sessions or JWT)
- **Pros**: Real multi-user support.
- **Cons**: Slows the MVP.
- **Why not**: It was deferred and isolated to one function.

## Consequences

### Positive
- Adding auth later means replacing one function.

### Negative
- All users share one dataset today.

### Risks
- Deploying publicly without auth exposes all data and the LLM proxy. Add auth before opening access.

## Evidence in the code

- `server/auth.js`
- `server/goals.js`
