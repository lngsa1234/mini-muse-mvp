/*
 * Mini Muse backend
 * -------------------------------------------------------------------------
 * Serves the static front-end and proxies the Anthropic Messages API so the
 * API key stays on the server. The browser sends a `tier` ("quick" | "default")
 * and the server maps it to a configured model; the raw response (including the
 * SSE stream) is piped straight back to the client.
 */
"use strict";

require("dotenv").config();
const path = require("path");
const express = require("express");
const { Readable } = require("stream");

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = process.env.ANTHROPIC_VERSION || "2023-06-01";

// Tier -> model. Override with MODEL_QUICK / MODEL_DEFAULT in .env.
const MODELS = {
  quick: process.env.MODEL_QUICK || "claude-3-5-haiku-latest",
  default: process.env.MODEL_DEFAULT || "claude-3-7-sonnet-latest"
};

const PUBLIC_DIR = path.join(__dirname, "..", "public");

app.use(express.json({ limit: "4mb" }));
app.use(express.static(PUBLIC_DIR));

app.post("/api/messages", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ code: "no_api_key", message: "ANTHROPIC_API_KEY is not set on the server." });
  }

  // Build the upstream payload: strip our `tier` field, pin the model server-side.
  const { tier, model, ...rest } = req.body || {};
  const payload = Object.assign({}, rest, {
    model: MODELS[tier === "default" ? "default" : "quick"]
  });
  if (typeof payload.max_tokens !== "number") payload.max_tokens = 2048;

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    return res.status(502).json({ code: "upstream_unreachable", message: "Could not reach the Anthropic API." });
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

app.get("/healthz", (_req, res) => res.json({ ok: true, hasKey: !!process.env.ANTHROPIC_API_KEY }));

app.listen(PORT, () => {
  console.log(`Mini Muse running at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("WARNING: ANTHROPIC_API_KEY is not set. Chat will be disabled until you add it to .env");
  }
});
