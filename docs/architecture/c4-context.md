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
  Person(user, "User", "Person using Muse as a personal agent")
  System(system, "Mini Muse", "Mini Muse is a no-build browser app with a small Node/Express (or Vercel function) backend")
  System_Ext(openai, "OpenAI API", "Model that answers agent turns and one-shot JSON completions, selected by tier.")
  System_Ext(google_apis, "Google Gmail and Calendar", "User's real Gmail inbox and primary calendar, reached with a token kept in an encrypted Ht")
  System_Ext(tavily, "Tavily web search", "Web search and page extraction used by web_search and web_open.")
  Rel(user, system, "Chats with Muse, manages ideas, goals and documents, approves actions")
  Rel(system, openai, "Proxies completions with key", "HTTPS/SSE")
  Rel(system, google_apis, "Searches mail, manages events", "OAuth 2.0/HTTPS")
  Rel(system, tavily, "Searches and extracts pages", "HTTPS")
```

## People

- **User** — Person using Muse as a personal agent chats with Muse, manages ideas, goals and documents, approves actions.

## External systems

- **OpenAI API** (Chat Completions): Model that answers agent turns and one-shot JSON completions, selected by tier.
- **Google Gmail and Calendar** (Google OAuth 2.0): User's real Gmail inbox and primary calendar, reached with a token kept in an encrypted HttpOnly cookie.
- **Tavily web search** (Tavily API): Web search and page extraction used by web_search and web_open.
