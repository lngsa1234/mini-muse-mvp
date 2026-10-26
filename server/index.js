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

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

app.use(express.json({ limit: "4mb" }));
app.use(express.static(PUBLIC_DIR));

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
