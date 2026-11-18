---
title: System context — Mini Muse
type: Architecture
owner: Alex (Technical Lead)
---

# System context — Mini Muse

Repository: https://github.com/lngsa1234/mini-muse-mvp · Mapped: 2026-11-18 · Mapped by Alex from the code (C4 model)

C4 level 1: who uses the system and which outside systems it depends on. The parts inside it are in [Containers](c4-containers.md).

```mermaid
C4Context
  title System context for Mini Muse
  Person(user, "User", "Person chatting with Muse and managing goals")
  System(system, "Mini Muse", "Mini Muse is a no-build browser app whose chat agent loop runs client-side")
  System_Ext(openai, "OpenAI API", "Generates the streamed model replies and tool calls.")
  System_Ext(google, "Google APIs", "Provides Gmail and Calendar access after the user's consent.")
  System_Ext(web_services, "Web search and job boards", "Provide web search, page extraction and job listings.")
  Rel(user, system, "Chats with Muse, manages goals, ideas, documents and connectors")
  Rel(system, openai, "Forwards completions with API key", "HTTPS/SSE")
  Rel(system, google, "Reads mail and calendar", "OAuth 2.0/HTTPS")
  Rel(system, web_services, "Searches web and jobs", "HTTPS")
```

## People

- **User** — Person chatting with Muse and managing goals chats with Muse, manages goals, ideas, documents and connectors.

## External systems

- **OpenAI API** (Chat Completions): Generates the streamed model replies and tool calls.
- **Google APIs** (OAuth 2.0, Gmail, Calendar): Provides Gmail and Calendar access after the user's consent.
- **Web search and job boards** (Tavily, Greenhouse/Lever/Ashby): Provide web search, page extraction and job listings.
