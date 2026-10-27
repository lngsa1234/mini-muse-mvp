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
- **Persistence** is split: the **Library** stores documents in **Neon
  (Postgres)** with the original uploaded files in **Vercel Blob**
  (`/api/docs`); everything else (chat, ideas, goals, memory, prefs) still uses
  `localStorage`. The document schema has a `user_id` column so it's
  multi-user ready, but ships with one hardcoded dev user (see `server/auth.js`)
  until auth is added.
- **Connectors use sample data only** — nothing touches real accounts.

## Setup

Requires Node.js 18+ (uses the built-in `fetch`).

You'll need a free [Neon](https://neon.tech) Postgres database (for the Library)
and a [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) store (for
uploaded files).

```bash
npm install
cp .env.example .env
# edit .env: set OPENAI_API_KEY, DATABASE_URL (Neon), BLOB_READ_WRITE_TOKEN (Vercel Blob)
npm run db:init    # create tables + seed the example document (run once)
npm run dev        # or: npm start
npm test           # server unit tests
```

Then open http://localhost:3000.

## Developer evaluations

Mini Muse includes a small regression suite for agent behavior, seeded with
the résumé/goal-progress failure case. Run the no-cost checks with:

    npm test

Run the live model checks with:

    npm run evals

The live runner uses OPENAI_API_KEY, makes a few paid API requests, and exits
non-zero if the agent claims to have an unprovided résumé or marks goal progress
without evidence. Add cases in evals/cases.js whenever users report a failure.

### Models

The UI "Response style" toggle picks a tier:

| UI label  | Tier      | Env var         | Default                       |
|-----------|-----------|-----------------|-------------------------------|
| Fast      | `quick`   | `OPENAI_MODEL_QUICK`   | `gpt-4o-mini`     |
| Thorough  | `default` | `OPENAI_MODEL_DEFAULT` | `gpt-4o`          |

Set these in `.env` to any OpenAI models your account can access.

## Deploy to Vercel

The same app runs on Vercel without changes to the front-end. Vercel serves
the static `public/` folder, runs the LLM proxy as an Edge Function, and runs
the document API (`/api/docs`) as Node functions (`server/index.js` stays for
local dev only).

1. Push this repo to GitHub and import it in Vercel (framework preset:
   **Other** — there's no build step).
2. Add a **Neon** Postgres database (Vercel's Neon integration sets
   `DATABASE_URL` for you) and a **Vercel Blob** store (sets
   `BLOB_READ_WRITE_TOKEN`).
3. In **Project → Settings → Environment Variables**, add at least:

   | Variable            | Required | Example                     |
   |---------------------|----------|-----------------------------|
   | `OPENAI_API_KEY`    | yes      | `sk-...`                    |
   | `DATABASE_URL`      | yes      | `postgresql://...neon.tech/...` |
   | `BLOB_READ_WRITE_TOKEN` | yes  | `vercel_blob_rw_...`        |
   | `OPENAI_MODEL_QUICK` | no      | `gpt-4o-mini`               |
   | `OPENAI_MODEL_DEFAULT` | no    | `gpt-4o`                    |

4. Initialise the database once (locally, with the deployed `DATABASE_URL` in
   your `.env`): `npm run db:init`.
5. Deploy. The app is served at `/`, chat is proxied through `/api/llm`,
   documents through `/api/docs`, and `/api/healthz` reports whether a key is
   set.

The LLM proxy (`api/llm.js`) uses the Edge runtime so streaming responses
aren't cut off by the short default timeout on Node serverless functions. The
document routes (`api/docs/*`) use the Node runtime (for PDF/DOCX parsing and
the Blob SDK). `PORT` is only used by the local Express server; Vercel ignores
it.

## Project layout

```
public/
  index.html          page markup (each view marked with its owner)
  css/                styles, one file per area
  js/
    main.js           entry point: loads features, boots the app
    core/             registry, state, storage, api (docs client), navigation, activity log
    agent/            agent core: loop, transport, prompt, tools, run
    workflow/         approvals, background check-in
    features/         chat, ideas, goals, library, memory, connectors, settings, hood
server/
  index.js            Express: static hosting + /api/llm + /api/docs (local dev)
  proxy.js            builds the upstream request (shared with api/)
  routing.js          tier → model routing (shared with api/)
  auth.js             current user id (dev stub until real auth)
  db.js               Neon Postgres access for documents
  extract.js          pulls searchable text out of PDF/DOCX/TXT uploads
  docs.js             document request handlers (shared with api/docs/)
api/
  llm.js              Vercel Edge Function: LLM proxy, used when deployed
  healthz.js          Vercel Edge Function: key-configured check
  docs/               Vercel Node functions: list/create (index.js) + delete ([id].js)
db/
  schema.sql          Postgres tables (users, documents)
scripts/
  db-init.mjs         npm run db:init — creates tables + seeds the example doc
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
