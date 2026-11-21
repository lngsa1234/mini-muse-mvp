---
title: Memory
type: Feature spec
featureId: memory
status: Written from code
owner: Product Manager (Maya)
---

# Memory

_Written by Maya from the code on 2026-11-21. It describes the feature as built._

## Summary

Lets Muse remember lasting facts and preferences about the user, and forget them on request; the user sees and deletes them in Settings.

Muse calls remember to save one fact (duplicates are ignored, case-insensitively) and forget to delete every fact containing a keyword. Settings → Memory lists the facts with a count and a delete button on each; deleting one is recorded in the activity audit as done by the user.

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

- **AC1** ✓ (web): Given Muse already remembers a fact, when it calls remember with the same fact in different case, then nothing new is saved and it is told it is already remembered.
  - `public/js/features/memory/memory.js:28`: `if (state.memory.some(f => f.fact.toLowerCase() === fact.toLowerCase())) return "Already remembered.";`
- **AC2** ✓ (web): Given Muse calls remember, when the fact is empty, then the tool refuses.
  - `public/js/features/memory/memory.js:27`: `if (!fact) throw new Error("fact is empty");`
- **AC3** ✓ (web): Given several facts mention a keyword, when Muse calls forget with that keyword, then every fact containing it is removed and listed back.
  - `public/js/features/memory/memory.js:35`: `const gone = state.memory.filter(f => f.fact.toLowerCase().includes(k));`
- **AC4** ✓ (web): Given no fact matches, when Muse calls forget, then nothing is removed and it says no memory matched.
  - `public/js/features/memory/memory.js:37`: `if (!gone.length) return "No memory matched '" + keyword + "'.";`
- **AC5** ✓ (web): Given Settings → Memory lists facts, when the user clicks × on one, then it is removed and the deletion is audited as by the user.
  - `public/js/features/memory/memory.js:17`: `audit("forget", { fact: f?.fact }, "Deleted by you", "you");`
- **AC6** ✓ (web): Given Muse remembers nothing yet, when the Memory list renders, then it suggests telling Muse a preference in Chat.
  - `public/js/features/memory/memory.js:14`: `Muse doesn't know anything about you yet. Tell it a preference in Chat`

## Risks

- forget deletes every fact containing the keyword, so a short keyword can remove more than intended.
