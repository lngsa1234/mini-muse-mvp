---
title: Ideas
type: Feature spec
featureId: ideas
status: Written from code
owner: Product Manager (Maya)
---

# Ideas

_Written by Maya from the code on 2026-11-17. It describes the feature as built._

## Summary

The Ideas feature gives a user a page of suggested and saved ideas, backed by a per-user ideas API. Users can save, act on, promote to goals, or dismiss ideas. Muse can also add ideas through chat.

The API has GET and POST on /api/ideas, and PATCH and DELETE on /api/ideas/:id. Both share handlers in server/ideas.js, which store ideas per user. In the browser, the Ideas page shows rule-based starter ideas until Muse generates personalised ideas (status 'new') through the LLM. Cards are grouped as New or Starter, Saved, and Acted on. The user can press Do it, Save, Make it a goal, or Not for me. Chat uses a save_idea tool to store ideas the user shares or Muse suggests.

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
| FS-R08 | Not for me on a starter idea only records its rule key locally; on a stored idea it sets status to dismissed. |
| FS-R09 | save_idea skips a title that already exists, ignoring case, and otherwise stores the idea as saved. |

## Acceptance criteria

- **AC1** ✓ (API): Given An API client, when it POSTs /api/ideas with a blank or missing title, then the response is 400 with 'title is required'.
  - `server/ideas.js:19`: `if (!title) return err(400, "title is required");`
- **AC2** ✓ (API): Given An API client, when it POSTs a valid idea, then the response is 201 with the created idea, and the title is capped at 200 characters.
  - `server/ideas.js:21`: `title: title.slice(0, TITLE_CAP),`
- **AC3** ✓ (API): Given An idea id that does not exist for the user, when the client sends PATCH or DELETE, then the response is 404 'no such idea'.
  - `server/ideas.js:38`: `if (!idea) return err(404, "no such idea");`
  - `server/ideas.js:44`: `if (!removed) return err(404, "no such idea");`
- **AC4** ✓ (API): Given An unsupported HTTP method on /api/ideas, when the request is made, then the response is 405 'method not allowed'.
  - `api/ideas/index.js:23`: `return send(res, { status: 405, json: { error: "method not allowed" } });`
- **AC5** ✓ (web): Given A user opens the Ideas page and has no 'new' ideas, when the page renders, then rule-based starter ideas appear under 'Starter ideas'.
  - `public/js/features/ideas/ideas.js:51`: `['Starter ideas <span>${gen.busy ? "Muse is personalizing these…" : "from simple rules"}</span>', ruleIdeas()]`
- **AC6** ✓ (web): Given A user with an active LLM session, when they press 'Update with Muse', then Muse creates ideas with status 'new', and the page shows them under 'New from Muse'.
  - `public/js/features/ideas/ideas.js:93`: `status: "new", by: "muse" }));`
  - `public/js/features/ideas/ideas.js:50`: `'New from Muse <span>updated`
- **AC7** ✓ (web): Given A stored idea, when the user presses Save, then its status is set to 'saved' and it moves to the Saved group.
  - `public/js/features/ideas/ideas.js:131`: `replaceIdea(i = await updateIdea(i.id, { status: "saved" }))`
- **AC8** ✓ (web): Given An idea card, when the user presses 'Not for me' on a stored idea, then its status becomes dismissed and the card disappears.
  - `public/js/features/ideas/ideas.js:137`: `replaceIdea(await updateIdea(i.id, { status: "dismissed" }))`
  - `public/js/features/ideas/ideas.js:47`: `filter(i => ideaStatus(i) !== "dismissed")`
- **AC9** ✓ (web): Given An idea card, when the user presses 'Do it', then the idea is marked done and Muse is sent a message to carry it out.
  - `public/js/features/ideas/ideas.js:120`: `updateIdea(i.id, { status: "done" })`
- **AC10** ✓ (web): Given A chat where the user shares an idea, when Muse calls save_idea with a title already on the page, then nothing is created and the tool replies 'Already on the Ideas page.'.
  - `public/js/features/ideas/ideas.js:158`: `return "Already on the Ideas page.";`

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

## Not confirmed from the code

- I did not read rules.js, context.js, server/db.js, db/schema.sql, core/api.js, or the tests.
- The Express route wiring in server/index.js was not verified, so local server behavior is assumed to match the Vercel handlers.
- Nothing was run, so all criteria are static code observations and not verified behavior.
