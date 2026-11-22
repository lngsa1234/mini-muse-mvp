---
title: Daily check-in
type: Feature spec
featureId: daily-check-in
status: Written from code
owner: Product Manager (Maya)
---

# Daily check-in

**6 of 6** acceptance criteria checked against the code · 1 risk · 1 open question

_Written by Maya from the code on 2026-11-22. It describes the feature as built, not as planned._

## Summary

**Lets Muse work on the user's goals while they're away: once a day, or from a button, it reviews goals, ideas and connected services, does what it can without the user, and leaves a short progress brief in chat.**

The check-in is an agent turn with a fixed instruction: check Gmail for application confirmations and replies, update tracked applications, work out pace against a job-search target, search for more postings when behind, never send email or submit applications, and end with a three-line brief. With "Every day" on, the open app starts it once a day from 9am when Muse is free; once started, it runs on the server and finishes even if the tab is closed.

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

| # | Given | When | Then | Where | In code |
|---|---|---|---|---|---|
| AC1 | the Goals page is open | the user clicks the check-in button | muse runs a check-in turn | web | ✓ |
| AC2 | "Every day" is on and a check-in already ran today | the five-minute timer fires | no second check-in runs that day | web | ✓ |
| AC3 | "Every day" is on and it is before 9am | the timer fires | the check-in waits until 9am | web | ✓ |
| AC4 | "Every day" is on but Muse is busy or there are no goals | the timer fires | no check-in runs | web | ✓ |
| AC5 | a check-in runs | muse gets its instruction | it is told the user is away and not to send emails | web | ✓ |
| AC6 | a check-in finishes | muse writes its reply | it leaves a three-line progress brief and what needs the user's decision | web | ✓ |

_The code each criterion rests on is under Evidence, at the end._

## Scenarios

### SC1 Daily progress while away

1. **System**: Starts the check-in after 9am, once that day
2. **Agent**: Checks Gmail for confirmations and replies, and updates tracked applications
3. **Agent**: Leaves a three-line brief and what needs the user's decision

### SC2 App closed (failure)

1. **System**: Has no timer running because the app is closed
2. **System**: Runs the check-in the next time the app is open after 9am

## Risks

- The check-in only starts while the app is open in a browser tab; there is no server-side schedule.

## Open questions

- Is a server-side scheduler planned so check-ins run with the app closed?

## How it works

_For engineers: where the behavior above lives in the code._

workflow/checkin.js holds the check-in prompt. maybeDailyCheckin() runs every five minutes and 20 seconds after load, and runCheckin() records lastCheckin and sends the prompt through the normal agent run.

## Evidence

| # | Code | Quote |
|---|---|---|
| AC1 | `public/js/workflow/checkin.js:41` | `$("checkinBtn").addEventListener("click", runCheckin);` |
| AC2 | `public/js/workflow/checkin.js:29` | `if (!p.dailyCheckin \|\| p.lastCheckin === today() \|\| now.getHours() < START_HOUR) return false;` |
| AC3 | `public/js/workflow/checkin.js:18` | `const START_HOUR = 9;` |
| AC4 | `public/js/workflow/checkin.js:30` | `if (!rt.sample \|\| rt.busy \|\| !state.plans.length) return false;` |
| AC5 | `public/js/workflow/checkin-prompt.js:3` | `the user is away. Review my goals, ideas, and any connected services` |
| AC6 | `public/js/workflow/checkin-prompt.js:5` | `Then write a progress brief of 3 short lines, list what needs my decision` |
