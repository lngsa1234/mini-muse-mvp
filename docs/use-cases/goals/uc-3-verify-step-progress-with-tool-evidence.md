# UC-3: Verify step progress with tool evidence

- From: Goals use cases
- Author: Maya
- Date: 2026-11-17

- **User goal:** “I only want a step marked done when something was really done.”
- **Actors:** Muse, the `update_step` guard.
- **Trigger:** Muse tries to set a step to `doing` or `done`.
- **Preconditions:** a goal and step exist.

## Main flow

| Step | Who | Action | Evidence |
|---|---|---|---|
| 1 | agent | Calls `update_step` with `status` doing or done and `evidence` naming a tool | the request |
| 2 | system | Gathers this turn's tool actions, excluding bookkeeping tools (`create_goal`, `update_step`, `track_application`, `revise_plan`) | `goals.js:18-19,118` |
| 3 | system | If no work tool ran this turn, it refuses (`goals.js:119`) | error message |
| 4 | system | For a résumé or cover-letter step, it requires a `docs_search` with matches > 0 for a résumé (`goals.js:121-123`) | action log |
| 5 | system | For any other step, the cited evidence must name a tool that ran this turn (`goals.js:124`) | action log |
| 6 | system | It saves the status and audits "via <tool>" | `goals.js:128-129` |

## Alternative and failure flows

- If the check fails, Muse leaves the step `todo` or `blocked` and explains why.
- A user click always changes status with no evidence check, and it is audited "by you" (`goals.js:68`).

## Guardrails

Muse never uses `revise_plan` to change a step's status. No model-settable bypass exists.

## Success criteria

- Given no tool work this turn, when Muse sets a step to done, then it is refused and the step stays unchanged.
- Given a `docs_search` that found a résumé, when Muse sets the résumé step to done, then the step becomes done.

## Open question

Evidence only proves a tool ran, not that its result fits the step. The check also matches the evidence text with `includes`. Do we want a stricter link between tool and step?
