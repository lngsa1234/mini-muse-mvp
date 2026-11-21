---
title: How Muse works
type: Feature spec
featureId: how-muse-works
status: Written from code
owner: Product Manager (Maya)
---

# How Muse works

_Written by Maya from the code on 2026-11-21. It describes the feature as built._

## Summary

Shows the user what Muse is doing and has done: the step of the agent loop it is in, the tools it can use right now, and a log of every tool call with what went in and came out.

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

- **AC1** ✓ (web): Given Muse moves to a new loop phase, when a phase event fires, then that phase is highlighted.
  - `public/js/features/hood/hood.js:9`: `function setPhase(p) { document.querySelectorAll("#loop li").forEach(li => li.classList.toggle("on", li.dataset.p === p)`
- **AC2** ✓ (web): Given a service is connected, when the tool list renders, then its tools appear after the core tools.
  - `public/js/features/hood/hood.js:21`: `const list = [...coreToolNames().map(n => [n, ""]), ...Object.keys(CONNECTORS).filter(isOn).flatMap(k => CONNECTORS[k].t`
- **AC3** ✓ (web): Given there are more than 150 audit entries, when Settings → Activity renders, then only the latest 150 are shown.
  - `public/js/features/hood/hood.js:16`: `$("audit").innerHTML = a.length ? a.slice(0, 150).map(auditItem).join("") : empty;`
- **AC4** ✓ (web): Given the user deleted something, when the activity renders, then that entry is labelled as done by you.
  - `public/js/features/hood/hood.js:11`: `${x.by === "you" ? "you · " : isConnTool(x.tool) ? "connector · " : ""}`
- **AC5** ✓ (web): Given the panel is open, when Muse has used tools, then its six latest calls show, excluding the user's.
  - `public/js/features/hood/hood.js:17`: `const mine = a.filter(x => x.by !== "you").slice(0, 6);`
- **AC6** ✓ (web): Given nothing has happened yet, when the activity renders, then it explains every tool call will show up here.
  - `public/js/features/hood/hood.js:14`: `Nothing yet. Every tool Muse uses shows up here, with what it sent and what came back.`
