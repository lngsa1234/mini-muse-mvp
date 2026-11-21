---
title: Mini Muse — product baseline
type: Product baseline
owner: Product Manager (Maya)
status: Checked
---

# Mini Muse: product baseline

_What the product is today, written by Maya from the code on 2026-11-21. Each feature's detail is in its spec._

**At a glance:** **3** users · **6** journeys (3 P1, 2 P2, 1 P3) · **13** features · specs: **13** checked against the code, 0 in progress, 0 not written

## Summary

A personal AI agent you chat with that turns goals into plans and works through them with real tools — your Gmail, calendar, contacts, documents, the web and your Chrome browser — asking before it acts on your behalf and only claiming progress it can prove. Built as a classroom replica of the Muse concept for a learning circle.

## Users

- **Job seeker** — Wants an agent to run a job search with them: find openings, judge fit, prepare applications and track replies against a target.
- **Busy professional** — Wants an assistant that can act across mail, calendar, contacts and documents without doing anything risky unasked.
- **Learning-circle builder** — Wants to see and extend how an agent works: the loop, the tools, approvals and traces.

## Journeys

What users set out to do, end to end. Each journey runs through several features; tap a diagram to zoom in.

| Journey | Priority | Features it runs through |
|---|---|---|
| [J1 Land interviews within a deadline](#j1-land-interviews-within-a-deadline) | P1 | [Goals](../specs/goals.md), [Library](../specs/library.md), [Browser bridge](../specs/browser-bridge.md), [Approvals](../specs/tool-approvals.md), [Connectors](../specs/connectors.md) |
| [J2 Find and judge jobs from chat](#j2-find-and-judge-jobs-from-chat) | P1 | [Agent chat](../specs/agent-chat.md), [Goals](../specs/goals.md), [Library](../specs/library.md) |
| [J3 Let Muse work on my goals while I'm away](#j3-let-muse-work-on-my-goals-while-i-m-away) | P1 | [Daily check-in](../specs/daily-check-in.md), [Connectors](../specs/connectors.md), [Goals](../specs/goals.md), [Agent chat](../specs/agent-chat.md) |
| [J4 Get answers from my own documents](#j4-get-answers-from-my-own-documents) | P2 | [Library](../specs/library.md), [Agent chat](../specs/agent-chat.md) |
| [J5 Email someone without leaving the chat](#j5-email-someone-without-leaving-the-chat) | P2 | [Agent chat](../specs/agent-chat.md), [Connectors](../specs/connectors.md), [Approvals](../specs/tool-approvals.md) |
| [J6 Turn an idea into a goal](#j6-turn-an-idea-into-a-goal) | P3 | [Ideas](../specs/ideas.md), [Goals](../specs/goals.md) |

### J1 Land interviews within a deadline

- **Priority:** P1
- **Who:** Job seeker
- **Goal:** Get a set number of interviews in a month without doing every step alone.
- **Starts when:** The user types a goal like "Land 3 interviews in 30 days" on the Goals page.

```mermaid
flowchart LR
  subgraph user_lane["Job seeker"]
    direction LR
    s1["1. States the goal<br/><i>Goals</i>"]
    s7(["7. ✋ Approves"])
  end
  subgraph agent_lane["Mini Muse"]
    direction LR
    s2["2. Plans goal, target, deadline<br/><i>Goals</i>"]
    s3["3. Finds and scores jobs<br/><i>Goals</i>"]
    s4["4. Tailors the résumé<br/><i>Library</i>"]
    s5["5. Fills the application<br/><i>Browser bridge</i>"]
    s8["8. Clicks Submit<br/><i>Browser bridge</i>"]
    s9["9. Confirms in Gmail<br/><i>Connectors</i>"]
  end
  subgraph system_lane["System"]
    direction LR
    s6["6. Shows approval card<br/><i>Approvals</i>"]
  end
  s1 --> s2
  s2 --> s3
  s3 --> s4
  s4 --> s5
  s5 --> s6
  s6 --> s7
  s7 --> s8
  s8 --> s9
  done(["✅ The goal shows applications and interviews against the target, with the days left."])
  s9 --> done
  classDef approval fill:#fff4e0,stroke:#d18a1f,color:#5c3a00
  classDef outcome fill:#e6f6ea,stroke:#2f9e4f,color:#14401f
  style user_lane fill:#fdf2fb,stroke:#d58ad0
  style agent_lane fill:#effaf7,stroke:#6cc9b4
  style system_lane fill:#f5f5f5,stroke:#aaa
  class s7 approval
  class done outcome
```

| # | Who | Step | Feature |
|---|---|---|---|
| 1 | Job seeker | States the goal and target roles | [Goals](../specs/goals.md) |
| 2 | Mini Muse | Creates the goal with a plan, a target count and a deadline (create_goal) | [Goals](../specs/goals.md) |
| 3 | Mini Muse | Finds openings on employers' hiring sites (jobs_search) and scores the best against the résumé (score_fit) | [Goals](../specs/goals.md) |
| 4 | Mini Muse | Saves a tailored résumé or cover letter to the Library (docs_add) | [Library](../specs/library.md) |
| 5 | Mini Muse | Fills the chosen application in the user's Chrome tab (browser_fill) | [Browser bridge](../specs/browser-bridge.md) |
| 6 | System | Shows an approval card for the Submit click | [Approvals](../specs/tool-approvals.md) |
| 7 | Job seeker | ✋ Approves: clicks Submit | [Browser bridge](../specs/browser-bridge.md) |
| 8 | Mini Muse | Clicks Submit | [Browser bridge](../specs/browser-bridge.md) |
| 9 | Mini Muse | Finds the confirmation in Gmail and marks the job applied (track_application) | [Connectors](../specs/connectors.md) |

**Done when:** The goal shows applications and interviews against the target, with the days left.

**When it goes wrong:**

- Gmail isn't connected: Muse can't confirm an application and asks the user to click the job's status or connect Gmail.
- No résumé in the Library: score_fit refuses and Muse asks the user to add one.

### J2 Find and judge jobs from chat

- **Priority:** P1
- **Who:** Job seeker
- **Goal:** Know which openings are worth applying to, without setting up a goal.
- **Starts when:** The user asks in chat, e.g. "find product manager jobs in Detroit".

```mermaid
flowchart LR
  subgraph user_lane["Job seeker"]
    direction LR
    s1["1. Asks for jobs<br/><i>Agent chat</i>"]
  end
  subgraph agent_lane["Mini Muse"]
    direction LR
    s2["2. Searches hiring sites<br/><i>Goals</i>"]
    s3["3. Scores fit with résumé<br/><i>Library</i>"]
    s4["4. Lists the best fits<br/><i>Agent chat</i>"]
  end
  s1 --> s2
  s2 --> s3
  s3 --> s4
  done(["✅ A short list of fits with honest scores, the user can turn it into a goal."])
  s4 --> done
  classDef approval fill:#fff4e0,stroke:#d18a1f,color:#5c3a00
  classDef outcome fill:#e6f6ea,stroke:#2f9e4f,color:#14401f
  style user_lane fill:#fdf2fb,stroke:#d58ad0
  style agent_lane fill:#effaf7,stroke:#6cc9b4
  class done outcome
```

| # | Who | Step | Feature |
|---|---|---|---|
| 1 | Job seeker | Asks Muse for jobs or how well they fit a posting | [Agent chat](../specs/agent-chat.md) |
| 2 | Mini Muse | Searches employers' hiring sites (jobs_search) | [Goals](../specs/goals.md) |
| 3 | Mini Muse | Reads the résumé from the Library and scores fit (score_fit) | [Library](../specs/library.md) |
| 4 | Mini Muse | Lists the strong and possible fits with scores and missing keywords | [Agent chat](../specs/agent-chat.md) |

**Done when:** A short list of fits with honest scores; the user can turn it into a goal.

**When it goes wrong:**

- The user asks for LinkedIn or Indeed: Muse explains it can't search them and uses employers' sites instead.

### J3 Let Muse work on my goals while I'm away

- **Priority:** P1
- **Who:** Job seeker
- **Goal:** Have progress made and reported every day without asking.
- **Starts when:** Every day after 9am with "Every day" on and the app open, or the check-in button.

```mermaid
flowchart LR
  subgraph agent_lane["Mini Muse"]
    direction LR
    s2["2. Checks Gmail for replies<br/><i>Connectors</i>"]
    s3["3. Updates applications<br/><i>Goals</i>"]
    s4["4. Leaves a progress brief<br/><i>Agent chat</i>"]
  end
  subgraph system_lane["System"]
    direction LR
    s1["1. Starts daily check-in<br/><i>Daily check-in</i>"]
  end
  s1 --> s2
  s2 --> s3
  s3 --> s4
  done(["✅ Goals are current and the user has a short brief when they return."])
  s4 --> done
  classDef approval fill:#fff4e0,stroke:#d18a1f,color:#5c3a00
  classDef outcome fill:#e6f6ea,stroke:#2f9e4f,color:#14401f
  style agent_lane fill:#effaf7,stroke:#6cc9b4
  style system_lane fill:#f5f5f5,stroke:#aaa
  class done outcome
```

| # | Who | Step | Feature |
|---|---|---|---|
| 1 | System | Starts the check-in once a day | [Daily check-in](../specs/daily-check-in.md) |
| 2 | Mini Muse | Searches Gmail for application confirmations and employer replies (mail_search) | [Connectors](../specs/connectors.md) |
| 3 | Mini Muse | Updates tracked applications the emails prove, and searches for more if behind pace | [Goals](../specs/goals.md) |
| 4 | Mini Muse | Leaves a three-line progress brief and what needs the user's decision | [Agent chat](../specs/agent-chat.md) |

**Done when:** Goals are current and the user has a short brief when they return.

**When it goes wrong:**

- The app is closed: no check-in runs (there is no server-side scheduler yet).

### J4 Get answers from my own documents

- **Priority:** P2
- **Who:** Busy professional
- **Goal:** Ask questions and get answers grounded in my notes, with the source named.
- **Starts when:** The user uploads a document to the Library.

```mermaid
flowchart LR
  subgraph user_lane["Busy professional"]
    direction LR
    s1["1. Uploads a document<br/><i>Library</i>"]
    s2["2. Asks a question<br/><i>Agent chat</i>"]
  end
  subgraph agent_lane["Mini Muse"]
    direction LR
    s3["3. Searches the Library<br/><i>Library</i>"]
    s4["4. Answers with source<br/><i>Agent chat</i>"]
  end
  s1 --> s2
  s2 --> s3
  s3 --> s4
  done(["✅ An answer that cites which document it came from."])
  s4 --> done
  classDef approval fill:#fff4e0,stroke:#d18a1f,color:#5c3a00
  classDef outcome fill:#e6f6ea,stroke:#2f9e4f,color:#14401f
  style user_lane fill:#fdf2fb,stroke:#d58ad0
  style agent_lane fill:#effaf7,stroke:#6cc9b4
  class done outcome
```

| # | Who | Step | Feature |
|---|---|---|---|
| 1 | Busy professional | Uploads a file; its text is extracted and stored | [Library](../specs/library.md) |
| 2 | Busy professional | Asks Muse a question in chat | [Agent chat](../specs/agent-chat.md) |
| 3 | Mini Muse | Searches and reads the Library (docs_search, docs_read) | [Library](../specs/library.md) |
| 4 | Mini Muse | Answers and names the document it used | [Agent chat](../specs/agent-chat.md) |

**Done when:** An answer that cites which document it came from.

### J5 Email someone without leaving the chat

- **Priority:** P2
- **Who:** Busy professional
- **Goal:** Have Muse write and send an email to a contact, safely.
- **Starts when:** The user asks Muse to email someone.

```mermaid
flowchart LR
  subgraph user_lane["Busy professional"]
    direction LR
    s1["1. Asks to email someone<br/><i>Agent chat</i>"]
    s4(["4. ✋ Approves"])
  end
  subgraph agent_lane["Mini Muse"]
    direction LR
    s2["2. Looks up the contact<br/><i>Connectors</i>"]
    s5["5. Sends the email<br/><i>Connectors</i>"]
  end
  subgraph system_lane["System"]
    direction LR
    s3["3. Shows approval card<br/><i>Approvals</i>"]
  end
  s1 --> s2
  s2 --> s3
  s3 --> s4
  s4 --> s5
  done(["✅ The email is sent only with approval, and appears in the activity audit."])
  s5 --> done
  classDef approval fill:#fff4e0,stroke:#d18a1f,color:#5c3a00
  classDef outcome fill:#e6f6ea,stroke:#2f9e4f,color:#14401f
  style user_lane fill:#fdf2fb,stroke:#d58ad0
  style agent_lane fill:#effaf7,stroke:#6cc9b4
  style system_lane fill:#f5f5f5,stroke:#aaa
  class s4 approval
  class done outcome
```

| # | Who | Step | Feature |
|---|---|---|---|
| 1 | Busy professional | Asks Muse to email a person about something | [Agent chat](../specs/agent-chat.md) |
| 2 | Mini Muse | Looks up the contact (contacts_lookup) | [Connectors](../specs/connectors.md) |
| 3 | System | Shows an approval card with the recipient, subject and body | [Approvals](../specs/tool-approvals.md) |
| 4 | Busy professional | ✋ Approves: sends the email after the user approves (mail_send) | [Connectors](../specs/connectors.md) |
| 5 | Mini Muse | Sends the email after the user approves (mail_send) | [Connectors](../specs/connectors.md) |

**Done when:** The email is sent only with approval, and appears in the activity audit.

**When it goes wrong:**

- The user declines or doesn't answer: nothing is sent and Muse says so.

### J6 Turn an idea into a goal

- **Priority:** P3
- **Who:** Job seeker
- **Goal:** Act on an idea Muse noticed in conversation.
- **Starts when:** Muse saves an idea while chatting.

```mermaid
flowchart LR
  subgraph user_lane["Job seeker"]
    direction LR
    s2["2. Turns it into a goal<br/><i>Ideas</i>"]
  end
  subgraph agent_lane["Mini Muse"]
    direction LR
    s1["1. Saves an idea<br/><i>Ideas</i>"]
    s3["3. Creates the linked goal<br/><i>Goals</i>"]
  end
  s1 --> s2
  s2 --> s3
  done(["✅ The idea shows as a goal, and the goal has a plan."])
  s3 --> done
  classDef approval fill:#fff4e0,stroke:#d18a1f,color:#5c3a00
  classDef outcome fill:#e6f6ea,stroke:#2f9e4f,color:#14401f
  style user_lane fill:#fdf2fb,stroke:#d58ad0
  style agent_lane fill:#effaf7,stroke:#6cc9b4
  class done outcome
```

| # | Who | Step | Feature |
|---|---|---|---|
| 1 | Mini Muse | Saves an idea from the conversation (save_idea) | [Ideas](../specs/ideas.md) |
| 2 | Job seeker | Chooses to turn the idea into a goal | [Ideas](../specs/ideas.md) |
| 3 | Mini Muse | Creates the goal linked to the idea (create_goal with idea_id) | [Goals](../specs/goals.md) |

**Done when:** The idea shows as a goal, and the goal has a plan.

## Features

| Feature | Spec |
|---|---|
| [Agent chat](../specs/agent-chat.md) | ✓ Checked against the code |
| [Approvals](../specs/tool-approvals.md) | ✓ Checked against the code |
| [Goals](../specs/goals.md) | ✓ Checked against the code |
| [Daily check-in](../specs/daily-check-in.md) | ✓ Checked against the code |
| [Ideas](../specs/ideas.md) | ✓ Checked against the code |
| [Library](../specs/library.md) | ✓ Checked against the code |
| [Connectors](../specs/connectors.md) | ✓ Checked against the code |
| [Memory](../specs/memory.md) | ✓ Checked against the code |
| [Web search](../specs/web-search.md) | ✓ Checked against the code |
| [Browser bridge](../specs/browser-bridge.md) | ✓ Checked against the code |
| [Settings](../specs/settings.md) | ✓ Checked against the code |
| [How Muse works](../specs/how-muse-works.md) | ✓ Checked against the code |
| [Observability](../specs/observability.md) | ✓ Checked against the code |

## Gaps and open questions

**Features on no journey:** Memory, Web search, Settings, How Muse works, Observability. Supporting features, or journeys still to write.

- The daily check-in only runs while the app is open; is a server-side scheduler planned?
