---
title: Goals
type: Feature spec
featureId: goals
status: Written from code
owner: Product Manager (Maya)
---

# Goals

**9 of 9** acceptance criteria checked against the code · 1 risk

_Written by Maya from the code on 2026-11-21. It describes the feature as built, not as planned._

## Summary

**Lets a user set a goal, such as getting an interview within 30 days, that Muse turns into a plan of steps and works through, marking a step done only when it actually did the work.**

The user creates a goal from the Goals page or in chat. Muse only marks a step in progress or done when a tool it ran in that turn did the work. For job searches it finds postings on employers' own hiring pages, scores the user's résumé against each one, and tracks applications against a target and deadline. Recording an interview or offer asks the user to confirm, and changing the plan needs the user's approval.

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
| FS-R01 | The system creates a goal only through create_goal, with at least one step and at most 8. |
| FS-R02 | The system refuses to mark a step doing or done unless a non-bookkeeping tool ran this turn and is cited as evidence. |
| FS-R03 | The system searches only employers' hiring sites for postings. |
| FS-R04 | The system refuses an application status the turn's actions do not prove. |
| FS-R05 | The system changes a plan only after the user approves the revision. |

## Acceptance criteria

| # | Given | When | Then | Where | In code |
|---|---|---|---|---|---|
| AC1 | muse is connected and not busy | the user submits a goal in the Goals form | muse is asked to plan it with every step left as todo | web | ✓ |
| AC2 | muse calls create_goal | it passes more than 8 steps or none | at most 8 steps are kept, and a goal with no steps is refused | web | ✓ |
| AC3 | only bookkeeping tools ran this turn | muse calls update_step with status done | the tool refuses because no tool did any work this turn | web | ✓ |
| AC4 | a web_search ran this turn | muse marks a step done citing a different tool | the tool refuses and lists the tools that did run | web | ✓ |
| AC5 | muse calls jobs_search | it passes neither keywords nor company boards | the tool refuses and asks for a job title or boards | web | ✓ |
| AC6 | the Library has no résumé | muse calls score_fit for a posting | the tool refuses and asks the user to add a résumé | web | ✓ |
| AC7 | a tracked job is drafted | muse marks it applied with no approved Submit click and no confirmation email this turn | the tool refuses and points to Gmail or the Goals page | web | ✓ |
| AC8 | muse found the employer's email this turn | it marks a job as interview | the user is asked to confirm before it counts | web | ✓ |
| AC9 | a goal exists | muse calls revise_plan with changed steps | the user sees a before/after card and nothing changes unless they approve | web | ✓ |

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

The Goals form sends Muse a prompt and Muse calls create_goal. update_step refuses doing or done unless a non-bookkeeping tool ran this turn and is named as evidence. Job tools: jobs_search and score_fit (features/jobs/jobs.js, with server/jobs.js) for postings on public Greenhouse, Lever and Ashby boards and for scoring the Library résumé, track_application with status proof from the same turn. revise_plan goes through an approval card.

## Evidence

| # | Code | Quote |
|---|---|---|
| AC1 | `public/js/features/goals/goals.js:57` | `say("New goal: " + t + ". Make a plan for it.` |
| AC2 | `public/js/features/goals/goals.js:93` | `.map(String).filter(Boolean).slice(0, 8);` |
| AC3 | `public/js/features/goals/goals.js:119` | `no tool did any work this turn` |
| AC4 | `public/js/features/goals/goals.js:125` | `set "evidence" to the tool you used this turn for THIS step` |
| AC5 | `public/js/features/jobs/jobs.js:29` | `give keywords (the job title) to search the hiring sites, or name company boards` |
| AC6 | `public/js/features/jobs/jobs.js:40` | `No résumé in the Library.` |
| AC7 | `public/js/features/goals/goals.js:164` | `there's no proof it was submitted this turn` |
| AC8 | `public/js/features/goals/goals.js:170` | `Count this as ${app.status === "offer" ? "an offer" : "an interview"}?` |
| AC9 | `public/js/features/goals/goals.js:141` | `yes: "Update plan"` |

## Not confirmed from the code

- Carried over from the previous spec at docs/specs/goals.md (API layer); its server-side behaviour is not re-cited here.
