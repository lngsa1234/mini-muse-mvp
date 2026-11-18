---
title: Goals
type: Feature spec
featureId: goals
status: Written from code
owner: Product Manager (Maya)
---

# Goals

_Written by Maya from the code on 2026-11-17. It describes the feature as built._

## Summary

Lets a user create, list, update and delete personal goals through the Goals API. Each goal has an ordered plan of steps and can carry an optional target, a deadline and tracked job applications.

The Goals API is a set of Vercel Node functions: `api/goals/index.js` handles list and create, and `api/goals/[id].js` handles update and delete. Both call shared handlers in `server/goals.js`, which the local Express server also uses. Each request is scoped to a user id from `currentUserId` and wrapped in tracing. Create requires a goal text and at least one step, and keeps at most 8 steps. Update accepts one of three body shapes: a single-step status change, an application upsert, or a full patch. I did not read the persistence layer (`server/db.js`), the front-end goals UI, or the agent tools, so this spec covers only the API layer.

## User stories

- As a user, I want to create a goal with steps so that I have a plan to work through.
- As a user, I want to mark an individual step todo, doing, done or blocked so that I can track progress.
- As a user, I want to record job applications against a goal so that I can track my search.
- As a user, I want to edit or delete a goal so that my plan stays current.

## Scope

**In scope**

- GET /api/goals lists the user's goals
- POST /api/goals creates a goal with steps, an optional target and an optional deadline
- PATCH /api/goals/:id: single-step status change, application add or update, and full patch of goal, steps, target and deadline
- DELETE /api/goals/:id
- Input validation and HTTP status codes in server/goals.js

**Out of scope**

- Goals page UI (public/js/features/goals)
- Agent tools for goals, such as revise_plan, and the evidence rules for advancing steps
- Daily check-in and job search tools
- Database schema and storage details
- Authentication internals

## Requirements

| ID | Requirement |
|---|---|
| FS-R01 | GET /api/goals returns { goals: [...] } for the current user. |
| FS-R02 | POST /api/goals requires a non-empty goal text and returns 400 if it is missing. |
| FS-R03 | POST /api/goals requires at least one non-empty step and returns 400 if there are none. |
| FS-R04 | POST /api/goals accepts steps as strings or as { text, status } objects, defaults the status to todo, and keeps at most 8 steps. |
| FS-R05 | POST /api/goals validates target and deadline and returns 400 with the validation message when they are invalid. A successful create returns 201 with { goal }. |
| FS-R06 | PATCH /api/goals/:id with step (1-based) and status updates that step. Status must be one of todo, doing, done or blocked. It returns 404 for an unknown goal and 400 for an unknown step. |
| FS-R07 | PATCH /api/goals/:id with application upserts a tracked application and returns 400 if it is invalid. |
| FS-R08 | PATCH /api/goals/:id with goal, steps, target or deadline updates those fields. It returns 404 if the goal does not exist. |
| FS-R09 | DELETE /api/goals/:id returns { removed: id }, or 404 if the goal does not exist. |
| FS-R10 | Methods other than GET and POST on the collection route, and other than PATCH and DELETE on the item route, return 405. |

## Acceptance criteria

- **AC1** ✓ (API): Given A request to create a goal with an empty goal text, when POST /api/goals is called, then The response is 400 with the error 'goal is required'.
  - `server/goals.js:28`: `if (!goal) return err(400, "goal is required");`
- **AC2** ✓ (API): Given A create request with a goal text but no valid steps, when POST /api/goals is called, then The response is 400 with the error 'at least one step is required'.
  - `server/goals.js:29`: `at least one step is required`
- **AC3** ✓ (API): Given A create request with more than 8 steps, when POST /api/goals is called, then The goal is created with only the first 8 steps, and the response is 201.
  - `server/goals.js:27`: `.slice(0, 8);`
  - `server/goals.js:33`: `return { status: 201, json: { goal: created } };`
- **AC4** ✓ (API): Given An existing goal, when PATCH /api/goals/:id is called with step 2 and status 'done', then Step 2 is set to done and the updated goal is returned.
  - `server/goals.js:47`: `const steps = current.steps.map((s, i) => (i === idx ? { ...s, status: body.status } : s));`
- **AC5** ✓ (API): Given An existing goal, when PATCH /api/goals/:id is called with a status outside todo, doing, done or blocked, then The response is 400 with 'bad status'.
  - `server/goals.js:42`: `return err(400, "bad status");`
- **AC6** ✓ (API): Given An existing goal, when PATCH /api/goals/:id is called with an application object, then The application is added or updated and the goal is returned. An invalid application returns 400..
  - `server/goals.js:59`: `applications = upsertApplication(current.applications, app);`
- **AC7** ✓ (API): Given A goal id that does not exist, when DELETE /api/goals/:id is called, then The response is 404 'no such goal'.
  - `server/goals.js:79`: `if (!removed) return err(404, "no such goal");`
- **AC8** ✓ (API): Given A request to the collection route, when The method is neither GET nor POST, then The response is 405 'method not allowed'.
  - `api/goals/index.js:23`: `return send(res, { status: 405, json: { error: "method not allowed" } });`

## Risks

- The single-step PATCH handler lets any client set any step to 'done' directly. Any rule requiring tool-backed proof before a step advances is enforced elsewhere, or not at all. I did not verify this.
- The full-patch handler passes body.steps to the database without validating or normalizing it, unlike create, which caps at 8 steps and checks status.
- A malformed JSON body in readJson throws and returns 500 instead of 400.
- The single-step handler reads the goal and then writes it back, so concurrent updates could overwrite each other.
- I found no automated tests for this API, so none of the behavior is verified by QA. A QA Engineer verification task against these criteria is recommended.

## Open questions

- Should the full patch enforce the same step limit and status validation as create?
- Should the API itself enforce evidence-before-done for steps, or only the agent layer?
- What are the allowed values and formats for target, deadline and application status? They are defined in model.js, which I did not read.

## Not confirmed from the code

- I did not read server/db.js, server/auth.js, public/js/features/goals/model.js, the Goals UI, the agent tools or the tests.
- I did not read the Express route wiring in server/index.js.
- Persistence behavior, user scoping and the shape of the returned goal are inferred from the handler code only.
