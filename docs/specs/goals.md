---
title: Goals
type: Feature spec
featureId: goals
status: Written from code
owner: Product Manager (Maya)
---

# Goals

**12 of 12** acceptance criteria checked against the code · 1 risk

_Written by Maya from the code on 2026-11-22. It describes the feature as built, not as planned._

## Summary

**Lets a user set a goal, such as getting an interview within 30 days, that Muse turns into a plan of steps and works through, marking a step done only when it actually did the work.**

The user creates a goal from the Goals page or in chat; every goal has 3 to 6 steps. Muse marks a step in progress or done only when a tool it ran that turn did the work. For job searches it finds postings on employers' hiring pages, scores the résumé against each one, and tracks applications against a target and deadline. A job counts as applied after an approved Submit click, a confirmation email, or the user saying they applied. Interviews, offers and plan changes need the user's approval.

## User stories

- As a job seeker, I want to state a goal and get a concrete plan so that I know the next steps.
- As a user, I want Muse to mark progress only when it really did the work so that the plan stays honest.
- As a job seeker, I want postings found and scored against my résumé so that I apply where I fit.
- As a job seeker, I want applications tracked against a target and deadline so that I can see whether I'm on pace.

## Scope

**In scope**

- Creating goals through Muse (create_goal)
- Step status changes by Muse (update_step) and by the user (click)
- Job-search tools: jobs_search and score_fit
- Targets, deadlines and the application tracker (track_application)
- Plan revision with approval (revise_plan)

**Out of scope**

- The daily check-in (its own feature)
- Goal suggestions from ideas beyond linking idea_id
- Server persistence details

## Requirements

| ID | Requirement |
|---|---|
| FS-R01 | The system creates a goal only with 3 to 6 steps, from the agent or the API. |
| FS-R02 | The system refuses to mark a step doing or done unless a non-bookkeeping tool ran this turn and is cited as evidence. |
| FS-R03 | The system searches only employers' hiring sites for postings. |
| FS-R04 | The system refuses an application status the turn's actions or the user's own word do not prove. |
| FS-R05 | The system changes a plan only after the user approves the revision, and keeps it at 3 to 6 steps. |

## Acceptance criteria

| # | Given | When | Then | Where | In code | Tested |
|---|---|---|---|---|---|---|
| AC1 | Muse is connected and not busy | the user submits a goal in the Goals form | Muse is asked to plan it with every step left as todo | web | ✓ | — no test |
| AC2 | Muse calls create_goal | it passes fewer than 3 or more than 6 steps | the tool refuses and asks for a plan of 3 to 6 steps | web | ✓ | ✓ passes |
| AC3 | only bookkeeping tools ran this turn | Muse calls update_step with status done | the tool refuses because no tool did any work this turn | web | ✓ | ✓ passes |
| AC4 | a web_search ran this turn | Muse marks a step done citing a different tool | the tool refuses and lists the tools that did run | web | ✓ | ✓ passes |
| AC5 | Muse calls jobs_search | it passes neither keywords nor company boards | the tool refuses and asks for a job title or boards | web | ✓ | ✓ passes |
| AC6 | the Library has no résumé | Muse calls score_fit for a posting | the tool refuses and asks the user to add a résumé | web | ✓ | ✓ passes |
| AC7 | a tracked job is drafted | Muse marks it applied with no approved Submit click, no confirmation email and no word from the user this turn that they applied | the tool refuses and asks the user whether they applied | web | ✓ | ✓ passes |
| AC8 | Muse found the employer's email this turn | it marks a job as interview | the user is asked to confirm before it counts | web | ✓ | ✓ passes |
| AC9 | a goal exists | Muse calls revise_plan with changed steps | the user sees a before/after card and nothing changes unless they approve | web | ✓ | ✓ passes |
| AC10 | a goal exists | Muse calls revise_plan with fewer than 3 or more than 6 steps | the tool refuses | web | ✓ | ✓ passes |
| AC11 | the user tells Muse this turn that they applied to a tracked job | Muse marks that job applied | the job is marked applied, citing the user's word | web | ✓ | ✓ passes |
| AC12 | an API client | it POSTs /api/goals with fewer than 3 or more than 6 steps | the response is 400 'a goal needs 3 to 6 steps' | web | ✓ | ✓ passes |

_The code each criterion rests on is under Evidence, at the end._

## Scenarios

### SC1 Plan a measurable goal

