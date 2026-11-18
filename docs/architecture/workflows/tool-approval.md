---
title: How sensitive actions get approved
type: Workflow
owner: Alex (Technical Lead)
---

# How sensitive actions get approved

Repository: https://github.com/lngsa1234/mini-muse-mvp · Mapped: 2026-11-18 · Mapped by Alex from the code

A tool that changes something outside the app pauses the turn and shows an approval card in chat. It continues only after the user answers.

**Starts when:** The model calls a write tool, such as mail_send or revise_plan, or a tool that asks to count an interview or offer.

```mermaid
flowchart TB
  start(["The model calls a write tool, such as mail_send or revise_plan, or a tool that asks to count an interview or offer."])
  s1["1. Agent<br/>Calls a tool that needs approval."]
  s2["2. Client<br/>The tool wrapper hands it an ask helper and records a trace span. For connector tools it checks whether the connector needs approval. Gmail always does."]
  s3["3. Client<br/>The tool shows an approval card. It lists what will change, such as the recipient, subject and body of an email or the before and after of a plan."]
  s4["4. Client<br/>Pauses the turn in a waiting state and shows a pending card in chat."]
  s5["5. User<br/>Clicks Allow or Don't allow."]
  s6["6. Client<br/>Resolves the pause as approved, declined or no answer (if the turn is cancelled or ends) and records the choice in the activity audit."]
  s7["7. Client<br/>If approved, the tool performs the action, for example calling the backend mail send route or updating the goal's steps. Otherwise it returns a message saying nothing was changed."]
  start --> s1
  s1 --> s2
  s2 --> s3
  s3 --> s4
  s4 --> s5
  s5 --> s6
  s6 --> s7
  classDef user fill:#F1EFE8,stroke:#5F5E5A,color:#2C2C2A
  classDef agent fill:#EEEDFE,stroke:#534AB7,color:#26215C
  classDef client fill:#E1F5FE,stroke:#0E7490,color:#164E63
  classDef server fill:#E1F5EE,stroke:#0F6E56,color:#04342C
  classDef data fill:#F3E8FF,stroke:#7E22CE,color:#3B0764
  classDef external fill:#FAEEDA,stroke:#854F0B,color:#412402
  class s1 agent
  class s2 client
  class s3 client
  class s4 client
  class s5 user
  class s6 client
  class s7 client
```

## Steps

| # | Who | What happens | Code |
|---|---|---|---|
| 1 | Agent | Calls a tool that needs approval. | `public/js/agent/loop.js` |
| 2 | Client | The tool wrapper hands it an ask helper and records a trace span. For connector tools it checks whether the connector needs approval. Gmail always does. | `public/js/agent/tools.js` |
| 3 | Client | The tool shows an approval card. It lists what will change, such as the recipient, subject and body of an email or the before and after of a plan. | `public/js/features/connectors/mail.js`, `public/js/features/goals/goals.js` |
| 4 | Client | Pauses the turn in a waiting state and shows a pending card in chat. | `public/js/workflow/approvals.js` |
| 5 | User | Clicks Allow or Don't allow. |  |
| 6 | Client | Resolves the pause as approved, declined or no answer (if the turn is cancelled or ends) and records the choice in the activity audit. | `public/js/workflow/approvals.js` |
| 7 | Client | If approved, the tool performs the action, for example calling the backend mail send route or updating the goal's steps. Otherwise it returns a message saying nothing was changed. | `public/js/features/connectors/mail.js`, `public/js/features/goals/goals.js` |

## Use cases it carries out

- [goals/UC-6](../../use-cases/goals/uc-6-revise-a-plan-with-approval.md)
