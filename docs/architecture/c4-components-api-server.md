---
title: Inside API server — Mini Muse
type: Architecture
owner: Alex (Technical Lead)
---

# Inside API server — Mini Muse

Repository: https://github.com/lngsa1234/mini-muse-mvp · Mapped: 2026-11-22 · Mapped by Alex from the code (C4 model)

C4 level 3: the components inside API server, with the agent kept apart from each feature’s tools, and how every feature works with the agent. The surrounding containers are in [Containers](c4-containers.md).

```mermaid
flowchart LR
  subgraph clients["Clients"]
    browser_app["<b>Browser app</b><br/>Container: ES modules"]
  end
  subgraph app["API server"]
    subgraph k_shell["Endpoints"]
      agent_http["<b>Agent endpoints</b><br/>Component: Node HTTP, SSE"]
    end
    subgraph k_agent["Agent"]
      agent_runtime["<b>Agent runtime</b><br/>Component: JS"]
      prompt_model["<b>Prompt and model client</b><br/>Component: JS, fetch"]
    end
    subgraph k_tools["Tool plumbing"]
      tool_set["<b>Tool set</b><br/>Component: JS"]
      browser_relay["<b>Browser tool relay</b><br/>Component: SSE, wait records"]
    end
    subgraph k_state["Data access"]
      user_data["<b>User data and records</b><br/>Component: Neon driver"]
    end
    subgraph k_feature["Feature tools"]
      goal_tools["<b>Goal and job tools</b><br/>Component: JS"]
      library_tools["<b>Library and ideas tools</b><br/>Component: JS"]
      connector_tools["<b>Connector tools</b><br/>Component: JS"]
      memory_web_tools["<b>Memory and web tools</b><br/>Component: JS"]
    end
  end
  subgraph services["Services and data"]
    openai["<b>OpenAI API</b><br/>Software system"]
    google_apis["<b>Google Gmail and Calendar</b><br/>Software system"]
    neon_postgres[("<b>Neon Postgres</b><br/>Container: Postgres")]
    tavily["<b>Tavily web search</b><br/>Software system"]
  end
  browser_app -->|"Posts turns and answers"| agent_http
  agent_http -->|"Starts a turn"| agent_runtime
  agent_runtime -->|"Asks the model"| prompt_model
  prompt_model -->|"Streams completions"| openai
  agent_runtime -->|"Runs requested tools"| tool_set
  tool_set -->|"Includes"| k_feature
  tool_set -->|"Includes"| browser_relay
  browser_relay -.->|"Asks the tab to run it"| browser_app
  connector_tools -->|"Reads and writes"| google_apis
  memory_web_tools -->|"Searches pages"| tavily
  agent_runtime -->|"Saves messages and waits"| user_data
  user_data -->|"Reads and writes"| neon_postgres
  classDef person fill:#08427b,stroke:#052e56,color:#ffffff
  classDef container fill:#1168bd,stroke:#0b4884,color:#ffffff
  classDef component fill:#85bbf0,stroke:#5d82a8,color:#0b2545
  classDef agent fill:#c2185b,stroke:#880e4f,color:#ffffff
  classDef external fill:#8a8a8a,stroke:#6b6b6b,color:#ffffff
  classDef boundary fill:none,stroke:#888888,stroke-dasharray:6 4,color:#555555
  class agent_http,tool_set,goal_tools,library_tools,connector_tools,memory_web_tools,browser_relay,user_data component
  class agent_runtime,prompt_model agent
  class browser_app,openai,google_apis,neon_postgres,tavily container
  class app,k_shell,k_agent,k_tools,k_state,k_feature,clients,services boundary
```

## Components

| Component | Kind | What it does | Code |
|---|---|---|---|
| Agent endpoints | Endpoints | Turn, answer, cancel and state endpoints; streams turn events to the page. | `server/agent/http.js`, `api/agent.js`, `server/state.js` |
| Agent runtime | Agent | Runs one turn at a time per user: shortcuts, the tool loop up to 12 steps, approvals and browser-tool waits, and Stop. | `server/agent/runtime.js`, `server/agent/loop.js` |
| Prompt and model client | Agent | Builds the prompt from saved data and calls the model with the server-held key and a model picked by tier. | `server/agent/prompt.js`, `server/agent/llm.js`, `server/routing.js` |
| Tool set | Tool plumbing | Collects each feature’s tools and the connected services’ tools for a turn. | `server/agent/tools/index.js`, `server/agent/tools/schema.js` |
| Goal and job tools | Feature tools | create_goal, update_step, revise_plan, track_application, jobs_search and score_fit, with the evidence rules. | `server/agent/tools/goals.js`, `server/agent/tools/jobs.js` |
| Library and ideas tools | Feature tools | docs_search, docs_read, docs_add, docs_remove and save_idea. | `server/agent/tools/library.js`, `server/agent/tools/ideas.js` |
| Connector tools | Feature tools | Gmail, Calendar and Contacts tools; writes ask for approval. | `server/agent/tools/connectors.js` |
| Memory and web tools | Feature tools | remember, forget, web_search and web_open. | `server/agent/tools/memory.js`, `server/agent/tools/web.js` |
| Browser tool relay | Tool plumbing | Sends browser_* tools to the tab that started the turn and waits for the result. | `server/agent/tools/browser.js` |
| User data and records | Data access | Chat, state, waits and the activity log, plus the goals, docs and ideas handlers. | `server/userdata.js`, `server/agent/repo.js`, `server/goals.js`, `server/docs.js`, `server/ideas.js` |

