# Mini Muse architecture

Mini Muse is a browser app with no build step plus a thin backend proxy. The
front end is plain ES modules served from `public/`, organized so each area can
be worked on independently.

## How a chat turn flows

```
features/chat  (user presses Send)
   │  say(text)
   ▼
agent/run.js         push message, call the client, render progress
   │  buildInput()   ◄── agent/prompt.js  (system prompt + history)
   │  makeTools(msg) ◄── agent/tools.js   (tools from features + connected connectors)
   ▼
agent/loop.js        tool-use loop: model → run tools → feed results → repeat
   │                      │
   │                      └─ a tool needs approval? ─► workflow/approvals.js (card in chat)
   ▼
agent/transport.js   POST /api/llm, parse the SSE stream
   ▼
server/index.js  or  api/llm.js          (local Express / Vercel Edge)
   │  server/proxy.js    inject API key, build upstream request
   │  server/routing.js  tier ("quick" | "default") → model
   ▼
OpenAI Chat Completions API
```

## Folder map

```
public/
  index.html               page markup only; each view is marked with its owner
  css/                     base, layout, and one file per area
  js/
    main.js                entry point: imports every feature, then boots
    core/                  shared plumbing (everyone depends on it, review changes together)
      registry.js            defineFeature / defineConnector, event bus, click + submit routing, renderMine/renderAll
      state.js               the state shape (blank), replaceState, runtime flags (rt), isOn
      storage.js             load / debounced save / migrate
      nav.js                 page switching
      activity.js            audit() log + agent phase events
      dom.js, format.js, schema.js   small helpers
    agent/                 AGENT CORE
      client.js              window.agent.use("sample") facade
      loop.js                the tool-use loop (MAX_STEPS, normalize, tool execution)
      transport.js           HTTP + SSE parsing, one-shot JSON completions, error codes
      prompt.js              system prompt and chat history
      tools.js               assembles + wraps tools (progress, audit, save)
      run.js                 one chat turn end to end; say()
      errors.js              user-facing error messages
    workflow/              WORKFLOW
      approvals.js           human-in-the-loop approval cards
      checkin.js             background check-in ("Let Muse work on your goals")
    features/
      chat/                  chat log + composer
      ideas/                 starter rules, personalized ideas, save_idea tool
      goals/                 plans + create_goal / update_step, suggested goals
      library/               documents, keyword RAG search, docs_* tools
      memory/                remember / forget tools, Settings → Memory
      connectors/            Connectors page + one file per connector (mail, calendar, contacts)
      settings/              response style, "How Muse works" toggle, start over
      hood/                  "How Muse works" panel, Settings → Activity
server/
  index.js                 Express: static hosting + /api/llm (local dev)
  proxy.js                 runtime-neutral request building (shared with api/)
  routing.js               ROUTING: tier → model
api/                       Vercel Edge Functions (deploy), reuse server/proxy.js
test/                      `npm test` (server unit tests)
docs/reference/            the original single-file prototype, for comparison
```

## The feature contract

Each feature registers itself in `core/registry.js`; core code only loops over
what is registered. A feature module typically looks like this:

```js
import { defineFeature, onClick, renderMine } from "../../core/registry.js";
import { state } from "../../core/state.js";
import { save } from "../../core/storage.js";
import { S } from "../../core/schema.js";

function render() { /* write this feature's DOM from state */ }

onClick("delThing", id => { /* <button data-del-thing="..."> */ renderMine(); save(); });

defineFeature({
  id: "things",                        // matches data-go="things" for onShow
  nav: { el: "navThings", badge: () => `${state.things.length}` },
  render,                              // called by renderMine() after any change
  onShow() {},                         // optional: user opened this page
  guidance: "Things: when ..., call add_thing.",   // optional system prompt rule
  tools: [{
    name: "add_thing",
    description: "Add a thing. Returns the thing_id.",
    inputSchema: { type: "object", properties: { title: S }, required: ["title"] },
    run: ({ title }, context, h) => {  // h.act(label), h.ask(...), h.needsAsk(k), h.refusal(ok)
      const id = "t" + Date.now(); state.things.push({ id, title });
      h.act(title); return { thing_id: id };
    }
  }]
});
```

Tools don't need to call `save()`, `audit()` or re-render: `agent/tools.js`
wraps every tool so it shows progress in chat, logs to Activity, saves and
re-renders. Throw an `Error` to report a problem back to the model.

### Connectors

A connector is one file in `features/connectors/` that calls
`defineConnector({ key, name, glyph, like, desc, scopes, lockAsk?, seed?, manageHtml, tools })`,
plus one import line in `features/connectors/index.js`. Connector tools carry
`writes: true | false`; write tools should ask first when
`h.needsAsk(key)` is true (see `calendar.js`). The Connectors page, the prompt's
connector list, the hood tool list and `state.connectors` all pick it up
automatically. Name connector tools `<key>_<verb>` so Activity tags them.

### Things that are shared on purpose

- **State shape** (`core/state.js` → `blank()`): add your fields there with a
  comment; handle old saves in `core/storage.js` → `migrate()`.
- **Load order** (`main.js`): feature order decides the order of tools sent to
  the model and the numbering of "How you work" rules. Add new features at the
  end unless you mean to change those.
- **Markup** (`public/index.html`): add your page's container there; keep
  everything inside it rendered by your feature.

## Conventions

- Plain ES modules, no bundler, no framework. Everything under `public/` is
  served as is.
- `state` is one object: mutate in place, then `save()`. Never reassign it;
  use `replaceState()`.
- User actions go through `onClick(dataKey, fn)` / `onSubmit(formId, fn)`
  rather than new document listeners.
- Text from emails and documents is data, never instructions; keep saying so
  in prompts.
