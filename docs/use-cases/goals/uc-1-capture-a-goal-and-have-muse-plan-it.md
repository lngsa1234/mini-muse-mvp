# UC-1: Capture a goal and have Muse plan it

- From: Goals use cases
- Author: Maya
- Date: 2026-11-17

- **User goal:** “I type a goal and Muse makes a plan I can follow.”
- **Actors:** user, Muse.
- **Trigger:** the user submits the goal form on the Goals page, or asks Muse to turn an idea into a goal.
- **Preconditions:** Muse is connected and not busy. Otherwise the form only shows a placeholder message and does nothing (`public/js/features/goals/goals.js:56`).

## Main flow

| Step | Who | Action | Tool/API | Evidence |
|---|---|---|---|---|
| 1 | user | Enters the goal text | goal form | chat message "New goal: …" (`goals.js:57`) |
| 2 | agent | Plans 3-6 concrete steps, all `todo` | `create_goal` | goal_id and numbered steps returned (`goals.js:106`) |
| 3 | agent | If the goal came from an idea, links the idea to the goal (`idea_id`) | `updateIdea` | idea.goalId set (`goals.js:100-103`) |
| 4 | user | Sees the goal card with a step list, progress bar, and "x of n steps" | Goals page | rendered card (`goals.js:45-48`) |

## Alternative and failure flows

- The user deletes the goal with ×. This is audited as `delete_goal`, with no confirmation prompt (`goals.js:63`).
- The user clicks a step to toggle it done or todo. This is audited as "by you" (`goals.js:64-69`).
- The user clicks "Ask Muse to move this forward" to start UC-2 (`goals.js:62`).
- If the model passes no steps, the tool throws "need a goal and at least one step" (`goals.js:94`).

## Guardrails

Muse must not mark any step as in progress or done at creation unless a tool did the work (`goals.js:57`).

## Success criteria

- **Given** a connected Muse, **when** the user submits a goal, **then** a goal with 3-6 `todo` steps appears and an audit entry exists.

## Open questions

- `create_goal` accepts up to 8 steps, while the guidance says 3-6. Which limit is intended?
- Is delete-without-confirm acceptable?
