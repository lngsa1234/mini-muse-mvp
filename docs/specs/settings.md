---
title: Settings
type: Feature spec
featureId: settings
status: Written from code
owner: Product Manager (Maya)
---

# Settings

_Written by Maya from the code on 2026-11-21. It describes the feature as built._

## Summary

Lets the user choose how Muse replies (Fast or Thorough), turn web search and the How Muse works panel on or off, and erase everything to start over.

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

- **AC1** ✓ (web): Given the user has never chosen a style, when the app loads, then Fast is selected.
  - `public/js/features/settings/settings.js:45`: `beforeRenderAll() { rt.mode = state.prefs?.mode || "quick"; setLearn(!!state.prefs?.learn); }`
- **AC2** ✓ (web): Given Settings is open, when the user picks Thorough, then the note says replies can take up to a minute.
  - `public/js/features/settings/settings.js:12`: `rt.mode === "quick" ? "Fast: replies in seconds. Good for most things." : "Thorough: a stronger model that plans more ca`
- **AC3** ✓ (web): Given web search is on, when the user clicks the web search switch, then it turns off and is saved.
  - `public/js/features/settings/settings.js:33`: `$("webSearch")?.addEventListener("click", () => { state.prefs.webSearch = state.prefs.webSearch === false; renderSetting`
- **AC4** ✓ (web): Given the How Muse works panel is shown on a phone, when the user turns it off, then the app returns to Chat.
  - `public/js/features/settings/settings.js:23`: `if (!on && $("panes").dataset.mobile === "hood") go("chat");`
- **AC5** ✓ (web): Given Settings is open, when the user clicks Erase everything…, then they are asked to confirm before anything is erased.
  - `public/js/features/settings/settings.js:36`: `Are you sure? <button class="btn" id="resetYes"`
- **AC6** ✓ (web): Given the user confirms erasing, when Muse is mid-turn, then the turn is stopped and all data except preferences is reset.
  - `public/js/features/settings/settings.js:37`: `else if (id === "resetYes") { if (rt.busy) rt.ctl?.abort(); const prefs = state.prefs; replaceState(blank()); state.pref`

## Open questions

- Should Erase everything also delete server-side data (traces, saved goals) or only this browser's data?

## Not confirmed from the code

- Did not check what blank() resets beyond local state.
