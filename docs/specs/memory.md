---
title: Memory
type: Feature spec
featureId: memory
status: Written from code
owner: Product Manager (Maya)
---

# Memory

**6 of 6** acceptance criteria checked against the code · 1 risk

_Written by Maya from the code on 2026-11-22. It describes the feature as built, not as planned._

## Summary

**Lets Muse remember lasting facts and preferences about the user, and forget them on request; the user sees and deletes them in Settings.**

Muse saves lasting facts and preferences when the user shares them (the same fact is never saved twice) and forgets every fact containing a word the user asks it to forget. Settings → Memory lists the facts, each with a delete button; deleting one is recorded in the activity log. Facts are stored on the server, so every device sees the same memory.

## User stories

- As a user, I want Muse to remember my preferences so that I don't repeat myself.
- As a user, I want to see and delete what Muse remembers about me.

## Scope

**In scope**

- The remember and forget tools
- The Memory list in Settings

**Out of scope**

- How memory is used in the prompt

## Requirements

| ID | Requirement |
|---|---|
| FS-R01 | The system saves a fact only once, ignoring case. |
| FS-R02 | The system forgets every fact containing the keyword. |
| FS-R03 | The system lets the user delete any fact from Settings. |

## Acceptance criteria

| # | Given | When | Then | Where | In code |
|---|---|---|---|---|---|
| AC1 | muse already remembers a fact | it calls remember with the same fact in different case | nothing new is saved and it is told it is already remembered | web | ✓ |
| AC2 | muse calls remember | the fact is empty | the tool refuses | web | ✓ |
| AC3 | several facts mention a keyword | muse calls forget with that keyword | every fact containing it is removed and listed back | web | ✓ |
| AC4 | no fact matches | muse calls forget | nothing is removed and it says no memory matched | web | ✓ |
| AC5 | settings → Memory lists facts | the user clicks × on one | it is removed and the deletion is audited as by the user | web | ✓ |
| AC6 | muse remembers nothing yet | the Memory list renders | it suggests telling Muse a preference in Chat | web | ✓ |

_The code each criterion rests on is under Evidence, at the end._

## Risks

- forget deletes every fact containing the keyword, so a short keyword can remove more than intended.

## How it works

_For engineers: where the behavior above lives in the code._

The remember and forget tools are in server/agent/tools/memory.js and run in the server agent; facts are saved with the rest of the user's state in Postgres (server/userdata.js, user_state). features/memory/memory.js renders Settings → Memory and saves deletions back, writing an audit entry.

## Evidence

| # | Code | Quote |
|---|---|---|
| AC1 | `docs/reference/original-prototype.html:878` | `if (state.memory.some(f => f.fact.toLowerCase() === fact.toLowerCase())) return "Already remembered.";` |
| AC2 | `server/agent/tools/memory.js:15` | `if (!fact) throw new Error("fact is empty");` |
| AC3 | `.agentforge/feature-map.json:1627` | `const gone = state.memory.filter(f => f.fact.toLowerCase().includes(k));` |
| AC4 | `server/agent/tools/memory.js:27` | `if (!gone.length) return "No memory matched '" + keyword + "'.";` |
| AC5 | `public/js/features/memory/memory.js:17` | `audit("forget", { fact: f?.fact }, "Deleted by you", "you");` |
| AC6 | `public/js/features/memory/memory.js:14` | `Muse doesn't know anything about you yet. Tell it a preference in Chat` |
