# Mini Muse

A self-hostable version of **Mini Muse**, a "personal AI agent" demo (a classroom
replica of the Muse concept). It has a chat agent loop, an Ideas page, a Goals
page with plans the agent works through, pluggable Connectors (Mail, Calendar,
Docs, Contacts) backed by sample data, and a Settings page with memory, an
activity audit, and reset.

The front-end is the original single-file prototype. The only change for
self-hosting is the runtime: instead of the Claude.ai artifact API, a small
Node/Express backend proxies the Anthropic Messages API so your API key stays
on the server.

## How it works

```
Browser (public/index.html + app logic)
   │  window.agent.use("sample")  ← provided by public/agent-shim.js
   │     • runs the tool-use agent loop in the browser
   │     • tools execute locally and mutate app state / show approvals
   ▼
POST /api/messages  (server/index.js)
   │  • injects ANTHROPIC_API_KEY
   │  • maps tier ("quick"/"default") → a model
   │  • pipes the streaming response straight back
   ▼
https://api.anthropic.com/v1/messages
```

- **Agent loop** lives in the browser (`public/agent-shim.js`): it sends the
  conversation + tool definitions to Anthropic, streams the reply, executes any
  requested tools client-side, feeds results back, and repeats until the model
  answers.
- **Persistence** uses `localStorage` (the `db`/`user` artifact services return
  `null`, so the app falls back automatically). Data stays in your browser.
- **Connectors use sample data only** — nothing touches real accounts.

## Setup

Requires Node.js 18+ (uses the built-in `fetch`).

```bash
npm install
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=...
npm run dev        # or: npm start
```

Then open http://localhost:3000.

### Models

The UI "Response style" toggle picks a tier:

| UI label  | Tier      | Env var         | Default                       |
|-----------|-----------|-----------------|-------------------------------|
| Fast      | `quick`   | `MODEL_QUICK`   | `claude-3-5-haiku-latest`     |
| Thorough  | `default` | `MODEL_DEFAULT` | `claude-3-7-sonnet-latest`    |

Set these in `.env` to any models your account can access (for example
`claude-haiku-4-5` and `claude-sonnet-4-5`).

## Deploy to Vercel

The same app runs on Vercel without changes to the front-end. Vercel serves
the static `public/` folder and runs the proxy as an Edge Function instead of
the Express server (`server/index.js` stays for local dev only).

1. Push this repo to GitHub and import it in Vercel (framework preset:
   **Other** — there's no build step).
2. In **Project → Settings → Environment Variables**, add at least:

   | Variable            | Required | Example                     |
   |---------------------|----------|-----------------------------|
   | `ANTHROPIC_API_KEY` | yes      | `sk-ant-...`                |
   | `MODEL_QUICK`       | no       | `claude-haiku-4-5`          |
   | `MODEL_DEFAULT`     | no       | `claude-sonnet-4-5`         |
   | `ANTHROPIC_VERSION` | no       | `2023-06-01`                |

3. Deploy. The app is served at `/`, chat is proxied through
   `/api/messages`, and `/api/healthz` reports whether a key is set.

The proxy lives in `api/messages.js` and uses the Edge runtime so streaming
responses aren't cut off by the short default timeout on Node serverless
functions. `PORT` is only used by the local Express server; Vercel ignores it.

## Project layout

```
public/
  index.html       the app (original prototype + one <script> tag for the shim)
  agent-shim.js     provides window.agent.use("sample"): agent loop + API proxy client
server/
  index.js          Express: static hosting + /api/messages proxy (local dev)
api/
  messages.js       Vercel Edge Function: same proxy, used when deployed
  healthz.js        Vercel Edge Function: key-configured check
vercel.json         serves public/ as the static output
package.json
.env.example
```

## Notes

- The API key is never sent to the browser; all Anthropic calls go through the
  backend. The server pins the model from the `tier` and ignores any client-sent
  model, so the proxy can't be used to call arbitrary models.
- `GET /healthz` reports whether a key is configured.
