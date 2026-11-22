// Acceptance tests: Browser bridge (docs/specs/browser-bridge.md), one per criterion.
// Tools run against a fake relay; the extension script runs in a vm with a fake page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import browser from "../server/agent/tools/browser.js";

const tool = name => browser.tools.find(t => t.name === name);
const relayCtx = () => { const sent = []; return { sent, clientTool: async (name, input) => { sent.push([name, input]); return { clicked: input.selector }; } }; };

test("browser-bridge AC2: browser_fill refuses when there are no fields", async () => {
  const ctx = relayCtx();
  await assert.rejects(tool("browser_fill").run({ fields: [] }, ctx, { act: () => {} }), /No fields to fill\./);
  assert.equal(ctx.sent.length, 0);
});

test("browser-bridge AC3: clicking Submit asks whether every field was reviewed", async () => {
  const ctx = relayCtx(); const cards = [];
  const h = { ask: async (_tool, card) => { cards.push(card); return true; }, refusal: () => "refused" };
  await tool("browser_click").run({ selector: "#submit", description: "Submit application" }, ctx, h);
  assert.equal(cards[0].heading, "This will submit the form in your Chrome tab. Did you review every field?");
  assert.deepEqual(ctx.sent, [["browser_click", { selector: "#submit" }]]);
});

test("browser-bridge AC4: a click the user doesn't approve clicks nothing", async () => {
  for (const answer of [false, undefined]) {
    const ctx = relayCtx();
    const h = { ask: async () => answer, refusal: () => "The user declined." };
    const out = await tool("browser_click").run({ selector: "#next", description: "Next page" }, ctx, h);
    assert.equal(out, "The user declined.");
    assert.equal(ctx.sent.length, 0);
  }
});

// A minimal page for the extension's content script.
function fakeField({ tag = "input", type = "text", name = "", id = "", autocomplete = "" }) {
  const attrs = { type, name, autocomplete };
  return { tagName: tag.toUpperCase(), nodeType: 1, type, name, id, value: "", required: false, labels: [], placeholder: "", parentElement: null,
    getAttribute: k => attrs[k] ?? null };
}

test("browser-bridge AC5: password, SSN and card number fields are marked sensitive and not filled", async () => {
  const els = [
    fakeField({ name: "full_name", id: "name" }),
    fakeField({ type: "password", name: "pw", id: "pw" }),
    fakeField({ name: "ssn", id: "ssn" }),
    fakeField({ name: "card_number", id: "cc" })
  ];
  const byId = Object.fromEntries(els.map(e => [e.id, e]));
  const document = {
    title: "Apply", body: { innerText: "" },
    querySelectorAll: sel => sel === "input, textarea, select" ? els : sel.startsWith("#") && byId[sel.slice(1)] ? [byId[sel.slice(1)]] : [],
    querySelector: sel => byId[sel.slice(1)] || null
  };
  let listener;
  const ctx = { document, location: { href: "https://jobs.example/apply" }, chrome: { runtime: { onMessage: { addListener: f => { listener = f; }, removeListener: () => {} } } },
    window: {}, Event: class {}, InputEvent: class {} };
  ctx.globalThis = ctx;
  for (const e of els) { e.focus = () => {}; e.dispatchEvent = () => {}; }
  vm.runInNewContext(await readFile(new URL("../chrome-extension/target.js", import.meta.url), "utf8"), ctx);

  // Results come from the vm realm; copy them into this one before comparing.
  const here = v => JSON.parse(JSON.stringify(v));
  const { fields } = here(listener({ type: "mini-muse:tab-request", request: { type: "fields" } }));
  assert.deepEqual(fields.filter(f => f.sensitive).map(f => f.selector), ["#pw", "#ssn", "#cc"]);
  assert.ok(!fields.find(f => f.selector === "#name").sensitive);

  const out = here(listener({ type: "mini-muse:tab-request", request: { type: "fill", fields: ["#name", "#pw", "#ssn", "#cc"].map(selector => ({ selector, value: "x" })) } }));
  assert.deepEqual(out.filled, ["#name"]);
  assert.deepEqual(out.skipped, ["#pw", "#ssn", "#cc"]);
  assert.equal(byId.pw.value, "");
});
