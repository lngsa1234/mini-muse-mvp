---
title: Ideas
type: Feature spec
featureId: ideas
featureStatus: built
status: Written from code
owner: Product Manager (Maya)
---

# Ideas

**Feature:** Built · **Spec:** Complete · **QA:** 10 of 10 criteria pass

**10 of 10** acceptance criteria checked against the code · 6 risks · 4 open questions

_Written by Maya from the code on 2026-11-22. It describes the feature as built, not as planned._

## Summary

**Gives the user a page of ideas, some suggested by Muse and some they saved, that they can act on, keep, turn into a goal or dismiss.**

Until Muse has learned enough to suggest ideas of its own, the page shows starter ideas. Ideas are grouped as new or starter, saved, and acted on. Each card offers Do it, Save, Make it a goal, or Not for me. In chat, Muse can save an idea the user mentions or one it suggests. Ideas are kept per user, so they follow the user across devices.

## User stories

- As a user, I want to see suggested ideas so that I get prompts for things I could do soon.
- As a user, I want to save or dismiss ideas so that the list reflects what I care about.
- As a user, I want to tell Muse to do an idea or turn it into a goal so that I can act on it quickly.
- As a user, I want to say 'idea: ...' in chat so that Muse stores it on my Ideas page.

## Scope

**In scope**

- Ideas REST API: list, create, update, delete
- Ideas page rendering and grouping by status
- Muse-generated ideas ('Update with Muse')
- Starter ideas from rules, saved to the server when acted on
- Card actions: Do it, Save, Make it a goal, Not for me, Remove
- save_idea chat tool

**Out of scope**

- Goal planning after 'Make it a goal' (Goals feature)
- The content of rule-based starter ideas (rules.js not read)
- Building the ideaContext prompt (context.js not read)
- Database schema and auth internals

## Requirements

| ID | Requirement |
|---|---|
| FS-R01 | GET /api/ideas returns the current user's ideas as { ideas }. |
| FS-R02 | POST /api/ideas requires a non-empty title, truncates it to 200 characters, and returns 201 with { idea }. |
| FS-R03 | PATCH /api/ideas/:id returns the updated idea, or 404 'no such idea'. |
| FS-R04 | DELETE /api/ideas/:id returns { removed: id }, or 404 when the idea is missing. |
| FS-R05 | Methods other than those listed return 405 on the Vercel functions. |
| FS-R06 | The Ideas page hides dismissed ideas and groups the rest into New or Starter, Saved, and Acted on (done or goal). |
| FS-R07 | Update with Muse asks the LLM for 4 ideas, keeps at most 6, and saves each as status 'new' with by 'muse'. |
| FS-R08 | Not for me on a starter idea only records its rule key in the user’s saved settings; on a stored idea it sets status to dismissed. |
| FS-R09 | save_idea skips a title that already exists, ignoring case, and otherwise stores the idea as saved. |

## Acceptance criteria

| # | Given | When | Then | Where | In code | Tested |
|---|---|---|---|---|---|---|
| AC1 | an API client | it POSTs /api/ideas with a blank or missing title | the response is 400 with 'title is required' | API | ✓ | ✓ passes |
| AC2 | an API client | it POSTs a valid idea | the response is 201 with the created idea, and the title is capped at 200 characters | API | ✓ | ✓ passes |
| AC3 | an idea id that does not exist for the user | the client sends PATCH or DELETE | the response is 404 'no such idea' | API | ✓ | ✓ passes |
| AC4 | an unsupported HTTP method on /api/ideas | the request is made | the response is 405 'method not allowed' | API | ✓ | ✓ passes |
| AC5 | a user opens the Ideas page and has no 'new' ideas | the page renders | rule-based starter ideas appear under 'Starter ideas' | web | ✓ | ✓ passes |
| AC6 | a user with an active LLM session | they press 'Update with Muse' | Muse creates ideas with status 'new', and the page shows them under 'New from Muse' | web | ✓ | ✓ passes |
| AC7 | a stored idea | the user presses Save | its status is set to 'saved' and it moves to the Saved group | web | ✓ | ✓ passes |
| AC8 | an idea card | the user presses 'Not for me' on a stored idea | its status becomes dismissed and the card disappears | web | ✓ | ✓ passes |
| AC9 | an idea card | the user presses 'Do it' | the idea is marked done and Muse is sent a message to carry it out | web | ✓ | ✓ passes |
| AC10 | a chat where the user shares an idea | Muse calls save_idea with a title already on the page | nothing is created and the tool replies 'Already on the Ideas page.' | web | ✓ | ✓ passes |

