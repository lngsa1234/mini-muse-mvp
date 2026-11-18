# UC-6: Revise a plan with approval

- From: Goals use cases
- Author: Maya
- Date: 2026-11-17

- **User goal:** “Change my plan — reword, add, or remove steps — without losing progress.”
- **Actors:** user, Muse.
- **Trigger:** the user asks to change a goal's steps.
- **Preconditions:** the goal exists.

## Main flow

| Step | Who | Action | Tool | Evidence |
|---|---|---|---|---|
| 1 | user | Asks for the change | chat | message |
| 2 | agent | Sends the full new step list (1 to 8 steps) and an optional reason | `revise_plan` (`goals.js:136-137`) | call |
| 3 | system | Computes a before and after diff of Step n, Add, and Remove rows (`model.js:104-113`) | `diffPlan` | rows |
| 4 | system | If there is no diff, it returns "No change" (`goals.js:140`) | — | — |
| 5 | user | Approves or declines on a card titled "Change the plan for …?" (`goals.js:141`) | approval | decision |
| 6 | system | On approval it saves the steps. A step keeps its status if its text is unchanged or reworded in the same position, and new steps start as todo (`model.js:99-102`) | `updateGoalSteps` | audit entry |

## Alternative and failure flows

if the user declines, nothing changes and Muse returns a refusal.

## Guardrails

`revise_plan` must never be used to change a step's status.

## Success criteria

- **Given** a goal with one done step, **when** the user approves a plan that adds one step, **then** the done step stays done and the new step is todo.

## Open question

A rewording at the same index inherits the old status, so a done step reworded into a different task still shows done. Should a reworded done step reset to todo?
