// Acceptance tests: Library (docs/specs/library.md), one per criterion.
// The database is replaced with an in-memory fake; nothing leaves the process.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { fakeDb, reset } from "../testkit/fake-db.js";
import { fakeRes } from "../testkit/http.js";

mock.module("../server/db.js", { namedExports: fakeDb });
mock.module("../server/trace-store.js", { namedExports: { writeBatch: async () => ({}), upsertTrace: async () => {}, listTraces: async () => [], getTrace: async () => ({}), listLogs: async () => [] } });
const docs = await import("../server/docs.js");
const { default: docById } = await import("../api/docs/[id].js");

const U = "u1";
const b64 = s => Buffer.from(s).toString("base64");

test("library AC1: GET /api/docs returns 200 with the user's docs", async () => {
  reset();
  await docs.handleCreate(U, { title: "Résumé", text: "PM, 6 years" });
  const out = await docs.handleList(U);
  assert.equal(out.status, 200);
  assert.deepEqual(out.json.docs.map(d => d.title), ["Résumé"]);
});

test("library AC2: posting pasted text creates the document with 201", async () => {
  reset();
  const out = await docs.handleCreate(U, { title: "Notes", text: "hello" });
  assert.equal(out.status, 201);
  assert.equal(out.json.doc.title, "Notes");
  assert.equal((await docs.handleList(U)).json.docs.length, 1);
});

test("library AC3: a post without a title or file is refused with 400", async () => {
  reset();
  const out = await docs.handleCreate(U, { text: "hello" });
  assert.deepEqual([out.status, out.json.error], [400, "title is required"]);
});

test("library AC4: a file over 3MB is refused with 413", async () => {
  reset();
  const big = Buffer.alloc(3 * 1024 * 1024 + 1, 97).toString("base64");
  const out = await docs.handleCreate(U, { filename: "big.txt", contentType: "text/plain", dataBase64: big });
  assert.deepEqual([out.status, out.json.error], [413, "file is too large (max 3MB)"]);
});

test("library AC5: a file with no readable text is refused with 422", async () => {
  reset();
  const out = await docs.handleCreate(U, { filename: "photo.png", contentType: "image/png", dataBase64: b64("\x89PNG") });
  assert.deepEqual([out.status, out.json.error], [422, "no readable text could be extracted from this file"]);
  assert.equal((await docs.handleList(U)).json.docs.length, 0);
});

test("library AC6: an uploaded file with no title is named after the file", async () => {
  reset();
  const out = await docs.handleCreate(U, { filename: "cover-letter.final.txt", contentType: "text/plain", dataBase64: b64("Dear team") });
  assert.equal(out.status, 201);
  assert.equal(out.json.doc.title, "cover-letter.final");
});

test("library AC7: deleting an unknown document returns 404", async () => {
  reset();
  const out = await docs.handleDelete(U, "d-missing");
  assert.deepEqual([out.status, out.json.error], [404, "no such document"]);
});

test("library AC8: an unsupported method on /api/docs/:id returns 405", async () => {
  const res = fakeRes();
  await docById({ method: "PUT", url: "/api/docs/d1", query: { id: "d1" }, headers: {} }, res);
  assert.equal(res.statusCode, 405);
});
