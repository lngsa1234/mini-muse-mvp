/*
 * Mini Muse backend (local development)
 * -------------------------------------------------------------------------
 * Serves the static front-end and proxies the OpenAI API so the
 * API key stays on the server. The browser sends a `tier` ("quick" | "default")
 * and server/routing.js maps it to a configured model; the raw response
 * (including the SSE stream) is piped straight back to the client.
 *
 * When deployed to Vercel, api/llm.js does the same job.
 */
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import express from "express";
import { buildUpstreamRequest, UPSTREAM_UNREACHABLE, health } from "./proxy.js";
import { currentUserId } from "./auth.js";
import { handleList, handleCreate, handleDelete } from "./docs.js";
import * as ideas from "./ideas.js";
import * as goals from "./goals.js";

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

app.use(express.json({ limit: "6mb" })); // base64 file uploads can be a few MB
app.use(express.static(PUBLIC_DIR));

/* ---------- Library documents (Neon + Vercel Blob) ---------- */
const sendDocs = res => ({ status, json }) => res.status(status).json(json);
app.get("/api/docs", async (req, res) => {
  try { sendDocs(res)(await handleList(currentUserId(req))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/docs", async (req, res) => {
  try { sendDocs(res)(await handleCreate(currentUserId(req), req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/docs/:id", async (req, res) => {
  try { sendDocs(res)(await handleDelete(currentUserId(req), req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- Ideas & Goals (Neon) ---------- */
// Register the same CRUD shape for both resources; handlers share server/docs.js's
// { status, json } contract, so one helper wires list/create/update/delete.
const wire = (base, h) => {
  const done = res => ({ status, json }) => res.status(status).json(json);
  const guard = fn => async (req, res) => {
    try { done(res)(await fn(req)); } catch (e) { res.status(500).json({ error: e.message }); }
  };
  app.get(`/api/${base}`, guard(req => h.handleList(currentUserId(req))));
  app.post(`/api/${base}`, guard(req => h.handleCreate(currentUserId(req), req.body)));
  app.patch(`/api/${base}/:id`, guard(req => h.handleUpdate(currentUserId(req), req.params.id, req.body)));
  app.delete(`/api/${base}/:id`, guard(req => h.handleDelete(currentUserId(req), req.params.id)));
};
wire("ideas", ideas);
wire("goals", goals);


app.post("/api/llm", async (req, res) => {
  const up = buildUpstreamRequest(req.body, process.env);
  if (up.error) return res.status(up.error.status).json(up.error.body);

  let upstream;
  try {
    upstream = await fetch(up.url, up.init);
  } catch (e) {
    return res.status(UPSTREAM_UNREACHABLE.status).json(UPSTREAM_UNREACHABLE.body);
  }

  res.status(upstream.status);
  const ct = upstream.headers.get("content-type");
  if (ct) res.setHeader("content-type", ct);

  if (!upstream.body) {
    const text = await upstream.text();
    return res.send(text);
  }

  // Pipe the (possibly streaming) response straight through to the browser.
  Readable.fromWeb(upstream.body).pipe(res);
});

app.get(["/healthz", "/api/healthz"], (_req, res) => res.json(health(process.env)));

app.listen(PORT, () => {
  console.log(`Mini Muse running at http://localhost:${PORT}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn("WARNING: OPENAI_API_KEY is not set. Chat will be disabled until you add it to .env");
  }
});
