---
title: Settings
type: Feature spec
featureId: settings
status: Written from code
owner: Product Manager (Maya)
---

# Settings

**6 of 6** acceptance criteria checked against the code · 1 open question

_Written by Maya from the code on 2026-11-21. It describes the feature as built, not as planned._

## Summary

**Lets the user choose how Muse replies (Fast or Thorough), turn web search and the How Muse works panel on or off, and erase everything to start over.**

Settings holds the response-style switch (Fast maps to the quick model tier, Thorough to the default tier), the web search switch, the How Muse works switch, and Erase everything, which asks for confirmation in the page, stops any running turn and resets all data except preferences. Memory and Activity sections on the same page belong to their own features.

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

| # | Given | When | Then | Where | In code |
|---|---|---|---|---|---|
| AC1 | the user has never chosen a style | the app loads | fast is selected | web | ✓ |
| AC2 | settings is open | the user picks Thorough | the note says replies can take up to a minute | web | ✓ |
| AC3 | web search is on | the user clicks the web search switch | it turns off and is saved | web | ✓ |
| AC4 | the How Muse works panel is shown on a phone | the user turns it off | the app returns to Chat | web | ✓ |
| AC5 | settings is open | the user clicks Erase everything… | they are asked to confirm before anything is erased | web | ✓ |
| AC6 | the user confirms erasing | muse is mid-turn | the turn is stopped and all data except preferences is reset | web | ✓ |

_The code each criterion rests on is under Evidence, at the end._

## Open questions

- Should Erase everything also delete server-side data (traces, saved goals) or only this browser's data?

## How it works

_For engineers: where the behavior above lives in the code._

features/settings/settings.js renders the page and stores choices in state.prefs. The style switch sets rt.mode (quick or default), which server/routing.js maps to a model. Erase everything replaces state with blank() and keeps prefs.

## Evidence

| # | Code | Quote |
|---|---|---|
| AC1 | `public/js/features/settings/settings.js:45` | `beforeRenderAll() { rt.mode = state.prefs?.mode \|\| "quick"; setLearn(!!state.prefs?.learn); }` |
| AC2 | `public/js/features/settings/settings.js:12` | `rt.mode === "quick" ? "Fast: replies in seconds. Good for most things." : "Thorough: a stronger model that plans more ca` |
| AC3 | `public/js/features/settings/settings.js:33` | `$("webSearch")?.addEventListener("click", () => { state.prefs.webSearch = state.prefs.webSearch === false; renderSetting` |
| AC4 | `public/js/features/settings/settings.js:23` | `if (!on && $("panes").dataset.mobile === "hood") go("chat");` |
| AC5 | `public/js/features/settings/settings.js:36` | `Are you sure? <button class="btn" id="resetYes"` |
| AC6 | `public/js/features/settings/settings.js:37` | `else if (id === "resetYes") { if (rt.busy) rt.ctl?.abort(); const prefs = state.prefs; replaceState(blank()); state.pref` |

## Not confirmed from the code

- Did not check what blank() resets beyond local state.
