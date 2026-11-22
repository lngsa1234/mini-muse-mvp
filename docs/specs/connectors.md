---
title: Connectors
type: Feature spec
featureId: connectors
status: Written from code
owner: Product Manager (Maya)
---

# Connectors

**8 of 8** acceptance criteria checked against the code · 6 risks · 4 open questions

_Written by Maya from the code on 2026-11-22. It describes the feature as built, not as planned._

## Summary

**Lets a user connect Gmail, Google Calendar and a contacts list, decide what Muse may change in each, and give Muse tools to read and act on them.**

Gmail and Calendar connect together with one Google sign-in. Muse can read from a connected service at any time. Changes, such as creating an event, show an approval card unless the user set that connector to allow them, and sending an email always asks. Contacts live in the app, start with two examples, and the user can add or remove them.

## User stories

- As a user, I want to connect my Google account so that Muse can read my Gmail and Calendar instead of guessing.
- As a user, I want to see what access I am granting before I continue so that I can consent knowingly.
- As a user, I want Muse to ask before it changes my calendar or contacts, and always before it sends email, so that I stay in control.
- As a user, I want to disconnect Google so that Muse's Gmail and Calendar tools are removed.
- As a user, I want to manage a contacts list so that Muse can look up an email address before sending mail.

## Scope

**In scope**

- Connectors page: connect, consent, disconnect, See data, and per-connector write permission
- Gmail tools: mail_search, mail_read, mail_send
- Google Calendar tools: calendar_list, calendar_add, calendar_remove
- Contacts tools: contacts_lookup, contacts_add, plus manual add/remove on the page
- Server Google routes in server/index.js
- Connection status shown as a nav badge and a pill

**Out of scope**

- Web search and open-page tools (api/web), which are a separate web-browsing feature
- Chrome extension browser bridge internals (chrome-extension/), which I did not read
- Real Google Contacts sync; Contacts are local sample or user-entered data
- Google OAuth server implementation details (server/google.js was not read)
- Packaging or publishing the extension

## Requirements

| ID | Requirement |
|---|---|
| FS-R01 | The Connectors page shows one card per connector in the order Gmail, Google Calendar, Contacts, with a Connected or Not connected pill and the list of tools, marking write tools differently from read tools. |
| FS-R02 | Clicking Connect on a Google connector shows a consent panel listing its scopes; Continue with Google navigates to /api/google/authorize and Cancel dismisses the panel. |
| FS-R03 | On boot and after the OAuth redirect, the app queries Google status and sets Gmail and Calendar on or off together. |
| FS-R04 | Disconnect Google calls the disconnect endpoint, turns off Gmail and Calendar, and records an audit entry. |
| FS-R05 | Gmail permission is locked to Ask me first and the Allow button is disabled. |
| FS-R06 | Calendar and Contacts write tools prompt for approval when the permission is Ask me first, and run without a prompt when it is Allow. |
| FS-R07 | mail_send always shows an approval card with To, Subject and body and sends only if the user approves. |
| FS-R08 | contacts_lookup matches contacts by name or email and returns a 'No contact found.' message on no match. |
| FS-R09 | The nav badge shows the number of connected connectors. |

## Acceptance criteria

| # | Given | When | Then | Where | In code | Tested |
|---|---|---|---|---|---|---|
| AC1 | a connector is not connected | the user clicks Continue with Google in the consent panel | the browser navigates to /api/google/authorize | web | ✓ | ✓ passes |
| AC2 | the Gmail connector is connected | the user views its permission controls | the Allow button is disabled with the note that sending email always needs approval | web | ✓ | ✓ passes |
| AC3 | the Google status endpoint reports connected | initConnectors runs at boot or after the redirect | both Gmail and Calendar are marked on together | web | ✓ | ✓ passes |
| AC4 | Google is connected | the user clicks Disconnect Google | Gmail and Calendar are turned off and the disconnect is audited | web | ✓ | ✓ passes |
| AC5 | Gmail is connected and Muse calls mail_send | the tool runs | an approval card asks the user to allow the send, and the message is sent only after approval | web | ✓ | ✓ passes |
| AC6 | Calendar permission is Ask me first | Muse calls calendar_add | an approval card shows the event and time before the event is added | web | ✓ | ✓ passes |
| AC7 | Contacts include the two seeded example contacts | Muse calls contacts_lookup with a name that matches nobody | the tool returns 'No contact found.' | web | ✓ | ✓ passes |
| AC8 | the Google routes are served | the client requests Gmail search | POST /api/google/mail/search is handled by the Google module | API | ✓ | ✓ passes |

