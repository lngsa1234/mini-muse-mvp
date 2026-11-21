---
title: Approvals
type: Feature spec
featureId: tool-approvals
status: Written from code
owner: Product Manager (Maya)
---

# Approvals

_Written by Maya from the code on 2026-11-21. It describes the feature as built._

## Summary

Makes Muse stop and ask before a sensitive action: a tool pauses, an approval card appears in chat, and the action goes ahead only if the user approves.

requestApproval puts the chat in a waiting state, shows a card with a heading, rows, an optional body and a yes label, and waits for the user's click. Approve resolves true, Decline false, and a turn that ends first resolves null (no answer). The outcome is labelled on the card and written to the activity audit.

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
| FS-R01 | The system pauses a tool until the user approves, declines or the turn ends. |
| FS-R02 | The system records each approval outcome in the activity audit. |

## Acceptance criteria

- **AC1** ✓ (web): Given a tool asks for approval, when the card appears, then the chat shows that Muse is waiting for the user's approval.
  - `public/js/workflow/approvals.js:15`: `msg.status = "Waiting for your approval…"`
- **AC2** ✓ (web): Given an approval card is showing, when the user clicks Approve, then the tool continues with a yes.
  - `public/js/workflow/approvals.js:29`: `onClick("approve", id => approvals.get(id)?.(true));`
- **AC3** ✓ (web): Given an approval card is showing, when the user clicks Decline, then the tool continues with a no.
  - `public/js/workflow/approvals.js:30`: `onClick("decline", id => approvals.get(id)?.(false));`
- **AC4** ✓ (web): Given an approval card is still waiting, when the turn ends, then the card resolves as no answer.
  - `public/js/workflow/approvals.js:27`: `export function expireApprovals() { for (const [, res] of approvals) res(null); }`
- **AC5** ✓ (web): Given the user answered a card, when the tool resumes, then the outcome is written to the activity audit.
  - `public/js/workflow/approvals.js:21`: `audit("approval", { [tool]: card.summary }, a.approval, "you");`

## Scenarios

### SC1 Approve a sensitive action

1. **Agent**: Calls a write tool such as mail_send
2. **System**: Shows the approval card and waits
3. **User**: Clicks Approve
4. **Agent** _(after the user approves)_: Carries out the action

### SC2 No answer before the turn ends (failure)

1. **System**: Ends the turn with the card still waiting
2. **System**: Marks it as no answer; the tool does nothing
