---
title: Connectors
type: Feature spec
featureId: connectors
status: Written from code
owner: Product Manager (Maya)
---

# Connectors

_Written by Maya from the code on 2026-11-17. It describes the feature as built._

## Summary

Let a user connect Gmail, Google Calendar and a local Contacts list to Mini Muse, control what Muse may change, and give the chat agent tools to read and act on those services with approval.

The Connectors page (public/js/features/connectors) lists three connectors: Gmail, Google Calendar and Contacts. Gmail and Calendar share one Google OAuth consent. The browser is sent to /api/google/authorize, and the server keeps the tokens in an HttpOnly cookie. At boot and after the redirect, initConnectors reads /api/google/status and turns both Google connectors on or off together. Each connector adds tools to the agent. Reads run directly. Writes go through an approval card unless the user has set that connector to Allow. Gmail send always asks. Contacts are stored in app state, seeded with two example contacts, and the user can add or remove them on the page. The server exposes /api/google/* routes for status, authorize, callback, disconnect, mail and calendar. The folders named in the request, api/web and chrome-extension, are adjacent: web search/open endpoints and a development Chrome browser bridge. I only read their READMEs and entry points, not the extension's code.

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

- **AC1** ✓ (web): Given A connector is not connected, when The user clicks Continue with Google in the consent panel, then The browser navigates to /api/google/authorize.
  - `public/js/features/connectors/index.js:51`: `window.location.assign("/api/google/authorize")`
- **AC2** ✓ (web): Given The Gmail connector is connected, when The user views its permission controls, then The Allow button is disabled with the note that sending email always needs approval.
  - `public/js/features/connectors/index.js:37`: `Sending email always needs your approval.`
- **AC3** ✓ (web): Given The Google status endpoint reports connected, when initConnectors runs at boot or after the redirect, then Both Gmail and Calendar are marked on together.
  - `public/js/features/connectors/index.js:77`: `for (const key of ["mail", "calendar"]) state.connectors[key].on = on;`
- **AC4** ✓ (web): Given Google is connected, when The user clicks Disconnect Google, then Gmail and Calendar are turned off and the disconnect is audited.
  - `public/js/features/connectors/index.js:55`: `Disconnected Gmail and Google Calendar · tools removed`
- **AC5** ✓ (web): Given Gmail is connected and Muse calls mail_send, when The tool runs, then An approval card asks the user to allow the send, and the message is sent only after approval.
  - `public/js/features/connectors/mail.js:13`: `Muse wants to send this Gmail message. Allow it?`
- **AC6** ✓ (web): Given Calendar permission is Ask me first, when Muse calls calendar_add, then An approval card shows the event and time before the event is added.
  - `public/js/features/connectors/calendar.js:13`: `Muse wants to add this to Google Calendar. Allow it?`
- **AC7** ✓ (web): Given Contacts include the two seeded example contacts, when Muse calls contacts_lookup with a name that matches nobody, then The tool returns 'No contact found.'.
  - `public/js/features/connectors/contacts.js:40`: `"No contact found."`
- **AC8** ✓ (API): Given The Google routes are served, when The client requests Gmail search, then POST /api/google/mail/search is handled by the Google module.
  - `server/index.js:88`: `app.post("/api/google/mail/search"`

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

## Not confirmed from the code

- I did not read server/google.js, core/api.js, core/registry.js, or the Chrome extension code, so OAuth, token handling, and bridge behavior are not described.
- I did not run the app or tests, so no behavior has been verified.
- I did not read api/web/search.js or server/web.js. I read api/web/open.js, which only forwards to handleOpen.
- I did not read the Vercel api/google handlers.
