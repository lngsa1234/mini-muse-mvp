# UC-2: Muse works through goal steps

- From: Goals use cases
- Author: Maya
- Date: 2026-11-17

- **User goal:** “Move my goal forward and tell me what you need from me.”
- **Actors:** user, Muse.
- **Trigger:** the user clicks "Ask Muse to move this forward" or asks in chat.
- **Preconditions:** the goal exists and has at least one step that is not done.

## Main flow

| Step | Who | Action | Tool/API | Evidence |
|---|---|---|---|---|
| 1 | user | Nudges the goal | `say()` prompt (`goals.js:62`) | chat turn |
| 2 | agent | Does the next step it can do (web search, Library search, jobs search, and so on) | feature tools | tool actions recorded for the turn |
| 3 | agent | Updates only that step, citing the tool that did the work | `update_step` | "step → status (via tool)" audit entry (`goals.js:129`) |
| 4 | agent | Sets a step to `blocked` if no tool can do it, and tells the user what it needs | `update_step` | blocked label on the card (`goals.js:47`) |

## Alternative and failure flows

- Missing résumé: Muse asks the user to add one or offers to draft one with `docs_add`.
- The user says they did a step themselves. Muse tells them to click the step, because it cannot mark it for them.

## Guardrails

Muse must not skip a step silently. It must not mark unrelated steps done because of one action. It must not edit the user's files.

## Success criteria

- **Given** a goal with `todo` steps, **when** the user nudges Muse, **then** each changed step has a matching tool action and audit entry, and steps that no tool can do show `blocked`.

## Open question

none for this use case beyond UC-3.
