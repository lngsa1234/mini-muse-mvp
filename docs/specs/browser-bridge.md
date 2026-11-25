---
title: Browser bridge
type: Feature spec
featureId: browser-bridge
featureStatus: built
status: Written from code
owner: Product Manager (Maya)
---

# Browser bridge

**Feature:** Built · **Spec:** Complete · **QA:** 5 of 5 criteria pass

**5 of 5** acceptance criteria checked against the code · 1 risk

_Written by Maya from the code on 2026-11-22. It describes the feature as built, not as planned._

## Summary

**Lets Muse fill in a job application in the user's own Chrome tab through an optional extension, and submit it only after the user has reviewed it and approved.**

Through the optional Mini Muse Browser Bridge extension, Muse can open an application, read its text and form fields, fill fields from the Library résumé, and click. Every click needs approval, and a submit click asks whether every field was reviewed. Passwords, SSNs and card or account numbers are never filled. The agent runs on the server, so browser tools only work while a Mini Muse tab is open; without the extension they fail with a clear message.

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

| # | Given | When | Then | Where | In code | Tested |
|---|---|---|---|---|---|---|
| AC1 | the extension isn't installed | Muse calls a browser tool | it fails with a message that the bridge did not respond | web | ✓ | ✓ passes |
| AC2 | Muse calls browser_fill | with no fields | the tool refuses | web | ✓ | ✓ passes |
| AC3 | Muse wants to click a Submit or Apply button | it calls browser_click | the user is asked whether they reviewed every field before it submits | web | ✓ | ✓ passes |
| AC4 | an approval card is showing for a click | the user does not approve | nothing is clicked | web | ✓ | ✓ passes |
| AC5 | a form has a password, SSN or card number field | the extension reads the fields | those fields are marked sensitive and not filled | extension | ✓ | ✓ passes |

_The code each criterion rests on is under Evidence, at the end._

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

## How it works

_For engineers: where the behavior above lives in the code._

features/browser/browser.js talks to the Chrome extension with window.postMessage, checking the message origin. chrome-extension/target.js reads and fills fields in the user's tab and skips fields matching its SENSITIVE pattern. Clicks go through the approval flow.

## Evidence

| # | Code | Quote |
|---|---|---|
| AC1 | `public/js/features/browser/browser.js:8` | `Mini Muse Browser Bridge did not respond: the Chrome extension isn't installed or enabled.` |
| AC2 | `server/agent/tools/browser.js:22` | `if (!list.length) throw new Error("No fields to fill.");` |
| AC3 | `server/agent/tools/browser.js:33` | `heading: "This will submit the form in your Chrome tab. Did you review every field?"` |
| AC4 | `server/agent/tools/browser.js:35` | `if (ok !== true) return h.refusal(ok);` |
| AC5 | `chrome-extension/target.js:8` | `const SENSITIVE = /password\|passwd\|ssn\|social.?security\|card.?number\|cvv\|cvc\|routing\|account.?number/i;` |

## Tests

| # | Test | File |
|---|---|---|
| AC1 | browser-bridge AC1: without the extension, a browser tool fails saying the bridge did not respond | `e2e/browser-bridge.spec.mjs` |
| AC2 | browser-bridge AC2: browser_fill refuses when there are no fields | `test/accept-browser-bridge.test.js` |
| AC3 | browser-bridge AC3: clicking Submit asks whether every field was reviewed | `test/accept-browser-bridge.test.js` |
| AC4 | browser-bridge AC4: a click the user doesn't approve clicks nothing | `test/accept-browser-bridge.test.js` |
| AC5 | browser-bridge AC5: password, SSN and card number fields are marked sensitive and not filled | `test/accept-browser-bridge.test.js` |

## Not confirmed from the code

- Did not read the extension's click and fill handlers in full.
