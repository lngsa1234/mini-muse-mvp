---
title: Containers — Mini Muse
type: Architecture
owner: Alex (Technical Lead)
---

# Containers — Mini Muse

> **Out of date since 2026-11-20.** [ADR-0008](../adr/0008-keep-chat-memory-and-settings-on-the-server-not-in-localstorage.md) moved chat, memory and settings from localStorage to Postgres, and [ADR-0009](../adr/0009-run-the-agent-loop-on-the-server.md) moved the agent loop, prompt and tools to the server (`server/agent/`). This map still shows the browser loop and is due to be mapped again.

Repository: https://github.com/lngsa1234/mini-muse-mvp · Mapped: 2026-11-18 · Mapped by Alex from the code (C4 model)

C4 level 2: the deployable parts and data stores, how they talk, and the people and outside systems around them. The inside of the browser app, and how each feature works with the agent, is in [Components](c4-components-browser-app.md). How requests flow step by step is in [Workflows](workflows/README.md).

Mini Muse is a no-build browser app with a small Node/Express (or Vercel function) backend. The tool-use agent loop runs in the browser. It streams model calls through a server proxy to OpenAI and runs feature tools locally. Those tools call the backend for Neon Postgres storage (documents, ideas, goals, traces), Gmail and Calendar through Google OAuth, and Tavily and job-board search. An optional Chrome extension lets the agent fill in job application forms.

```mermaid
flowchart TB
  p_user(["<b>User</b><br/>Person"])
  subgraph system["Mini Muse"]
    subgraph client["Client"]
      browser_app["<b>Browser app</b><br/>Container: ES modules"]
      chrome_extension["<b>Chrome Browser Bridge</b><br/>Container: Chrome extension"]
    end
    subgraph server["Server"]
      api_server["<b>API server</b><br/>Container: Express / Vercel functions"]
    end
    subgraph data["Data"]
      local_storage[("<b>Browser storage</b><br/>Container: localStorage")]
      neon_postgres[("<b>Neon Postgres</b><br/>Container: Postgres")]
    end
  end
  subgraph external["External systems"]
    openai["<b>OpenAI API</b><br/>Software system"]
    google_apis["<b>Google Gmail and Calendar</b><br/>Software system"]
    tavily["<b>Tavily web search</b><br/>Software system"]
  end
  p_user -->|"Chats with Muse, manages ideas, goals and documents, approves actions"| browser_app
  browser_app -->|"Streams model completions"| api_server
  api_server -->|"Proxies completions with key"| openai
  api_server -->|"Reads and writes records"| neon_postgres
  browser_app -->|"Saves chat, memory, prefs"| local_storage
  api_server -->|"Searches mail, manages events"| google_apis
  api_server -->|"Searches and extracts pages"| tavily
  browser_app -->|"Sends browser commands"| chrome_extension
  local_storage ~~~ google_apis
  classDef person fill:#08427b,stroke:#052e56,color:#ffffff
  classDef container fill:#1168bd,stroke:#0b4884,color:#ffffff
  classDef component fill:#85bbf0,stroke:#5d82a8,color:#0b2545
  classDef agent fill:#c2185b,stroke:#880e4f,color:#ffffff
  classDef external fill:#8a8a8a,stroke:#6b6b6b,color:#ffffff
  classDef boundary fill:none,stroke:#888888,stroke-dasharray:6 4,color:#555555
  class p_user person
  class browser_app,chrome_extension,api_server,local_storage,neon_postgres container
  class openai,google_apis,tavily external
  class system,client,server,data,external boundary
```

## People

- **User** — Person using Muse as a personal agent: chats with Muse, manages ideas, goals and documents, approves actions

## External systems

- **OpenAI API** (Chat Completions): Model that answers agent turns and one-shot JSON completions, selected by tier.
- **Google Gmail and Calendar** (Google OAuth 2.0): User's real Gmail inbox and primary calendar, reached with a token kept in an encrypted HttpOnly cookie.
- **Tavily web search** (Tavily API): Web search and page extraction used by web_search and web_open.

## Containers

| Container | Layer | Technology | What it does | Code |
|---|---|---|---|---|
| Browser app | Client | ES modules | Plain ES-module UI with pages for chat, ideas, goals, library, connectors and settings, plus the in-browser agent loop, tools and approvals. | `public/index.html`, `public/js/main.js`, `public/js/agent`, `public/js/features` |
| Chrome Browser Bridge | Client | Chrome extension | Optional extension that opens, reads, fills and clicks in a job application tab on request of the page. | `chrome-extension/background.js`, `chrome-extension/muse-bridge.js`, `chrome-extension/target.js`, `chrome-extension/manifest.json` |
| Browser storage | Data | localStorage | Holds chat, memory, preferences, contacts and a cache of state in the browser. | `public/js/core/storage.js`, `public/js/core/state.js` |
| API server | Server | Express / Vercel functions | Serves static files and the handlers for the LLM proxy, docs, ideas, goals, web search/open, job search, Google OAuth/Gmail/Calendar and traces, shared between Express and Vercel functions. | `server/index.js`, `server/proxy.js`, `server/google.js`, `api` |
| Neon Postgres | Data | Postgres | Stores Library documents, ideas, goals (steps, applications) and observability traces per user. | `db/schema.sql`, `server/db.js` |
| OpenAI API | External services | Chat Completions | Model that answers agent turns and one-shot JSON completions, selected by tier. |  |
| Google Gmail and Calendar | External services | Google OAuth 2.0 | User's real Gmail inbox and primary calendar, reached with a token kept in an encrypted HttpOnly cookie. |  |
| Tavily web search | External services | Tavily API | Web search and page extraction used by web_search and web_open. |  |

## Relationships

- Browser app → API server: Streams model completions (HTTPS/SSE /api/llm)
- API server → OpenAI API: Proxies completions with key (HTTPS/SSE)
- API server → Neon Postgres: Reads and writes records (SQL)
- Browser app → Browser storage: Saves chat, memory, prefs (localStorage)
- API server → Google Gmail and Calendar: Searches mail, manages events (OAuth 2.0/HTTPS)
- API server → Tavily web search: Searches and extracts pages (HTTPS)
- Browser app → Chrome Browser Bridge: Sends browser commands (window.postMessage)

## Not confirmed

- Did not read agent/loop.js, tools.js, approvals.js or core/api.js in full; the approval and transport flow is inferred from the architecture doc and tool code.
- Did not read server/db.js, trace code or the Chrome extension source, and did not confirm the memory, web_search, web_open, jobs_search or score_fit tool definitions.
- Contacts tools names and approval behavior were not confirmed beyond the file header.
- Job-board APIs (Greenhouse, Lever, Ashby) were not shown as a component; the server reaches them through its job search handler.
- Not all tool needsApproval flags were verified in the agent policy code, and docs_add has no approval in the code I read.
