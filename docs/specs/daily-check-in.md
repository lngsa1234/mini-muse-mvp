---
title: Daily check-in
type: Feature spec
featureId: daily-check-in
status: Written from code
owner: Product Manager (Maya)
---

# Daily check-in

_Written by Maya from the code on 2026-11-21. It describes the feature as built._

## Summary

Lets Muse work on the user's goals while they're away: once a day, or from a button, it reviews goals, ideas and connected services, does what it can without the user, and leaves a short progress brief in chat.

The check-in is an agent turn with a fixed instruction: check Gmail for application confirmations and replies, update tracked applications, work out pace against a job-search target, search for more postings when behind, never send email or submit applications, and end with a three-line brief. With "Every day" on, it runs once a day from 9am while the app is open and Muse is free, checked every five minutes and shortly after the app opens.

## User stories

- As a job seeker, I want Muse to make progress on my goals each day without me asking, so that I don't fall behind.
- As a user, I want a short brief of what changed and what needs my decision when I come back.

## Scope

**In scope**

- The check-in button and the "Every day" setting
- When the daily check-in runs
- What the check-in instruction asks Muse to do and not do

**Out of scope**

- A server-side scheduler (the app must be open)
- The goal and connector tools the check-in uses (their own specs)

## Requirements

| ID | Requirement |
|---|---|
| FS-R01 | The system runs a check-in when the user clicks the check-in button. |
| FS-R02 | The system runs the daily check-in at most once a day, after 9am, only when it is switched on, Muse is free, and there is at least one goal. |
| FS-R03 | The system tells Muse not to send emails or submit applications during a check-in. |

## Acceptance criteria

- **AC1** ✓ (web): Given the Goals page is open, when the user clicks the check-in button, then Muse runs a check-in turn.
  - `public/js/workflow/checkin.js:41`: `$("checkinBtn").addEventListener("click", runCheckin);`
- **AC2** ✓ (web): Given "Every day" is on and a check-in already ran today, when the five-minute timer fires, then no second check-in runs that day.
  - `public/js/workflow/checkin.js:29`: `if (!p.dailyCheckin || p.lastCheckin === today() || now.getHours() < START_HOUR) return false;`
- **AC3** ✓ (web): Given "Every day" is on and it is before 9am, when the timer fires, then the check-in waits until 9am.
  - `public/js/workflow/checkin.js:18`: `const START_HOUR = 9;`
- **AC4** ✓ (web): Given "Every day" is on but Muse is busy or there are no goals, when the timer fires, then no check-in runs.
  - `public/js/workflow/checkin.js:30`: `if (!rt.sample || rt.busy || !state.plans.length) return false;`
- **AC5** ✓ (web): Given a check-in runs, when Muse gets its instruction, then it is told the user is away and not to send emails.
  - `public/js/workflow/checkin.js:14`: `the user is away. Review my goals, ideas, and any connected services`
- **AC6** ✓ (web): Given a check-in finishes, when Muse writes its reply, then it leaves a three-line progress brief and what needs the user's decision.
  - `public/js/workflow/checkin.js:16`: `Then write a progress brief of 3 short lines, list what needs my decision`

## Scenarios

### SC1 Daily progress while away

1. **System**: Starts the check-in after 9am, once that day
2. **Agent**: Checks Gmail for confirmations and replies, and updates tracked applications
3. **Agent**: Leaves a three-line brief and what needs the user's decision

### SC2 App closed (failure)

1. **System**: Has no timer running because the app is closed
2. **System**: Runs the check-in the next time the app is open after 9am

## Risks

- The check-in only runs while the app is open in a browser tab.

## Open questions

- Is a server-side scheduler planned so check-ins run with the app closed?
