---
title: Library
type: Feature spec
featureId: library
status: Written from code
owner: Product Manager (Maya)
---

# Library

_Written by Maya from the code on 2026-11-21. It describes the feature as built._

## Summary

The Library lets a user store documents (pasted text or uploaded files such as a résumé) through the /api/docs endpoints. The agent can then search and cite those documents.

The Library API is exposed as Vercel Node functions: GET and POST /api/docs, and DELETE /api/docs/:id. The local Express server shares the same handlers in server/docs.js. Each request is scoped to a user id. Pasted text needs a title and text, and the text is capped at 60,000 characters. Uploaded files arrive base64-encoded, are limited to 3MB, and have their text extracted. Only the extracted text is stored in Postgres, and the original file is not kept. I read only the API layer and server/docs.js, so the UI and agent search tools are not described here.

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

- **AC1** ✓ (API): Given A signed-in user with stored documents, when The client sends GET /api/docs, then The response is 200 with { docs: [...] }..
  - `server/docs.js:22`: `return { status: 200, json: { docs: await listDocs(userId) } };`
- **AC2** ✓ (API): Given A pasted-text request with title and text, when The client sends POST /api/docs, then The document is created and the response is 201 with { doc }..
  - `server/docs.js:34`: `const doc = await createDoc(userId, { title, text: text.slice(0, TEXT_CAP) });`
- **AC3** ✓ (API): Given A POST without a title, when The client sends it without a file, then The response is 400 "title is required"..
  - `server/docs.js:32`: `if (!title) return err(400, "title is required");`
- **AC4** ✓ (API): Given An uploaded file larger than 3MB, when The client sends POST /api/docs, then The response is 413 "file is too large (max 3MB)"..
  - `server/docs.js:43`: `return err(413, "file is too large (max 3MB)");`
- **AC5** ✓ (API): Given An uploaded file that yields no text, when The client sends POST /api/docs, then The response is 422 "no readable text could be extracted from this file"..
  - `server/docs.js:51`: `no readable text could be extracted from this file`
- **AC6** ✓ (API): Given An uploaded file with no title, when The client sends POST /api/docs, then The title defaults to the filename without its extension..
  - `server/docs.js:47`: `const fileTitle = title || filename.replace(/\.[^.]+$/, "") || filename;`
- **AC7** ✓ (API): Given A document id that does not exist for the user, when The client sends DELETE /api/docs/:id, then The response is 404 "no such document"..
  - `server/docs.js:64`: `if (!removed) return err(404, "no such document");`
- **AC8** ✓ (API): Given An unsupported HTTP method, when The client sends it to /api/docs/:id, then The response is 405..
  - `api/docs/[id].js:12`: `if (req.method !== "DELETE") return res.status(405).json({ error: "method not allowed" });`

## Risks

- Only extracted text is stored, so a file whose text cannot be extracted is lost and the original cannot be recovered.
- Text from pasted documents is silently truncated at 60,000 characters, and nothing tells the user.
- The cap on extracted text from uploaded files is not visible in server/docs.js, so long files may be stored in full.
- Per-user isolation depends on currentUserId in server/auth.js and on the db.js queries, neither of which I read.

## Open questions

- Should users be told when pasted text is truncated?
- How does currentUserId identify users, and is there real authentication?

## Not confirmed from the code

- I did not read server/db.js, server/extract.js, server/auth.js, the client code in public/js, or the Library feature's search and read tools.
- Supported file types and the database schema were not confirmed.
- No tests were reviewed, so nothing is verified by QA evidence.
