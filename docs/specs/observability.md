---
title: Observability
type: Feature spec
featureId: observability
status: Written from code
owner: Product Manager (Maya)
---

# Observability

**8 of 8** acceptance criteria checked against the code · 3 risks · 1 open question

_Written by Maya from the code on 2026-11-22. It describes the feature as built, not as planned._

## Summary

**Lets the builder replay any agent turn: what the model was sent, what it answered, which tools ran and how long each step took, to catch problems such as Muse claiming work it didn't do.**

The Observability page lists the 50 latest traces. Opening one shows a timeline of its steps, whether any tool ran, and the prompts, replies and tool inputs and outputs. Tracing can be turned off, or set to keep only the size of prompts and replies rather than their text. Captured text is cut at 10,000 characters.

## User stories

- As the builder, I want to see what the model was sent and what tools ran in a turn, so that I can debug wrong answers.

## Scope

**In scope**

- Trace ingest and reads (/api/trace)
- The Observability page
- Content capture and caps

**Out of scope**

- The user-facing activity log (How Muse works)

## Requirements

| ID | Requirement |
|---|---|
| FS-R01 | The system stamps the signed-in user's id on ingested traces and logs. |
| FS-R02 | The system stores only a length when content capture is off. |
| FS-R03 | The system caps captured text at 10,000 characters. |
| FS-R04 | The system says whether a trace ran any tools. |

## Acceptance criteria

| # | Given | When | Then | Where | In code |
|---|---|---|---|---|---|
| AC1 | OBS_ENABLED is off | a batch is posted | nothing is written and the reply says disabled | API | ✓ |
| AC2 | a signed-in user posts traces | the server ingests them | each trace carries the server's user id, not the browser's | API | ✓ |
| AC3 | a post has no traces, spans or logs | the server ingests it | it returns 400 | API | ✓ |
| AC4 | content capture is off | a prompt is recorded | only its length is stored | API | ✓ |
| AC5 | a captured string is longer than the cap | it is stored | it is cut to 10,000 characters with a truncated marker | API | ✓ |
| AC6 | a trace is open | its spans load | the header says whether any tool ran | web | ✓ |
| AC7 | no traces exist yet | the page loads | it says to send a chat message and refresh | web | ✓ |
| AC8 | an unknown trace id is requested | the server reads it | it returns 404 | API | ✓ |

_The code each criterion rests on is under Evidence, at the end._

## Risks

- Reading one trace by id does not check who owns it, so anyone with a trace id can read its prompts and tool outputs.
- Listing traces without a signed-in user returns every user's traces.
- Trace ids come from Math.random, so they are guessable in principle.

## Open questions

- Is the Observability page meant only for the builder, and if so should /api/trace reads be restricted?

## How it works

_For engineers: where the behavior above lives in the code._

The browser tracer (core/trace.js) and the server send spans and logs to /api/trace (api/trace.js → server/trace.js dispatch), stored in Postgres (Neon) by server/trace-store.js. OBS_ENABLED, OBS_CAPTURE_CONTENT, OBS_SAMPLE_RATE and OBS_RETENTION_DAYS control it; capContent in server/trace-core.js applies the 10,000-character cap. The page (features/observability) draws the waterfall from the spans.

## Evidence

| # | Code | Quote |
|---|---|---|
| AC1 | `server/trace.js:62` | `if (!enabled) return { status: 202, json: { written: { traces: 0, spans: 0, logs: 0 }, disabled: true } };` |
| AC2 | `server/trace.js:64` | `const traces = asArray(body && body.traces).map(t => ({ ...t, user_id: userId \|\| t.user_id \|\| null }));` |
| AC3 | `server/trace.js:68` | `return { status: 400, json: { error: "no traces, spans or logs in body" } };` |
| AC4 | `server/trace-core.js:66` | `if (!capture) return { redacted: true, length: str.length };` |
| AC5 | `server/trace-core.js:28` | `export const CONTENT_CAP = 10000;` |
| AC6 | `public/js/features/observability/observability.js:105` | `<div class="obs-flags">${statusDot(trace.status)} ${spans.length} spans · ${hasTools ? "ran tools" : "no tool calls"}</d` |
| AC7 | `public/js/features/observability/observability.js:53` | `'<p class="empty">No traces yet. Send a chat message, then refresh.</p>';` |
| AC8 | `server/trace.js:95` | `if (!trace) return { status: 404, json: { error: "trace not found" } };` |

## Not confirmed from the code

- Did not check whether retentionDays is enforced anywhere.