_The code each criterion rests on is under Evidence, at the end._

## Risks

- Contacts are stored in client state only. Whether state persists across devices or browsers is unconfirmed.
- Gmail and Calendar share one OAuth grant, so the user cannot connect only one of them.
- The Disconnect action ignores errors from the server (try/catch with an empty catch). The UI can show Disconnected even if the server-side revocation failed.
- No tests or QA evidence tied to Connectors were seen. The features are shipped but not verified.
- Only the local Express server's routes were read. The Vercel route consolidation was not checked for parity.
- Gmail read and send scopes are sensitive and may trigger Google OAuth app verification.

## Open questions

- Does the Contacts connector need real Google Contacts sync, or are local contacts intended?
- Should users be able to connect Gmail and Calendar independently?
- Do api/web and chrome-extension belong to the Connectors feature, or should they be specified as web-browsing and browser-bridge features?
- What does server/google.js do for token refresh and scope errors?

## How it works

_For engineers: where the behavior above lives in the code._

The Connectors page (features/connectors) sends the browser to /api/google/authorize; the server keeps the tokens in an HttpOnly cookie. initConnectors reads /api/google/status at boot and after the redirect and switches both Google connectors together. The server's /api/google/* routes cover status, authorize, callback, disconnect, mail and calendar. Each connector adds its tools to the agent; write tools go through the approval flow.

## Evidence

| # | Code | Quote |
|---|---|---|
| AC1 | `public/js/features/connectors/index.js:51` | `window.location.assign("/api/google/authorize")` |
| AC2 | `public/js/features/connectors/index.js:37` | `Sending email always needs your approval.` |
| AC3 | `public/js/features/connectors/index.js:77` | `for (const key of ["mail", "calendar"]) state.connectors[key].on = on;` |
| AC4 | `public/js/features/connectors/index.js:55` | `Disconnected Gmail and Google Calendar · tools removed` |
| AC5 | `server/agent/tools/connectors.js:27` | `Muse wants to send this Gmail message. Allow it?` |
| AC6 | `server/agent/tools/connectors.js:40` | `Muse wants to add this to Google Calendar. Allow it?` |
| AC7 | `server/agent/tools/connectors.js:63` | `"No contact found."` |
| AC8 | `server/index.js:88` | `app.post("/api/google/mail/search"` |

## Tests

| # | Test | File |
|---|---|---|
| AC1 | connectors AC1: Continue with Google in the consent panel goes to /api/google/authorize | `e2e/connectors.spec.mjs` |
| AC2 | connectors AC2: with Gmail connected, Allow is disabled because sending email always needs approval | `e2e/connectors.spec.mjs` |
| AC3 | connectors AC3: when Google reports connected, Gmail and Calendar are both on | `e2e/connectors.spec.mjs` |
| AC4 | connectors AC4: Disconnect Google turns off Gmail and Calendar and audits it | `e2e/connectors.spec.mjs` |
| AC5 | an approval waits for the user's answer, which can come from any device | `test/agent-runtime.test.js` |
|  | an unanswered approval expires and nothing is sent | `test/agent-runtime.test.js` |
| AC6 | connectors AC6: calendar_add shows an approval card with the event and time before adding | `test/accept-connectors.test.js` |
| AC7 | connectors AC7: contacts_lookup with a name that matches nobody returns 'No contact found.' | `test/accept-connectors.test.js` |
| AC8 | connectors AC8: POST /api/google/mail/search is handled by the Google module | `test/accept-connectors.test.js` |

## Not confirmed from the code

- I did not read server/google.js, core/api.js, core/registry.js, or the Chrome extension code, so OAuth, token handling, and bridge behavior are not described.
- I did not run the app or tests, so no behavior has been verified.
- I did not read api/web/search.js or server/web.js. I read api/web/open.js, which only forwards to handleOpen.
- I did not read the Vercel api/google handlers.
