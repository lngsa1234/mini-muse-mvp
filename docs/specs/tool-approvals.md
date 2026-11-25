---
title: Approvals
type: Feature spec
featureId: tool-approvals
featureStatus: built
status: Written from code
owner: Product Manager (Maya)
---

# Approvals

**Feature:** Built · **Spec:** Complete · **QA:** 7 of 7 criteria pass

**7 of 7** acceptance criteria checked against the code

_Written by Maya from the code on 2026-11-22. It describes the feature as built, not as planned._

## Summary

**Makes Muse stop and ask before a sensitive action: a tool pauses, an approval card appears in chat, and the action goes ahead only if the user approves.**

Before Muse changes or sends anything, the chat shows a card saying what it wants to do, and Muse waits. The user approves or declines; a card with no answer after 4 minutes resolves as no answer and nothing happens. If the turn runs out of time first, the card stays open, and an answer within the 4 minutes lets Muse carry on in a follow-up turn. Every outcome is shown on the card and written to the activity log, and cards can be answered from any device.

## User stories

- As a user, I want Muse to ask before sending, submitting or changing things so that nothing happens on my behalf without my say-so.

## Scope

**In scope**

- The approval card and its three outcomes
- The audit record of each decision

**Out of scope**

- Which tools ask (each tool decides)

## Requirements

| ID | Requirement |
|---|---|
| FS-R01 | The system pauses a tool until the user approves, declines, or the card's 4 minutes run out. |
| FS-R02 | The system keeps a card open past the end of its turn and resumes the work when the card is answered in time. |
| FS-R03 | The system records every approval outcome, approved, declined or unanswered, in the activity audit. |

## Acceptance criteria

| # | Given | When | Then | Where | In code | Tested |
|---|---|---|---|---|---|---|
| AC1 | a tool asks for approval | the card appears | the chat shows that Muse is waiting for the user's approval | web | ✓ | ✓ passes |
| AC2 | an approval card is showing | the user clicks Approve | the tool continues with a yes | web | ✓ | ✓ passes |
| AC3 | an approval card is showing | the user clicks Decline | the tool continues with a no | web | ✓ | ✓ passes |
| AC4 | an approval card gets no answer | its 4 minutes run out | the card resolves as no answer and nothing is done | web | ✓ | ✓ passes |
| AC5 | the user approved, declined or never answered a card | the tool resumes | the outcome is written to the activity audit as by the user | web | ✓ | ✓ passes |
| AC6 | a card is still open when the turn reaches its time limit | the user answers within 4 minutes of the card appearing | Muse runs the answered action in a follow-up turn and carries on | web | ✓ | ✓ passes |
| AC7 | a paused card's 4 minutes have passed | the user answers it | the answer is refused and nothing runs | web | ✓ | ✓ passes |

_The code each criterion rests on is under Evidence, at the end._

## Scenarios

### SC1 Approve a sensitive action

1. **Agent**: Calls a write tool such as mail_send
2. **System**: Shows the approval card and waits
3. **User**: Clicks Approve
4. **Agent** _(after the user approves)_: Carries out the action

### SC2 No answer before the turn ends (failure)

1. **System**: Ends the turn with the card still waiting
2. **System**: Marks it as no answer; the tool does nothing

## How it works

_For engineers: where the behavior above lives in the code._

A tool that changes something calls h.ask in server/agent/runtime.js, which adds a pending card to the assistant message, saves a wait in agent_waits and waits for the answer from any device (/api/agent/answer, server/agent/http.js). A refusal goes back to the model as the tool result. When the turn nears the function time limit, the card is parked; answering it returns resume, and the browser (public/js/workflow/approvals.js) posts a follow-up turn that re-runs the tool with the saved answer.

## Evidence

| # | Code | Quote |
|---|---|---|
| AC1 | `server/agent/runtime.js:253` | `msg.status = "Waiting for your approval…"` |
| AC2 | `public/js/workflow/approvals.js:28` | `onClick("approve", id => answer(id, true));` |
| AC3 | `public/js/workflow/approvals.js:29` | `onClick("decline", id => answer(id, false));` |
| AC4 | `server/agent/runtime.js:268` | `a.approval = ok === true ? "approved" : ok === null ? "expired" : "declined";` |
| AC5 | `server/agent/runtime.js:270` | `await audit("approval", { [tool]: card.summary }, a.approval, "you");` |
| AC6 | `server/agent/runtime.js:261` | `// The turn is out of time but the card isn't: pause with the card open.` |
|  | `server/agent/http.js:89` | `return { status: 200, json: { ok, resume: waitId } };` |
| AC7 | `server/agent/http.js:82` | `if (park?.status === "pending" && Date.now() > Number(park.request?.until \|\| 0)) {` |

## Tests

| # | Test | File |
|---|---|---|
| AC1 | approvals AC1: while a card waits, the chat says Muse is waiting for approval | `test/accept-approvals.test.js` |
| AC2 | an approval waits for the user's answer, which can come from any device | `test/agent-runtime.test.js` |
| AC3 | approvals AC3: declining a card continues the tool with a no | `test/accept-approvals.test.js` |
| AC4 | an unanswered approval expires and nothing is sent | `test/agent-runtime.test.js` |
| AC5 | approvals AC5: approved, declined and unanswered cards are all written to the audit | `test/accept-approvals.test.js` |
| AC6 | approvals AC6: a card still open when the turn runs out of time can be answered, and Muse carries on | `test/accept-approvals.test.js` |
| AC7 | approvals AC7: answering a paused card after its time has run out does nothing | `test/accept-approvals.test.js` |