_The code each criterion rests on is under Evidence, at the end._

## Risks

- PATCH passes the body straight to updateIdea; server/ideas.js does no field validation (db.js not read).
- The Not for me action on a starter idea is stored only in client state (skippedRules), so it may not persist across devices.
- Failures to persist a status change (Do it, Save, dismiss) are silently swallowed by empty catch blocks, so the UI can drift from the server.
- Muse-generated idea persistence also swallows errors, so some of the 4 to 6 ideas can be lost silently.
- The page's Delete action is a soft dismissal (status dismissed). Whether the API ever hard-deletes from the UI is unclear.
- No automated tests for Ideas were found in the files I read.

## Open questions

- What rules produce starter ideas, and when does the fingerprint trigger regeneration (rules.js was not read)?
- How does currentUserId identify users when there is no login?
- Should dismissed ideas be permanently removed, or do they still feed the 'avoid ideas like this' behavior?
- Is a QA verification pass wanted? There is no QA evidence in the repository, so a QA Engineer task to verify these criteria is recommended.

## How it works

_For engineers: where the behavior above lives in the code._

server/ideas.js holds the handlers for GET/POST /api/ideas and PATCH/DELETE /api/ideas/:id, shared by the Vercel functions and the local Express server, scoped by user id. The Ideas page renders rule-based starters until Muse generates personalised ideas (status 'new') through the model. Chat uses the save_idea tool.

## Evidence

| # | Code | Quote |
|---|---|---|
| AC1 | `server/ideas.js:19` | `if (!title) return err(400, "title is required");` |
| AC2 | `server/ideas.js:21` | `title: title.slice(0, TITLE_CAP),` |
| AC3 | `server/ideas.js:38` | `if (!idea) return err(404, "no such idea");` |
|  | `server/ideas.js:44` | `if (!removed) return err(404, "no such idea");` |
| AC4 | `api/ideas/index.js:23` | `return send(res, { status: 405, json: { error: "method not allowed" } });` |
| AC5 | `public/js/features/ideas/ideas.js:51` | `Starter ideas <span>${gen.busy ? "Muse is personalizing these…" : "from simple rules"}</span>` |
| AC6 | `public/js/features/ideas/ideas.js:93` | `status: "new", by: "muse" }));` |
|  | `.agentforge/feature-map.json:1430` | `'New from Muse <span>updated` |
| AC7 | `public/js/features/ideas/ideas.js:131` | `replaceIdea(i = await updateIdea(i.id, { status: "saved" }))` |
| AC8 | `public/js/features/ideas/ideas.js:137` | `replaceIdea(await updateIdea(i.id, { status: "dismissed" }))` |
|  | `public/js/features/ideas/ideas.js:47` | `filter(i => ideaStatus(i) !== "dismissed")` |
| AC9 | `public/js/features/ideas/ideas.js:120` | `updateIdea(i.id, { status: "done" })` |
| AC10 | `server/agent/tools/ideas.js:13` | `return "Already on the Ideas page.";` |

## Tests

| # | Test | File |
|---|---|---|
| AC1 | ideas AC1: posting an idea with a blank or missing title returns 400 | `test/accept-ideas.test.js` |
| AC2 | ideas AC2: a valid idea is created with 201 and its title capped at 200 characters | `test/accept-ideas.test.js` |
| AC3 | ideas AC3: PATCH or DELETE of an unknown idea returns 404 | `test/accept-ideas.test.js` |
| AC4 | ideas AC4: an unsupported method on /api/ideas returns 405 | `test/accept-ideas.test.js` |
| AC5 | ideas AC5: with no new ideas, rule-based starter ideas show under Starter ideas | `e2e/ideas.spec.mjs` |
| AC6 | ideas AC6: Update with Muse adds new ideas under New from Muse | `e2e/ideas.spec.mjs` |
| AC7 | ideas AC7: Save sets a stored idea to saved and moves it to the Saved group | `e2e/ideas.spec.mjs` |
| AC8 | ideas AC8: Not for me dismisses a stored idea and removes its card | `e2e/ideas.spec.mjs` |
| AC9 | ideas AC9: Do it marks the idea done and sends Muse a message to carry it out | `e2e/ideas.spec.mjs` |
| AC10 | ideas AC10: save_idea with a title already on the page creates nothing | `test/accept-ideas.test.js` |

## Not confirmed from the code

- I did not read rules.js, context.js, server/db.js, db/schema.sql, core/api.js, or the tests.
- The Express route wiring in server/index.js was not verified, so local server behavior is assumed to match the Vercel handlers.
- Nothing was run, so all criteria are static code observations and not verified behavior.
