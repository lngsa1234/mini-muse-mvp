---
status: accepted
paths:
  - server/google.js
  - server/google-route.js
  - api/google.js
---

# ADR-0006: Keep Google OAuth tokens in an HttpOnly cookie, with one consent for Gmail and Calendar

**Date**: 2026-11-18
**Status**: accepted
**Deciders**: Recorded by Alex (Technical Lead) from the code
**Shipped**: Implemented

> Recorded from the code on 2026-11-18. The decision predates this record; its original date is not known.

## Context

Gmail and Calendar need Google OAuth. Tokens must not be readable by page scripts.

## Decision

We run the OAuth flow on the server (/api/google/authorize and /callback) and keep tokens in an HttpOnly cookie. The browser only learns connected or not through /api/google/status. Gmail and Calendar share one consent.

## Alternatives Considered

### Alternative 1: Store tokens in localStorage or the DB
- **Pros**: Simple, or durable.
- **Cons**: Readable by scripts, or needs real user identity.
- **Why not**: The cookie keeps tokens out of page scripts and needs no user table.

## Consequences

### Positive
- Tokens are not exposed to page scripts.

### Negative
- Gmail and Calendar connect and disconnect together.
- The connection is tied to one browser.

### Risks
- Without auth, the cookie is the only link between a user and their Google access.

## Evidence in the code

- `server/google.js`
- `server/google-route.js`
