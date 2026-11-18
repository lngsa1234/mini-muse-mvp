# ADR-0007: Gate agent actions on approvals and tool evidence

**Date**: 2026-11-18
**Status**: accepted
**Deciders**: Recorded by Alex (Technical Lead) from the code
**Shipped**: Implemented

> Recorded from the code on 2026-11-18. The decision predates this record; its original date is not known.

## Context

An LLM may claim work it did not do or take sensitive actions. The product has to be trustworthy about goal progress and about side effects such as sending mail.

## Decision

We require a non-bookkeeping tool to have run in the same turn, matching the cited evidence, before a goal step becomes doing or done. Application statuses need proof. Write tools show approval cards, and mail_send always asks.

## Alternatives Considered

### Alternative 1: Trust the model's claims
- **Pros**: Simple.
- **Cons**: The model can claim steps are done that it never did.
- **Why not**: Commits show a model-settable bypass was removed and per-step evidence required.

## Consequences

### Positive
- Progress is tied to real tool results.
- The user stays in control of writes.

### Negative
- The model sometimes has to be told to do the work first.
- Verification logic is complex.

### Risks
- The rules live only in the client. Keep them in one place and covered by tests.

## Evidence in the code

- `public/js/features/goals/goals.js`
- `public/js/agent/run.js`
- `public/js/workflow/approvals.js`
