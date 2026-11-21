---
title: Goals
type: Feature spec
featureId: goals
status: Written from code
owner: Product Manager (Maya)
---

# Goals

_Written by Maya from the code on 2026-11-21. It describes the feature as built._

## Summary

Lets a user set a goal that Muse turns into a plan of steps and works through, marking a step in progress or done only when a tool it ran this turn did that step's work. Job-search goals add tools to find postings and score fit, and track applications against a measurable target and deadline.

A goal is created through chat: the Goals form sends Muse a prompt and Muse calls create_goal. update_step refuses doing or done unless a non-bookkeeping tool ran this turn and is named as evidence. For job-search goals, jobs_search finds postings on employers' hiring sites and score_fit rates the Library résumé against a posting; track_application records each job with a status that needs proof from this turn, and interview or offer also asks the user to confirm. revise_plan changes steps only after the user approves.

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

- **AC1** ✓ (web): Given Muse is connected and not busy, when the user submits a goal in the Goals form, then Muse is asked to plan it with every step left as todo.
  - `public/js/features/goals/goals.js:57`: `say("New goal: " + t + ". Make a plan for it.`
- **AC2** ✓ (web): Given Muse calls create_goal, when it passes more than 8 steps or none, then at most 8 steps are kept, and a goal with no steps is refused.
  - `public/js/features/goals/goals.js:93`: `.map(String).filter(Boolean).slice(0, 8);`
- **AC3** ✓ (web): Given only bookkeeping tools ran this turn, when Muse calls update_step with status done, then the tool refuses because no tool did any work this turn.
  - `public/js/features/goals/goals.js:119`: `no tool did any work this turn`
- **AC4** ✓ (web): Given a web_search ran this turn, when Muse marks a step done citing a different tool, then the tool refuses and lists the tools that did run.
  - `public/js/features/goals/goals.js:125`: `set "evidence" to the tool you used this turn for THIS step`
- **AC5** ✓ (web): Given Muse calls jobs_search, when it passes neither keywords nor company boards, then the tool refuses and asks for a job title or boards.
  - `public/js/features/jobs/jobs.js:29`: `give keywords (the job title) to search the hiring sites, or name company boards`
- **AC6** ✓ (web): Given the Library has no résumé, when Muse calls score_fit for a posting, then the tool refuses and asks the user to add a résumé.
  - `public/js/features/jobs/jobs.js:40`: `No résumé in the Library.`
- **AC7** ✓ (web): Given a tracked job is drafted, when Muse marks it applied with no approved Submit click and no confirmation email this turn, then the tool refuses and points to Gmail or the Goals page.
  - `public/js/features/goals/goals.js:164`: `there's no proof it was submitted this turn`
- **AC8** ✓ (web): Given Muse found the employer's email this turn, when it marks a job as interview, then the user is asked to confirm before it counts.
  - `public/js/features/goals/goals.js:170`: `Count this as ${app.status === "offer" ? "an offer" : "an interview"}?`
- **AC9** ✓ (web): Given a goal exists, when Muse calls revise_plan with changed steps, then the user sees a before/after card and nothing changes unless they approve.
  - `public/js/features/goals/goals.js:141`: `yes: "Update plan"`

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

## Not confirmed from the code

- Carried over from the previous spec at docs/specs/goals.md (API layer); its server-side behaviour is not re-cited here.
