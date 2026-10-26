// Server-side unit tests: `npm test` (no network, no API key needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { routeModel, DEFAULT_MODELS } from "../server/routing.js";
import { buildUpstreamRequest } from "../server/proxy.js";

test("routing: tier picks the model, defaults to quick", () => {
  assert.equal(routeModel({ tier: "default" }, {}), DEFAULT_MODELS.default);
  assert.equal(routeModel({ tier: "quick" }, {}), DEFAULT_MODELS.quick);
  assert.equal(routeModel({}, {}), DEFAULT_MODELS.quick);
  assert.equal(routeModel({ tier: "default" }, { OPENAI_MODEL_DEFAULT: "m-big" }), "m-big");
});

test("proxy: refuses without an API key", () => {
  const up = buildUpstreamRequest({ tier: "quick" }, {});
  assert.equal(up.error.status, 503);
  assert.equal(up.error.body.code, "no_api_key");
});

test("proxy: pins the model and strips client fields", () => {
  const up = buildUpstreamRequest({ tier: "quick", model: "evil-model", messages: [] }, { OPENAI_API_KEY: "k", OPENAI_MODEL_QUICK: "m-small" });
  const payload = JSON.parse(up.init.body);
  assert.equal(payload.model, "m-small");
  assert.equal(payload.tier, undefined);
  assert.equal(payload.max_completion_tokens, 2048);
  assert.equal(up.init.headers.authorization, "Bearer k");
});
