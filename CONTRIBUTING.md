# Contributing to Mini Muse

This repo is built together by the agent engineering learning circle. Each
person (or pair) owns an area; the code is split so you can work on yours
without stepping on anyone else's. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
first: it has the folder map and the feature contract.

## Areas

| Area | Where | What you'd work on |
|---|---|---|
| **Agent core** (several people) | `public/js/agent/` | the tool loop (`loop.js`), streaming/transport (`transport.js`), system prompt (`prompt.js`), tool framework (`tools.js`), turn handling (`run.js`) |
| **Workflow** | `public/js/workflow/` | approvals, background check-ins, scheduling, multi-step plans |
| **Routing** | `server/routing.js`, `server/proxy.js` | which model serves which request (tier, task, size), provider config |
| **Goals** | `public/js/features/goals/` | plans, steps, suggested goals, `create_goal` / `update_step` |
| **Ideas** | `public/js/features/ideas/` | starter rules, personalized ideas, `save_idea` |
| **Library** | `public/js/features/library/` | documents, search/RAG (`search.js`), `docs_*` tools |
| **Connectors** | `public/js/features/connectors/` | one file per connector; new connectors, permissions |
| **Memory** | `public/js/features/memory/` | `remember` / `forget`, memory UI |
| **Chat & UI** | `public/js/features/{chat,settings,hood}/`, `public/css/` | chat log, composer, settings, "How Muse works" panel, styling |
| **Shared core** (everyone) | `public/js/core/`, `public/js/main.js`, `public/index.html` | registry, state shape, storage, navigation |

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

## Common tasks

- **Add a tool to an existing feature**: add an entry to that feature's
  `tools` array, and a sentence to its `guidance` if Muse needs to know when
  to use it. No other file changes.
- **Add a connector**: copy `features/connectors/calendar.js`, change the
  fields, import it in `features/connectors/index.js`. Add any data fields to
  `blank()` in `core/state.js`.
- **Add a page**: add a `<div class="view v-<id>">` in `index.html`, a sidebar
  button with `data-go="<id>"`, the id to `MAINS` in `core/nav.js`, the
  `.main[data-main="<id>"] .v-<id>` rule in `css/base.css`, then a feature
  module imported at the end of `main.js`.
- **Change which model is used**: `server/routing.js` (and `MODEL_*` in `.env`).

## Where conflicts happen

These files are touched by many areas; keep edits small and rebase often:
`core/state.js` (state shape), `main.js` (import list), `index.html` (markup),
`css/base.css`.

## Style

- Plain JavaScript ES modules, no build step, no framework.
- Match the existing style: small functions, template-string HTML, `esc()`
  everything user- or model-provided before putting it in HTML.
- Tool descriptions are prompts: say what it does, what it returns, and when
  approval is needed.
