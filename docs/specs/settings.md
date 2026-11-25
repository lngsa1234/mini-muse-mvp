---
title: Settings
type: Feature spec
featureId: settings
featureStatus: built
status: Written from code
owner: Product Manager (Maya)
---

# Settings

**Feature:** Built · **Spec:** Complete · **QA:** 6 of 6 criteria pass

**6 of 6** acceptance criteria checked against the code

_Written by Maya from the code on 2026-11-22. It describes the feature as built, not as planned._

## Summary

**Lets the user choose how Muse replies (Fast or Thorough), turn web search and the How Muse works panel on or off, and erase everything to start over.**

Settings holds the response-style switch (Fast maps to the quick model tier, Thorough to the default tier), the web search switch, the How Muse works switch, and Erase everything, which asks for confirmation in the page, stops any running turn and resets all data except preferences, here and on the server, for every device. Memory and Activity sections on the same page belong to their own features.

## User stories

- As a user, I want to trade speed for care in Muse's replies.
- As a user, I want to wipe my data and start over without losing my settings.

## Scope

**In scope**

- Fast / Thorough
- Web search switch
- How Muse works switch
- Erase everything

**Out of scope**

- Memory list (Memory)
- Activity list (How Muse works)

## Requirements

| ID | Requirement |
|---|---|
| FS-R01 | The system defaults to Fast. |
| FS-R02 | The system asks for confirmation before erasing. |
| FS-R03 | The system keeps preferences when erasing everything else. |

## Acceptance criteria

| # | Given | When | Then | Where | In code | Tested |
|---|---|---|---|---|---|---|
| AC1 | the user has never chosen a style | the app loads | Fast is selected | web | ✓ | ✓ passes |
| AC2 | Settings is open | the user picks Thorough | the note says replies can take up to a minute | web | ✓ | ✓ passes |
| AC3 | web search is on | the user clicks the web search switch | it turns off and is saved | web | ✓ | ✓ passes |
| AC4 | the How Muse works panel is shown on a phone | the user turns it off | the app returns to Chat | web | ✓ | ✓ passes |
| AC5 | Settings is open | the user clicks Erase everything… | they are asked to confirm before anything is erased | web | ✓ | ✓ passes |
| AC6 | the user confirms erasing | Muse is mid-turn | the turn is stopped and the chat, memory and settings are erased on every device, keeping preferences | web | ✓ | ✓ passes |

_The code each criterion rests on is under Evidence, at the end._

## How it works

_For engineers: where the behavior above lives in the code._

features/settings/settings.js renders the page and stores choices in state.prefs. The style switch sets rt.mode (quick or default), which server/routing.js maps to a model. Erase everything replaces state with blank() and keeps prefs.

## Evidence

| # | Code | Quote |
|---|---|---|
| AC1 | `public/js/features/settings/settings.js:51` | `beforeRenderAll() { rt.mode = state.prefs?.mode \|\| "quick"; setLearn(!!state.prefs?.learn); }` |
| AC2 | `public/js/features/settings/settings.js:12` | `rt.mode === "quick" ? "Fast: replies in seconds. Good for most things." : "Thorough: a stronger model that plans more ca` |
| AC3 | `public/js/features/settings/settings.js:33` | `$("webSearch")?.addEventListener("click", () => { state.prefs.webSearch = state.prefs.webSearch === false; renderSetting` |
| AC4 | `public/js/features/settings/settings.js:23` | `if (!on && $("panes").dataset.mobile === "hood") go("chat");` |
| AC5 | `public/js/features/settings/settings.js:36` | `Are you sure? <button class="btn" id="resetYes"` |
| AC6 | `public/js/features/settings/settings.js:42` | `resetAll({ prefs }); // the chat, memory and settings on the server, for every device` |

## Tests

| # | Test | File |
|---|---|---|
| AC1 | settings AC1: with no style chosen, Fast is selected | `e2e/settings.spec.mjs` |
| AC2 | settings AC2: choosing Thorough says replies can take up to a minute | `e2e/settings.spec.mjs` |
| AC3 | settings AC3: the web search switch turns web search off and saves it | `e2e/settings.spec.mjs` |
| AC4 | settings AC4: on a phone, turning How Muse works off returns to Chat | `e2e/settings.spec.mjs` |
| AC5 | settings AC5: Erase everything asks for confirmation before erasing | `e2e/settings.spec.mjs` |
| AC6 | settings AC6: confirming the erase stops a running turn and erases chat, memory and settings, keeping preferences | `e2e/settings.spec.mjs` |

## Not confirmed from the code

- Did not check what blank() resets beyond local state.
