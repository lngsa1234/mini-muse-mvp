# ADR-0003: Share request handlers between Express and Vercel functions

**Date**: 2026-11-18
**Status**: accepted
**Deciders**: Recorded by Alex (Technical Lead) from the code
**Shipped**: Implemented

> Recorded from the code on 2026-11-18. The decision predates this record; its original date is not known.

## Context

The app runs locally on Express and is deployed on Vercel, where the Hobby plan limits the number of functions. Commit history shows Google routes consolidated for Hobby.

## Decision

We write runtime-neutral handlers that take a userId and parsed input and return { status, json }. server/index.js and the thin api/* Vercel functions both call them. The Google routes go through one adapter, server/google-route.js.

## Alternatives Considered

### Alternative 1: Separate implementations per runtime
- **Pros**: Each is idiomatic.
- **Cons**: The two copies drift apart.
- **Why not**: They would duplicate the logic.

### Alternative 2: One Vercel function per Google endpoint
- **Pros**: Simple routing.
- **Cons**: Hits the Hobby function limit.
- **Why not**: Commits consolidated the endpoints for Hobby.

## Consequences

### Positive
- Business logic is tested once.
- Handlers are easy to unit test.

### Negative
- Adapter glue is needed per route.

### Risks
- Server code imports from public/js (goals model). That coupling is a hazard if the front end is restructured.

## Evidence in the code

- `server/goals.js`
- `server/docs.js`
- `server/google-route.js`
- `api/goals/index.js`