1. **User**: Types "Land 3 interviews in 30 days" in the Goals form
2. **Agent**: Calls create_goal with steps, target_metric interviews, target_count 3 and days 30
3. **System**: Shows the goal with its target, deadline and days left

### SC2 Find and save a good fit

1. **Agent**: Runs jobs_search with the target role and location
2. **Agent**: Scores the most promising posting with score_fit against the Library résumé
3. **Agent**: Saves a strong fit with track_application as saved, and marks the find-openings step doing with evidence jobs_search

### SC3 Claimed progress without proof (failure)

1. **Agent**: Tries update_step done on a step no tool worked on this turn
2. **System**: Refuses with the reason; the step stays todo and Muse tells the user what it needs

## Risks

- The tool description and guidance say 3-6 steps, but create_goal keeps up to 8; the model and the code disagree on the limit.

## How it works

_For engineers: where the behavior above lives in the code._

The Goals form sends Muse a prompt and Muse calls create_goal, defined with the other goal tools in server/agent/tools/goals.js, which also enforces the evidence rules on the server. update_step refuses doing or done unless a non-bookkeeping tool ran this turn and is named as evidence. Job tools: jobs_search and score_fit (server/agent/tools/jobs.js, with server/jobs.js) for postings on public Greenhouse, Lever and Ashby boards and for scoring the Library résumé, track_application with status proof from the same turn. revise_plan goes through an approval card.

## Evidence

| # | Code | Quote |
|---|---|---|
| AC1 | `public/js/features/goals/goals.js:49` | `say("New goal: " + t + ". Make a plan for it.` |
| AC2 | `server/agent/tools/goals.js:36` | `given.length < MIN_STEPS \|\| given.length > MAX_STEPS` |
| AC3 | `server/agent/tools/goals.js:62` | `no tool did any work this turn` |
| AC4 | `server/agent/tools/goals.js:68` | `set "evidence" to the tool you used this turn for THIS step` |
| AC5 | `server/agent/tools/jobs.js:26` | `give keywords (the job title) to search the hiring sites, or name company boards` |
| AC6 | `server/agent/tools/jobs.js:37` | `No résumé in the Library.` |
| AC7 | `server/agent/tools/goals.js:109` | `there's no proof it was submitted this turn` |
| AC8 | `server/agent/tools/goals.js:115` | `Count this as ${app.status === "offer" ? "an offer" : "an interview"}?` |
| AC9 | `server/agent/tools/goals.js:84` | `yes: "Update plan"` |
| AC10 | `server/agent/tools/goals.js:80` | `texts.length < MIN_STEPS \|\| texts.length > MAX_STEPS` |
| AC11 | `server/agent/tools/goals.js:107` | `else if (saysApplied(ctx.userText)) proof = "you said you applied";` |
| AC12 | `server/goals.js:30` | `a goal needs ${MIN_STEPS} to ${MAX_STEPS} steps` |

## Tests

| # | Test | File |
|---|---|---|
| AC2 | goals AC2: create_goal with fewer than 3 or more than 6 steps is refused | `test/accept-goals.test.js` |
| AC3 | update_step's evidence rule is enforced on the server | `test/agent-runtime.test.js` |
| AC4 | goals AC4: marking a step done citing a tool that didn't run is refused, naming the tools that did | `test/accept-goals.test.js` |
| AC5 | goals AC5: jobs_search with neither keywords nor boards is refused | `test/accept-goals.test.js` |
| AC6 | goals AC6: score_fit without a résumé in the Library asks the user to add one | `test/accept-goals.test.js` |
| AC7 | goals AC7: marking a job applied with no proof and no word from the user is refused | `test/accept-goals.test.js` |
| AC8 | goals AC8: counting an interview from an employer's email asks the user to confirm | `test/accept-goals.test.js` |
| AC9 | goals AC9: revise_plan shows a before/after card and changes nothing unless approved | `test/accept-goals.test.js` |
| AC10 | goals AC10: revise_plan with fewer than 3 or more than 6 steps is refused | `test/accept-goals.test.js` |
| AC11 | goals AC11: when the user says they applied, Muse can mark the job applied | `test/accept-goals.test.js` |
| AC12 | goals AC12: the goals API refuses a goal with fewer than 3 or more than 6 steps | `test/accept-goals.test.js` |

## Not confirmed from the code

- Carried over from the previous spec at docs/specs/goals.md (API layer); its server-side behaviour is not re-cited here.
