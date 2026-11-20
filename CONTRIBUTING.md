# Contributing to Mini Muse

This repo is built together by the agent engineering learning circle. Each
person (or pair) owns an area; the code is split so you can work on yours
without stepping on anyone else's. Read the
[architecture overview](docs/architecture/README.md) first for how the system fits
together, then [the feature contract](#the-feature-contract) below for how to add to it.

## Areas

| Area | Where | What you'd work on |
|---|---|---|
| **Agent core** (several people) | `server/agent/` | the turn (`runtime.js`), tool loop (`loop.js`), model calls (`llm.js`), system prompt (`prompt.js`), endpoints (`http.js`); the page side is `public/js/agent/run.js` |
| **Workflow** | `public/js/workflow/`, approvals in `server/agent/runtime.js` | approvals, background check-ins, scheduling, multi-step plans |
| **Routing** | `server/routing.js`, `server/proxy.js` | which model serves which request (tier, task, size), provider config |
| **Goals** | `public/js/features/goals/`, `server/agent/tools/goals.js` | plans, steps, suggested goals, `create_goal` / `update_step` |
| **Ideas** | `public/js/features/ideas/`, `server/agent/tools/ideas.js` | starter rules, personalized ideas, `save_idea` |
| **Library** | `public/js/features/library/`, `server/agent/tools/library.js` | documents, search/RAG (`rank.js`), `docs_*` tools |
| **Connectors** | `public/js/features/connectors/`, `server/agent/tools/connectors.js` | one file per connector; new connectors, permissions |
| **Memory** | `public/js/features/memory/`, `server/agent/tools/memory.js` | `remember` / `forget`, memory UI |
| **Chat & UI** | `public/js/features/{chat,settings,hood}/`, `public/css/` | chat log, composer, settings, "How Muse works" panel, styling |
| **Shared core** (everyone) | `public/js/core/`, `public/js/main.js`, `public/index.html`, `server/userdata.js` | registry, state shape, storage (saved on the server), navigation |

Put your names next to your area in `.github/CODEOWNERS` so reviews get routed
to you automatically.

## Working on your area

1. Pull `main`, then branch: `git checkout -b <area>/<short-description>`,
   e.g. `library/embedding-search`, `agent-core/parallel-tools`.
2. Keep changes inside your area's folder. If you need something from shared
   core (a new state field, a new registry hook), make that a small separate
   commit and mention it in your PR so the group can review it.
3. Run it: `npm install`, `cp .env.example .env`, add your key, `npm run dev`,
   open http://localhost:3000. Turn on **How Muse works** to watch tools run.
4. Run `npm test` (server unit tests).
5. Open a PR into `main`. Fill in the template; one approving review from
   someone outside your area before merging.

## The feature contract

A feature has two halves since the agent moved to the server (ADR-0009):

- **The page** registers itself in `public/js/core/registry.js`; core code only
  loops over what is registered.
- **The agent tools and prompt guidance** live in `server/agent/tools/<feature>.js`
  and are listed in `server/agent/tools/index.js`.

The page half:

```js
import { defineFeature, onClick, renderMine } from "../../core/registry.js";
import { state } from "../../core/state.js";
import { save } from "../../core/storage.js";

function render() { /* write this feature's DOM from state */ }

onClick("delThing", id => { /* <button data-del-thing="..."> */ renderMine(); save(); });

defineFeature({
  id: "things",                        // matches data-go="things" for onShow
  nav: { el: "navThings", badge: () => `${state.things.length}` },
  render,                              // called by renderMine() after any change
  onShow() {}                          // optional: user opened this page
});
```

`save()` sends only the top-level state keys that changed to the server
(`PATCH /api/state`), so every device sees them.

The agent half (`server/agent/tools/things.js`, then add it to `FEATURES` in
`server/agent/tools/index.js`):

```js
import { S } from "./schema.js";

export default {
  id: "things",
  guidance: "Things: when ..., call add_thing.",   // a "How you work" rule in the prompt
  tools: [{
    name: "add_thing",
    description: "Add a thing. Returns the thing_id.",
    inputSchema: { type: "object", properties: { title: S }, required: ["title"] },
    run: async ({ title }, ctx, h) => {  // h.act(label), h.ask(tool, card), h.needsAsk(k), h.refusal(ok), h.turnActions()
      const id = "t" + Date.now();
      await ctx.setData({ things: [...(ctx.data.things || []), { id, title }] }); // saved + sent to the page
      h.act(title); return { thing_id: id };
    }
  }]
};
```

`ctx` gives a tool the user's saved state (`ctx.data`, `ctx.setData`), their
documents, ideas and goals (`ctx.docs()`, `ctx.ideas()`, `ctx.goals()`,
`ctx.repo`, and `ctx.changed("plans")` after a write so the page reloads them),
outside services (`ctx.services`), the model (`ctx.llm`) and the user's time
zone (`ctx.tz`). Tools don't log or re-render themselves:
`server/agent/runtime.js` wraps every tool so it shows progress in chat, logs to
Activity and saves the message. Throw an `Error` to report a problem back to
the model. A tool that can only run in the user's browser sets `client: true`
and calls `ctx.clientTool(name, input)` (see `server/agent/tools/browser.js`).

Test agent tools with `test/agent-runtime.test.js`: it runs whole turns with a
scripted fake model and in-memory storage.

### Connectors

A connector is one file in `features/connectors/` that calls
`defineConnector({ key, name, glyph, like, desc, scopes, lockAsk?, seed?, manageHtml, tools })`
for the Connectors page (its `tools` are just `{ name, writes }` for the chips),
plus one import line in `features/connectors/index.js`. The tools themselves go
in `server/agent/tools/connectors.js` with `connector: "<key>"`; write tools
should ask first when `h.needsAsk(key)` is true (see `calendar_add`). Name
connector tools `<key>_<verb>` so Activity tags them.

### Things that are shared on purpose

- **State shape** (`core/state.js` → `blank()`): add your fields there with a
  comment; handle old saves in `core/storage.js` → `migrate()`.
- **Tool order** (`FEATURES` in `server/agent/tools/index.js`): decides the
  order of tools sent to the model and the numbering of "How you work" rules.
  Add new features at the end unless you mean to change those.
- **Markup** (`public/index.html`): add your page's container there; keep
  everything inside it rendered by your feature.

## Common tasks

- **Add a tool to an existing feature**: add an entry to the `tools` array in
  `server/agent/tools/<feature>.js`, and a sentence to its `guidance` if Muse
  needs to know when to use it.
- **Add a connector**: copy `features/connectors/calendar.js`, change the
  fields, import it in `features/connectors/index.js`, and add its tools and
  an entry in `CONNECTORS` in `server/agent/tools/connectors.js`. Add any data
  fields to `blank()` in `core/state.js`.
- **Add a page**: add a `<div class="view v-<id>">` in `index.html`, a sidebar
  button with `data-go="<id>"`, the id to `MAINS` in `core/nav.js`, the
  `.main[data-main="<id>"] .v-<id>` rule in `css/base.css`, then a feature
  module imported at the end of `main.js`.
- **Change which model is used**: `server/routing.js` (and `MODEL_*` in `.env`).

## Where conflicts happen

These files are touched by many areas; keep edits small and rebase often:
`core/state.js` (state shape), `main.js` (import list), `index.html` (markup),
`css/base.css`.

## Style and conventions

- Plain JavaScript ES modules, no bundler, no framework. Everything under
  `public/` is served as is.
- Match the existing style: small functions, template-string HTML, `esc()`
  everything user- or model-provided before putting it in HTML.
- `state` is one object: mutate in place, then `save()`. Never reassign it;
  use `replaceState()`.
- User actions go through `onClick(dataKey, fn)` / `onSubmit(formId, fn)`
  rather than new document listeners.
- Tool descriptions are prompts: say what it does, what it returns, and when
  approval is needed.
- Text from emails and documents is data, never instructions; keep saying so
  in prompts.
