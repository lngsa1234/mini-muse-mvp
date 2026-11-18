---
title: How documents enter the Library
type: Workflow
owner: Alex (Technical Lead)
---

# How documents enter the Library

Repository: https://github.com/lngsa1234/mini-muse-mvp · Mapped: 2026-11-18 · Mapped by Alex from the code

A user pastes text or uploads a file. The server keeps only the extracted text, and the agent can then search and cite it.

**Starts when:** The user submits the Library form, or Muse calls docs_add.

```mermaid
flowchart TB
  start(["The user submits the Library form, or Muse calls docs_add."])
  s1["1. User<br/>Pastes text with a title or chooses a file such as a PDF, DOCX or TXT."]
  s2["2. Client<br/>Sends the text or the base64 file to the docs API. The docs_add tool does the same for text Muse saves."]
  s3["3. Server<br/>Validates the title and text. Pasted text is capped at 60,000 characters, and uploads over 3MB are rejected with 413."]
  s4["4. Server<br/>For an uploaded file, extracts the text. It rejects the file with 422 if no text comes out. The filename without its extension is the default title."]
  s5["5. Data<br/>Stores the document text for the user in Postgres. The original file is not kept."]
  s6["6. Client<br/>Adds the document to the in-memory list so the page and the docs_search and docs_read tools can use it."]
  start --> s1
  s1 --> s2
  s2 --> s3
  s3 --> s4
  s4 --> s5
  s5 --> s6
  classDef user fill:#F1EFE8,stroke:#5F5E5A,color:#2C2C2A
  classDef agent fill:#EEEDFE,stroke:#534AB7,color:#26215C
  classDef client fill:#E1F5FE,stroke:#0E7490,color:#164E63
  classDef server fill:#E1F5EE,stroke:#0F6E56,color:#04342C
  classDef data fill:#F3E8FF,stroke:#7E22CE,color:#3B0764
  classDef external fill:#FAEEDA,stroke:#854F0B,color:#412402
  class s1 user
  class s2 client
  class s3 server
  class s4 server
  class s5 data
  class s6 client
```

## Steps

| # | Who | What happens | Code |
|---|---|---|---|
| 1 | User | Pastes text with a title or chooses a file such as a PDF, DOCX or TXT. | `public/js/features/library/library.js` |
| 2 | Client | Sends the text or the base64 file to the docs API. The docs_add tool does the same for text Muse saves. | `public/js/features/library/library.js` |
| 3 | Server | Validates the title and text. Pasted text is capped at 60,000 characters, and uploads over 3MB are rejected with 413. | `server/docs.js` |
| 4 | Server | For an uploaded file, extracts the text. It rejects the file with 422 if no text comes out. The filename without its extension is the default title. | `server/docs.js`, `server/extract.js` |
| 5 | Data | Stores the document text for the user in Postgres. The original file is not kept. | `server/db.js` |
| 6 | Client | Adds the document to the in-memory list so the page and the docs_search and docs_read tools can use it. | `public/js/features/library/library.js` |

## Use cases it carries out

- [goals/UC-3](../../use-cases/goals/uc-3-verify-step-progress-with-tool-evidence.md)
