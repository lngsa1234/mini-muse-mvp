# UC-4: Set a measurable target and deadline

- From: Goals use cases
- Author: Maya
- Date: 2026-11-17

- **User goal:** “Land 3 interviews in 30 days, and show me how I'm doing.”
- **Actors:** user, Muse.
- **Trigger:** the user states a goal with a number and a time frame.
- **Preconditions:** none beyond UC-1.

## Main flow

| Step | Who | Action | Tool/API | Evidence |
|---|---|---|---|---|
| 1 | user | States the goal "3 interviews in 30 days" | chat or goal form | message |
| 2 | agent | Calls `create_goal` with `target_metric` (interviews or applications), `target_count`, and `days` (`goals.js:89-91`) | `create_goal` | goal with target and deadline |
| 3 | system | Validates: count is a whole number from 1 to 500, days from 1 to 365, and the metric is in the allowed list (`model.js:22-45`) | `normTarget`, `deadlineIn` | validation errors, or the saved values |
| 4 | system | Shows "done/count metric · N days left" and a progress bar (`goals.js:27-31`) | `goalProgress` | UI |

## Counting rules

- Interviews count applications with status interview or offer.
- Applications count applied, interview, offer, and rejected (`model.js:14-17`).

## Alternative and failure flows

- An invalid target or days value throws an error and no goal is created.
- At the deadline the UI shows "deadline reached" and days left floors at 0 (`model.js:92`).

## Success criteria

- **Given** a goal with a target of 3 interviews, **when** two applications reach interview or offer, **then** the page shows 2/3 and the days remaining.

## Gaps

- Only two metrics exist, and both come from the job tracker.
- Nothing happens when a deadline passes beyond the label.
- Targets cannot be edited after creation. `revise_plan` changes steps only.
