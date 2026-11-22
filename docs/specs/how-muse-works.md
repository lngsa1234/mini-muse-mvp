---
title: How Muse works
type: Feature spec
featureId: how-muse-works
status: Written from code
owner: Product Manager (Maya)
---

# How Muse works

**6 of 6** acceptance criteria checked against the code

_Written by Maya from the code on 2026-11-22. It describes the feature as built, not as planned._

## Summary

**Shows the user what Muse is doing and has done: the step of the agent loop it is in, the tools it can use right now, and a log of every tool call with what went in and came out.**

A side panel (switched on in Settings) highlights the current loop phase, lists core tools plus tools of connected services, and shows Muse's six most recent tool calls. Settings → Activity shows up to 150 audit entries, marking ones done by the user and ones from connectors.

## User stories

- As a user, I want to see what Muse actually did so that I can trust or correct it.

## Scope

**In scope**

- Loop phase highlight
- Live tool list
- Recent activity and Settings → Activity

**Out of scope**

- Traces and timings (Observability)

## Requirements

| ID | Requirement |
|---|---|
| FS-R01 | The system lists only tools of connected services alongside core tools. |
| FS-R02 | The system shows at most 150 activity entries. |
| FS-R03 | The system marks entries the user did. |

## Acceptance criteria

| # | Given | When | Then | Where | In code | Tested |
|---|---|---|---|---|---|---|
| AC1 | Muse moves to a new loop phase | a phase event fires | that phase is highlighted | web | ✓ | ✓ passes |
| AC2 | a service is connected | the tool list renders | its tools appear after the core tools | web | ✓ | ✓ passes |
| AC3 | there are more than 150 audit entries | Settings → Activity renders | only the latest 150 are shown | web | ✓ | ✓ passes |
| AC4 | the user deleted something | the activity renders | that entry is labelled as done by you | web | ✓ | ✓ passes |
| AC5 | the panel is open | Muse has used tools | its six latest calls show, excluding the user's | web | ✓ | ✓ passes |
| AC6 | nothing has happened yet | the activity renders | it explains every tool call will show up here | web | ✓ | ✓ passes |

_The code each criterion rests on is under Evidence, at the end._

## How it works

_For engineers: where the behavior above lives in the code._

features/hood/hood.js listens for phase and audit events from core/activity.js, highlights the loop phase, lists coreToolNames() plus tools of connected connectors, and renders the audit log.

## Evidence

| # | Code | Quote |
|---|---|---|
| AC1 | `public/js/features/hood/hood.js:9` | `function setPhase(p) { document.querySelectorAll("#loop li").forEach(li => li.classList.toggle("on", li.dataset.p === p)` |
| AC2 | `public/js/features/hood/hood.js:27` | `const list = [...core.map(t => [t.name, ""]), ...Object.keys(CONNECTORS).filter(isOn).flatMap(k => CONNECTORS[k].tools.m` |
| AC3 | `public/js/features/hood/hood.js:16` | `$("audit").innerHTML = a.length ? a.slice(0, 150).map(auditItem).join("") : empty;` |
| AC4 | `public/js/features/hood/hood.js:11` | `${x.by === "you" ? "you · " : isConnTool(x.tool) ? "connector · " : ""}` |
| AC5 | `public/js/features/hood/hood.js:17` | `const mine = a.filter(x => x.by !== "you").slice(0, 6);` |
| AC6 | `public/js/features/hood/hood.js:14` | `Nothing yet. Every tool Muse uses shows up here, with what it sent and what came back.` |

## Tests

| # | Test | File |
|---|---|---|
| AC1 | how-muse-works AC1: the loop highlights the phase Muse is in | `e2e/how-muse-works.spec.mjs` |
| AC2 | how-muse-works AC2: a connected service's tools are listed after the core tools | `e2e/how-muse-works.spec.mjs` |
| AC3 | how-muse-works AC3: Settings → Activity shows only the latest 150 entries | `e2e/how-muse-works.spec.mjs` |
| AC4 | how-muse-works AC4: an entry the user did is labelled as done by you | `e2e/how-muse-works.spec.mjs` |
| AC5 | how-muse-works AC5: the panel shows Muse's six latest tool calls, not the user's | `e2e/how-muse-works.spec.mjs` |
| AC6 | how-muse-works AC6: with no activity yet, it explains every tool call will show up here | `e2e/how-muse-works.spec.mjs` |
