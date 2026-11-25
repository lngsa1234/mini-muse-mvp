---
title: Library
type: Feature spec
featureId: library
featureStatus: built
status: Written from code
owner: Product Manager (Maya)
---

# Library

**Feature:** Built · **Spec:** Complete · **QA:** 8 of 8 criteria pass

**8 of 8** acceptance criteria checked against the code · 4 risks · 2 open questions

_Written by Maya from the code on 2026-11-22. It describes the feature as built, not as planned._

## Summary

**Lets a user keep documents, such as a résumé, pasted as text or uploaded as a file, so Muse can search and cite them.**

The user pastes text with a title or uploads a file of up to 3 MB. Only the text is kept, up to 60,000 characters; the original file isn't stored. Documents belong to the signed-in user, who can delete any of them. Muse uses them for things like scoring the résumé against a job posting.

## User stories

- As a user I want to paste or upload a document so that the agent can use it.
- As a user I want to list my documents so that I can see what is stored.
- As a user I want to delete a document so that it is no longer stored or searchable.

## Scope

**In scope**

- List a user's documents
- Create a document from pasted text
- Create a document from an uploaded file with text extraction
- Delete a document by id
- Per-user scoping of document operations

**Out of scope**

- Library UI and the agent's search, read and cite tools (not read)
- Storage of the original uploaded file
- Editing an existing document
- Text extraction internals (server/extract.js, not read)
- Database layer internals (server/db.js, not read)

## Requirements

| ID | Requirement |
|---|---|
| FS-R01 | GET /api/docs returns { docs } for the current user. |
| FS-R02 | POST /api/docs with title and text creates a document and returns 201 with { doc }. |
| FS-R03 | POST /api/docs without a title or without text returns 400. |
| FS-R04 | Pasted text is truncated to 60,000 characters. |
| FS-R05 | An uploaded file over 3MB is rejected with 413. |
| FS-R06 | An empty uploaded file is rejected with 400. |
| FS-R07 | An uploaded file with no extractable text is rejected with 422. |
| FS-R08 | An uploaded file without a title uses its filename without the extension as the title. |
| FS-R09 | DELETE /api/docs/:id returns the removed title, or 404 if the document does not exist. |
| FS-R10 | Methods other than GET and POST on /api/docs, and other than DELETE on /api/docs/:id, return 405. |

## Acceptance criteria

| # | Given | When | Then | Where | In code | Tested |
|---|---|---|---|---|---|---|
| AC1 | a signed-in user with stored documents | the client sends GET /api/docs | the response is 200 with { docs: [...] } | API | ✓ | ✓ passes |
| AC2 | a pasted-text request with title and text | the client sends POST /api/docs | the document is created and the response is 201 with { doc } | API | ✓ | ✓ passes |
| AC3 | a POST without a title | the client sends it without a file | the response is 400 "title is required" | API | ✓ | ✓ passes |
| AC4 | an uploaded file larger than 3MB | the client sends POST /api/docs | the response is 413 "file is too large (max 3MB)" | API | ✓ | ✓ passes |
| AC5 | an uploaded file that yields no text | the client sends POST /api/docs | the response is 422 "no readable text could be extracted from this file" | API | ✓ | ✓ passes |
| AC6 | an uploaded file with no title | the client sends POST /api/docs | the title defaults to the filename without its extension | API | ✓ | ✓ passes |
| AC7 | a document id that does not exist for the user | the client sends DELETE /api/docs/:id | the response is 404 "no such document" | API | ✓ | ✓ passes |
| AC8 | an unsupported HTTP method | the client sends it to /api/docs/:id | the response is 405 | API | ✓ | ✓ passes |

_The code each criterion rests on is under Evidence, at the end._

## Risks

- Only extracted text is stored, so a file whose text cannot be extracted is lost and the original cannot be recovered.
- Text from pasted documents is silently truncated at 60,000 characters, and nothing tells the user.
- The cap on extracted text from uploaded files is not visible in server/docs.js, so long files may be stored in full.
- Per-user isolation depends on currentUserId in server/auth.js and on the db.js queries, neither of which I read.

## Open questions

- Should users be told when pasted text is truncated?
- How does currentUserId identify users, and is there real authentication?

## How it works

_For engineers: where the behavior above lives in the code._

The API is GET/POST /api/docs and DELETE /api/docs/:id, as Vercel Node functions sharing handlers in server/docs.js with the local Express server. Uploads arrive base64-encoded and server/extract.js pulls out the text, which is stored in Postgres per user id.

## Evidence

| # | Code | Quote |
|---|---|---|
| AC1 | `server/docs.js:22` | `return { status: 200, json: { docs: await listDocs(userId) } };` |
| AC2 | `server/docs.js:34` | `const doc = await createDoc(userId, { title, text: text.slice(0, TEXT_CAP) });` |
| AC3 | `server/docs.js:32` | `if (!title) return err(400, "title is required");` |
| AC4 | `server/docs.js:43` | `return err(413, "file is too large (max 3MB)");` |
| AC5 | `server/docs.js:51` | `no readable text could be extracted from this file` |
| AC6 | `server/docs.js:47` | `const fileTitle = title \|\| filename.replace(/\.[^.]+$/, "") \|\| filename;` |
| AC7 | `server/docs.js:64` | `if (!removed) return err(404, "no such document");` |
| AC8 | `api/docs/[id].js:12` | `if (req.method !== "DELETE") return res.status(405).json({ error: "method not allowed" });` |

## Tests

| # | Test | File |
|---|---|---|
| AC1 | library AC1: GET /api/docs returns 200 with the user's docs | `test/accept-library.test.js` |
| AC2 | library AC2: posting pasted text creates the document with 201 | `test/accept-library.test.js` |
| AC3 | library AC3: a post without a title or file is refused with 400 | `test/accept-library.test.js` |
| AC4 | library AC4: a file over 3MB is refused with 413 | `test/accept-library.test.js` |
| AC5 | library AC5: a file with no readable text is refused with 422 | `test/accept-library.test.js` |
| AC6 | library AC6: an uploaded file with no title is named after the file | `test/accept-library.test.js` |
| AC7 | library AC7: deleting an unknown document returns 404 | `test/accept-library.test.js` |
| AC8 | library AC8: an unsupported method on /api/docs/:id returns 405 | `test/accept-library.test.js` |

## Not confirmed from the code

- I did not read server/db.js, server/extract.js, server/auth.js, the client code in public/js, or the Library feature's search and read tools.
- Supported file types and the database schema were not confirmed.
- No tests were reviewed, so nothing is verified by QA evidence.
