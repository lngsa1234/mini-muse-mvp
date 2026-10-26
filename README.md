# Mini Muse

A self-hostable version of **Mini Muse**, a "personal AI agent" demo (a classroom
replica of the Muse concept). It has a chat agent loop, an Ideas page, a Goals
page with plans the agent works through, a Library of documents it searches
and cites, pluggable Connectors (Mail, Calendar, Contacts) backed by sample
data, and a Settings page with memory, an activity audit, and reset.

The front end started as a single-file prototype (kept in
`docs/reference/original-prototype.html`) and is now split into small ES
modules, one folder per area, so the learning circle can build it together.
A small Node/Express backend proxies the OpenAI API so your API key
stays on the server. There's no build step.

**Building this with the circle?** Start with [CONTRIBUTING.md](CONTRIBUTING.md)
(who owns what, branching, PRs) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
(folder map, how a chat turn flows, how to add a tool, connector or page).

## How it works

```
Browser (public/js: features register tools + pages; agent/ runs the loop)
   │  agent/loop.js
   │     • runs the tool-use agent loop in the browser
   │     • tools execute locally and mutate app state / show approvals
   ▼
POST /api/llm       (server/index.js locally, api/llm.js on Vercel)
   │  • injects OPENAI_API_KEY               (server/proxy.js)
   │  • maps tier ("quick"/"default") → model (server/routing.js)
   │  • pipes the streaming response straight back
   ▼
https://api.openai.com/v1/chat/completions
```

- **Agent loop** lives in the browser (`public/js/agent/`): it sends the
  conversation + tool definitions to OpenAI, streams the reply, executes any
  requested tools client-side, feeds results back, and repeats until the model
  answers.
- **Features** (`public/js/features/`) each register their own page, tools and
  prompt guidance, so adding a tool or connector touches one folder.
- **Persistence** uses `localStorage` (the `db`/`user` artifact services return
  `null`, so the app falls back automatically). Data stays in your browser.
- **Connectors use sample data only** — nothing touches real accounts.

## Setup

Requires Node.js 18+ (uses the built-in `fetch`).

```bash
npm install
cp .env.example .env
# edit .env and set OPENAI_API_KEY=...
npm run dev        # or: npm start
npm test           # server unit tests
```

Then open http://localhost:3000.

### Models

The UI "Response style" toggle picks a tier:

| UI label  | Tier      | Env var         | Default                       |
|-----------|-----------|-----------------|-------------------------------|
| Fast      | `quick`   | `OPENAI_MODEL_QUICK`   | `gpt-4o-mini`     |
| Thorough  | `default` | `OPENAI_MODEL_DEFAULT` | `gpt-4o`          |

Set these in `.env` to any OpenAI models your account can access.

## Deploy to Vercel

The same app runs on Vercel without changes to the front-end. Vercel serves
the static `public/` folder and runs the proxy as an Edge Function instead of
the Express server (`server/index.js` stays for local dev only).

1. Push this repo to GitHub and import it in Vercel (framework preset:
   **Other** — there's no build step).
2. In **Project → Settings → Environment Variables**, add at least:

   | Variable            | Required | Example                     |
   |---------------------|----------|-----------------------------|
   | `OPENAI_API_KEY`    | yes      | `sk-...`                    |
   | `OPENAI_MODEL_QUICK` | no      | `gpt-4o-mini`               |
   | `OPENAI_MODEL_DEFAULT` | no    | `gpt-4o`                    |

3. Deploy. The app is served at `/`, chat is proxied through
   `/api/llm`, and `/api/healthz` reports whether a key is set.

The proxy lives in `api/llm.js` and uses the Edge runtime so streaming
responses aren't cut off by the short default timeout on Node serverless
functions. `PORT` is only used by the local Express server; Vercel ignores it.

## Project layout

```
public/
  index.html          page markup (each view marked with its owner)
  css/                styles, one file per area
  js/
    main.js           entry point: loads features, boots the app
    core/             registry, state, storage, navigation, activity log
    agent/            agent core: loop, transport, prompt, tools, run
    workflow/         approvals, background check-in
    features/         chat, ideas, goals, library, memory, connectors, settings, hood
server/
  index.js            Express: static hosting + /api/llm proxy (local dev)
  proxy.js            builds the upstream request (shared with api/)
  routing.js          tier → model routing (shared with api/)
api/
  llm.js              Vercel Edge Function: same proxy, used when deployed
  healthz.js          Vercel Edge Function: key-configured check
test/                 npm test
docs/                 ARCHITECTURE.md, reference/original-prototype.html
vercel.json           serves public/ as the static output
```

Full map and the feature contract: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Notes

- The API key is never sent to the browser; all OpenAI calls go through the
  backend. The server pins the model from the `tier` and ignores any client-sent
  model, so the proxy can't be used to call arbitrary models.
- `GET /healthz` reports whether a key is configured.
