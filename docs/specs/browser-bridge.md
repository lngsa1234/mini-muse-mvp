---
title: Browser bridge
type: Feature spec
featureId: browser-bridge
status: Written from code
owner: Product Manager (Maya)
---

# Browser bridge

_Written by Maya from the code on 2026-11-21. It describes the feature as built._

## Summary

Lets Muse fill in a job application in the user's own Chrome tab through an optional extension, and submit it only after the user has reviewed it and approved.

The page talks to the Mini Muse Browser Bridge extension by window messages. Muse can open an application URL, read the tab's text and form fields, fill fields from the Library résumé, and click; every click needs approval, and a submit click gets a card that asks whether every field was reviewed. The extension never fills passwords, SSNs, card or account numbers. Without the extension, requests time out with a message pointing to web_open.

## User stories

- As a job seeker, I want Muse to fill in an application for me so that I only review and submit.
- As a user, I want nothing submitted without my approval.

## Scope

**In scope**

- browser_open, browser_snapshot, browser_fields, browser_fill, browser_click
- The approval card on clicks
- Sensitive-field skipping in the extension

**Out of scope**

- Finding jobs (Goals and Web search)

## Requirements

| ID | Requirement |
|---|---|
| FS-R01 | The system asks the user before any click in their tab. |
| FS-R02 | The system warns that a submit click submits the form. |
| FS-R03 | The system never fills sensitive fields. |

## Acceptance criteria

- **AC1** ✓ (web): Given the extension isn't installed, when Muse calls a browser tool, then it fails with a message that the bridge did not respond.
  - `public/js/features/browser/browser.js:8`: `Mini Muse Browser Bridge did not respond: the Chrome extension isn't installed or enabled.`
- **AC2** ✓ (web): Given Muse calls browser_fill, when with no fields, then the tool refuses.
  - `public/js/features/browser/browser.js:27`: `if (!list.length) throw new Error("No fields to fill.");`
- **AC3** ✓ (web): Given Muse wants to click a Submit or Apply button, when it calls browser_click, then the user is asked whether they reviewed every field before it submits.
  - `public/js/features/browser/browser.js:37`: `heading: "This will submit the form in your Chrome tab. Did you review every field?"`
- **AC4** ✓ (web): Given an approval card is showing for a click, when the user does not approve, then nothing is clicked.
  - `public/js/features/browser/browser.js:39`: `if (ok !== true) return h.refusal(ok);`
- **AC5** ✓ (extension): Given a form has a password, SSN or card number field, when the extension reads the fields, then those fields are marked sensitive and not filled.
  - `chrome-extension/target.js:8`: `const SENSITIVE = /password|passwd|ssn|social.?security|card.?number|cvv|cvc|routing|account.?number/i;`

## Scenarios

### SC1 Fill and submit an application

1. **Agent**: Opens the chosen application and reads its fields
2. **Agent**: Fills the fields the résumé supports
3. **User**: Reviews the filled form in Chrome
4. **Agent** _(after the user approves)_: Clicks Submit once the user approves

### SC2 No extension (failure)

1. **Agent**: Calls a browser tool
2. **System**: Times out and tells Muse to use web_open or ask the user to install the extension

## Risks

- Only the last non–Mini Muse Chrome tab is controlled; the wrong tab can be targeted if the user switches.

## Not confirmed from the code

- Did not read the extension's click and fill handlers in full.
