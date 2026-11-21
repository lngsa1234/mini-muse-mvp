---
title: Observability
type: Feature spec
featureId: observability
status: Written from code
owner: Product Manager (Maya)
---

# Observability

_Written by Maya from the code on 2026-11-21. It describes the feature as built._

## Summary

Lets the builder see each agent turn as a trace: a list of recent traces and a timing waterfall of spans with prompts, responses, token use and tool inputs and outputs, to catch problems such as Muse claiming work no tool did.

The browser and server send spans and logs to /api/trace, which stores them in Postgres (Neon). The Observability page lists the 50 latest traces and, for one trace, shows a waterfall, whether any tool ran, and each span's attributes. Env flags turn tracing off, stop content capture (keeping only lengths), and set sampling and retention. Captured text is capped at 10,000 characters.

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

- **AC1** ✓ (API): Given OBS_ENABLED is off, when a batch is posted, then nothing is written and the reply says disabled.
  - `server/trace.js:62`: `if (!enabled) return { status: 202, json: { written: { traces: 0, spans: 0, logs: 0 }, disabled: true } };`
- **AC2** ✓ (API): Given a signed-in user posts traces, when the server ingests them, then each trace carries the server's user id, not the browser's.
  - `server/trace.js:64`: `const traces = asArray(body && body.traces).map(t => ({ ...t, user_id: userId || t.user_id || null }));`
- **AC3** ✓ (API): Given a post has no traces, spans or logs, when the server ingests it, then it returns 400.
  - `server/trace.js:68`: `return { status: 400, json: { error: "no traces, spans or logs in body" } };`
- **AC4** ✓ (API): Given content capture is off, when a prompt is recorded, then only its length is stored.
  - `server/trace-core.js:66`: `if (!capture) return { redacted: true, length: str.length };`
- **AC5** ✓ (API): Given a captured string is longer than the cap, when it is stored, then it is cut to 10,000 characters with a truncated marker.
  - `server/trace-core.js:28`: `export const CONTENT_CAP = 10000;`
- **AC6** ✓ (web): Given a trace is open, when its spans load, then the header says whether any tool ran.
  - `public/js/features/observability/observability.js:105`: `<div class="obs-flags">${statusDot(trace.status)} ${spans.length} spans · ${hasTools ? "ran tools" : "no tool calls"}</d`
- **AC7** ✓ (web): Given no traces exist yet, when the page loads, then it says to send a chat message and refresh.
  - `public/js/features/observability/observability.js:53`: `'<p class="empty">No traces yet. Send a chat message, then refresh.</p>';`
- **AC8** ✓ (API): Given an unknown trace id is requested, when the server reads it, then it returns 404.
  - `server/trace.js:95`: `if (!trace) return { status: 404, json: { error: "trace not found" } };`

## Risks

- Reading one trace by id does not check who owns it, so anyone with a trace id can read its prompts and tool outputs.
- Listing traces without a signed-in user returns every user's traces.
- Trace ids come from Math.random, so they are guessable in principle.

## Open questions

- Is the Observability page meant only for the builder, and if so should /api/trace reads be restricted?

## Not confirmed from the code

- Did not check whether retentionDays is enforced anywhere.
