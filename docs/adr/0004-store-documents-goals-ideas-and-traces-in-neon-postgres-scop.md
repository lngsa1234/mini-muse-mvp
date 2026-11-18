# ADR-0004: Store documents, goals, ideas and traces in Neon Postgres, scoped by user_id

**Date**: 2026-11-18
**Status**: accepted
**Deciders**: Recorded by Alex (Technical Lead) from the code
**Shipped**: Implemented

> Recorded from the code on 2026-11-18. The decision predates this record; its original date is not known.

## Context

Goals, ideas and library documents must persist beyond the browser and be ready for multiple users. Chat, memory and connector state stay in localStorage.

## Decision

We store documents, goals, ideas and traces in Postgres through server/db.js, keyed by user_id. Only extracted document text is stored, never the original file. localStorage keeps chat, preferences and connector state.

## Alternatives Considered

### Alternative 1: localStorage only
- **Pros**: No backend state.
- **Cons**: Data is lost per device and is not queryable by the server.
- **Why not**: The server APIs for goals, ideas and docs need durable storage.

## Consequences

### Positive
- Data is durable and per-user.
- Uploads stay small because only text is kept.

### Negative
- State is split between Postgres and localStorage.
- The README still says goals use localStorage, so it is out of date.

### Risks
- The split can confuse engineers. Treat the server code as the source of truth.

## Evidence in the code

- `server/db.js`
- `db/schema.sql`
- `public/js/core/storage.js`
