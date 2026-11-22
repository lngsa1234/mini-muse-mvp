# ADR-0008: Keep chat, memory and settings on the server, not in localStorage

**Date**: 2026-11-20
**Status**: accepted
**Deciders**: Ling
**Shipped**: Implemented

## Context

ADR-0004 moved documents, goals, ideas and traces to Postgres but left chat, memory, preferences, contacts, connector permissions and the activity log in each browser's localStorage. localStorage belongs to one browser profile on one computer. So the same user saw a different chat and a different memory on a laptop and a desktop, and clearing browser data erased them.

## Decision

We keep that state on the server, scoped by user_id like everything else:

- `user_state`: one JSONB object of top-level keys (memory, contacts, prefs, connectors, seeded, ...). Clients PATCH only the keys they changed (`data || patch`), so the page and the server agent don't overwrite each other's keys.
- `chat_messages`: one row per message. Only the server writes chat (see ADR-0009).
- The activity log is append-only (`POST /api/state/audit`), capped at 150 entries in SQL.

The page loads everything from `GET /api/state` at boot and when the tab regains focus. `core/storage.js` sends debounced PATCHes. The first time a browser that still has old localStorage data meets an empty account, it uploads that data once (`POST /api/state/import`). It never overwrites an account that already has data.

## Alternatives Considered

### Alternative 1: Keep localStorage and sync it
- **Pros**: Works offline.
- **Cons**: Needs conflict resolution between devices for every key.
- **Why not**: The app already needs the server for chat (the API key lives there), so offline use isn't possible anyway.

### Alternative 2: Separate tables for memory, contacts and prefs
- **Pros**: Row-level updates and queries.
- **Cons**: More schema and handlers for small lists that are always read whole.
- **Why not**: Top-level JSONB keys give the same isolation between writers. Chat gets its own table because it grows and is written while a turn streams.

## Consequences

### Positive
- Every device shows the same chat, memory and settings.
- The server agent can read memory and settings without the browser sending them.

### Negative
- The app needs the server and database to load at all; with no database the page shows an error instead of an empty local copy.
- Two devices editing the same key at the same moment: the last PATCH wins for that key.

### Risks
- Until real authentication replaces DEV_USER_ID (ADR-0005), everyone who can reach a deployment shares one account's chat and memory. That was true for documents and goals already; it now covers chat too.

## Evidence in the code

- `server/userdata.js`
- `server/state.js`
- `public/js/core/storage.js`
- `db/schema.sql`