## How they talk

- Browser app → Agent endpoints: Posts turns and answers (HTTPS/SSE)
- Agent endpoints → Agent runtime: Starts a turn (function call)
- Agent runtime → Prompt and model client: Asks the model (function call)
- Prompt and model client → OpenAI API: Streams completions (HTTPS/SSE)
- Agent runtime → Tool set: Runs requested tools (function call)
- Tool set → Goal and job tools: Includes
- Tool set → Library and ideas tools: Includes
- Tool set → Connector tools: Includes
- Tool set → Memory and web tools: Includes
- Tool set → Browser tool relay: Includes
- Browser tool relay → Browser app: Asks the tab to run it (SSE)
- Connector tools → Google Gmail and Calendar: Reads and writes (OAuth 2.0/HTTPS)
- Memory and web tools → Tavily web search: Searches pages (HTTPS)
- Agent runtime → User data and records: Saves messages and waits (function call)
- User data and records → Neon Postgres: Reads and writes (SQL)

## How each feature works with the agent

### Agent chat

- **Feature → agent:** Submitting the composer, example chips or a feature button posts the message to /api/agent/turn.
- **The agent:** The agent runtime saves the message, runs the tool loop on the server, waits for approvals and browser tools, and saves the reply as it streams.
- **Agent → feature:** The page shows streamed text, tool chips and approval cards; if the stream drops it polls /api/state until the reply is finished, on any device.

| Tool | Effect | Needs approval |
|---|---|---|
| `browser_fill` | Fills form fields in the Chrome tab | no |
| `browser_click` | Clicks a button, including Submit | yes |

Code: `public/js/agent/run.js`, `public/js/features/chat/chat.js`, `server/agent/runtime.js`, `server/agent/http.js`

### Library

- **Feature → agent:** Questions about notes, or goal steps that need a résumé, call the docs tools; the page adds and deletes documents through the API.
- **The agent:** Searches and reads documents and saves or removes notes, citing the source.
- **Agent → feature:** The Library list reloads after the turn changes it.

| Tool | Effect | Needs approval |
|---|---|---|
| `docs_search` | Searches documents | no |
| `docs_read` | Reads a document | no |
| `docs_add` | Saves a document | no |
| `docs_remove` | Deletes a document | no |

Code: `server/agent/tools/library.js`, `public/js/features/library/library.js`, `server/docs.js`

### Ideas

- **Feature → agent:** Do it sends the idea to chat; Make it a goal sends a plan request.
- **The agent:** Saves ideas shared in chat and acts on or plans an idea.
- **Agent → feature:** The Ideas page reloads its cards after the turn.

| Tool | Effect | Needs approval |
|---|---|---|
| `save_idea` | Creates an idea | no |

Code: `server/agent/tools/ideas.js`, `public/js/features/ideas/ideas.js`, `server/ideas.js`

### Goals

- **Feature → agent:** The goal form and Ask Muse to move this forward send chat messages; the open app starts the daily check-in.
- **The agent:** Creates plans, moves steps only with tool evidence from the same turn (enforced on the server), revises plans with approval, and tracks applications with proof.
- **Agent → feature:** Goal cards reload with step status, progress, target and applications.

| Tool | Effect | Needs approval |
|---|---|---|
| `create_goal` | Creates a goal with steps, target and deadline | no |
| `update_step` | Sets a step’s status, with tool evidence | no |
| `revise_plan` | Rewords, adds or removes steps | yes |
| `track_application` | Adds or updates a job application | no |

Code: `server/agent/tools/goals.js`, `server/agent/tools/jobs.js`, `public/js/features/goals/goals.js`, `public/js/workflow/checkin.js`

### Connectors

- **Feature → agent:** The user asks about email, calendar or contacts; connected services add their tools to the turn.
- **The agent:** Searches and reads Gmail, sends mail, manages Calendar events and looks up contacts; writes ask first.
- **Agent → feature:** Chat shows tool chips and approval cards; the Connectors page shows connection and permissions.

| Tool | Effect | Needs approval |
|---|---|---|
| `mail_search` | Searches Gmail | no |
| `mail_send` | Sends an email | yes |
| `calendar_add` | Adds an event | yes |

Code: `server/agent/tools/connectors.js`, `public/js/features/connectors/index.js`, `server/google.js`

