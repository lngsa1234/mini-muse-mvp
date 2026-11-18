# UC-5: Track job applications with proof

- From: Goals use cases
- Author: Maya
- Date: 2026-11-17

- **User goal:** “Keep track of each job I'm pursuing, from found to outcome.”
- **Actors:** user, Muse, Gmail connector, browser bridge.
- **Trigger:** Muse finds a posting, or the user says they applied.
- **Preconditions:** a job-search goal exists. Gmail must be connected for email-based proof.

## Main flow

| Step | Who | Action | Tool | Evidence |
|---|---|---|---|---|
| 1 | agent | Finds postings, scores them, and saves each as `saved` | `jobs_search`, `score_fit`, `track_application` | tracker row |
| 2 | agent | Saves a tailored résumé or cover letter, then marks `drafted` | `docs_add`, `track_application` | refused unless `docs_add` ran this turn (`goals.js:158`) |
| 3 | user | Reviews and submits the application | — | — |
| 4 | agent | Marks `applied` only after an approved Submit click, or after a confirmation email is found in Gmail this turn (`goals.js:160-164`) | `browser_click`, `mail_search`, `mail_read` | audit "via approved submit" or "via mail_search: confirmation email" |
| 5 | agent | Marks `interview`, `offer`, or `rejected` after an employer email is found (`goals.js:165-168`) | `mail_search`, `mail_read` | email proof |
| 6 | user | Confirms interview and offer counts on an approval card (`goals.js:170`) | approval | user's yes |

## Alternative and failure flows

- No Gmail or no confirmation: Muse tells the user to click the job's status on the Goals page, and says that connecting Gmail lets it confirm.
- A status move backwards is refused. Only the user can do it by clicking (`goals.js:154-155`).
- A user click cycles saved, drafted, applied, interview, offer, rejected, then back to saved (`model.js:80`).

## Guardrails

Muse never counts an interview it only expects. It never submits an application without user approval.

## Success criteria

- **Given** a tracked job and a Gmail confirmation email found this turn, **when** Muse marks it applied, **then** the status changes, the audit entry names the proof, and the target progress updates.

## Gaps

- A rejected status counts toward an applications target but not an interviews target.
- The user's click has no proof requirement or confirmation.
- Jobs are matched by company and role text only, so a retitled role creates a duplicate.
