# Architecture review: mini-muse-mvp

_Pinned to commit `ce76211` on `main`. The repo changes quickly, so re-check findings against the current head. Related earlier analysis: `docs/analyses/architecture-review-of-the-mini-muse-mvp-repository.md`._

This review is read-only and changes no behavior. Every finding below cites a file that was read for this review. Section 6 lists what was not read.

## 1. Current-state summary

- **Frontend:** no-build ES modules in `public/js`. Features register pages, tools and prompt guidance. `core/registry.js` collects them, and `agent/tools.js` assembles them into tools.
- **Agent loop:** `agent/loop.js` runs in the browser. It streams a turn through `agent/transport.js`, executes requested tools client-side, feeds the results back, and repeats up to `MAX_STEPS = 12`.
- **API layer:** each route exists twice. Express serves it locally from `server/index.js`, and Vercel serves it from `api/*.js` (docs, goals, ideas, jobs/search, llm, trace, web, google, healthz). `vercel.json` rewrites `/api/google/:action*`. The `api/llm.js` Edge function shares `server/proxy.js` and `server/routing.js` with Express.
- **Persistence:** Neon Postgres through `server/db.js` (documents, ideas, goals) and the trace, span and log tables in `db/schema.sql`. Chat, memory, prefs, connector settings and the audit log live in the browser (`core/storage.js`). Google tokens are in an encrypted HttpOnly cookie (`server/google.js`).
- **Browser bridge:** the Chrome MV3 extension (`chrome-extension/`: `muse-bridge.js` content script, `background.js` service worker, `target.js` injected into the target tab).

## 2. Documentation drift

| # | Claim | Reality | Status |
|---|-------|---------|--------|
| D1 | README: "Everything else (chat, ideas, goals, memory, prefs) still uses `localStorage`." | `core/storage.js` `migrate()` sets `out.ideas = []; out.plans = []` with the comment "ideas & goals live on the server too", and `flush()` deletes `docs`, `ideas` and `plans` before saving locally. `server/db.js` has `listIdeas`, `listGoals` and so on, and `db/schema.sql` has `ideas` and `goals` tables. | Verified. Only chat, memory, prefs, connectors and the audit log remain client-side. |
| D2 | `docs/ARCHITECTURE.md` is the architecture reference. | The file does not exist. The README links `docs/architecture/README.md`. Code search finds stale references in `public/js/core/registry.js`, `public/index.html` and the earlier analysis document. | Verified. The earlier draft of this review wrongly said the README cited the missing file. |
| D3 | README's `/api` description mentions the LLM proxy and `/api/docs`. | `api/` also has goals, ideas, jobs, trace, web, google and healthz. `db/schema.sql` also holds the observability tables `traces`, `spans` and `logs`. | Verified from the file listing and the schema. |
| D4 | README: `npm test` runs "server unit tests". | `npm test` is `node --test`, which runs every test file. The README's evals section says it also covers the agent-behavior regression checks. | Verified in `package.json`. The scope of the suite was not checked. |

## 3. Findings, ranked by severity

### F1 (High): no authentication; every caller is the same user
- **Evidence:** `server/auth.js`. `currentUserId(_req)` ignores the request and returns `DEV_USER_ID`. `db/schema.sql` documents this as deliberate until real auth exists. `api/llm.js` has no auth, rate-limit or size check before forwarding upstream. `server/proxy.js` was not read, so limits there are unconfirmed.
- **Impact:** on a public deployment, anyone can read, write or delete docs, goals and ideas, and can call `/api/llm` on the owner's OpenAI key.
- **Note:** this is a recorded demo-stage decision. It becomes High once the app is public. It is not fixed here.

### F2 (Medium-High): the extension bridge can click anything and approval is a prompt rule only
- **Evidence:** `chrome-extension/target.js` `click(selector)` calls `document.querySelector(selector).click()` with no restriction, so it can click a Submit button. `background.js` `dispatch` forwards any `snapshot`, `fields`, `fill` or `click` request to the last-active normal tab. The only enforcement of "never submit without approval" that I read is the text rule in `public/js/agent/policy.js`.
- **Mitigations present (verified):**
  - `muse-bridge.js` accepts only same-window messages from the same origin that carry `source: "mini-muse"`.
  - `background.js` accepts only senders in `MUSE_ORIGINS` (the production URL and `localhost:3000`).
  - Browser control needs an optional per-site host permission, checked with `chrome.permissions.contains`.
  - `open` accepts only http(s) URLs.
  - `target.js` never fills fields that look sensitive (password, ssn, card, cvv, routing and so on), and flags them in `fields()`.
- **Gaps:**
  - Any script running in a Muse origin can drive the extension. That includes an XSS bug or injected content, and chat renders model links.
  - Sensitive-field detection is a name regex. `fill` takes arbitrary selectors.
  - `lastTargetTabId` is a most-recently-active heuristic, so the extension can act on a different site from the one the user means. The permission check only limits it to sites the user allowed.
  - The origin allow-list is hardcoded in both `background.js` and `manifest.json`, so a fork or renamed deployment silently stops working.
- **To confirm:** whether `features/goals/goals.js` (which matched a search for `browser_click`) wraps click in `h.ask` approval. I did not read it.

### F3 (Medium): prompt-injection boundary is narrow and the loop does not enforce approvals
- **Evidence:**
  - `agent/policy.js` rule 1 says text in "emails and documents" is data, not instructions. Web pages are not named, although `target.js` `snapshot()` returns up to 12000 characters of arbitrary page text, plus links, to the model.
  - `agent/loop.js` pushes tool output as plain `role: "tool"` content with no delimiter or untrusted-content marker.
  - Approval is opt-in per tool. `agent/tools.js` offers `h.ask` and `h.needsAsk`, and `workflow/approvals.js` resolves the card, but `runLoop` itself never checks approval before it calls `tool.execute`. A tool that forgets `h.ask` runs unattended.
- **Positive (verified):** declined and expired approvals return the text "Nothing was changed." `expireApprovals()` clears pending cards at the end of a turn, and an abort resolves them to null.
- **To confirm:** `agent/prompt.js` was not read, so I do not know whether it adds further framing.

### F4 (Medium): the step cap fails silently
- **Evidence:** `agent/loop.js`. After `MAX_STEPS` (12) tool-call rounds the `for` loop ends and returns `{ text: finalText, truncated }`. `finalText` is the text of the last tool-calling turn, which is often empty. `truncated` is set only for `max_tokens`. The caller cannot tell that the cap was hit, so the user may see an empty or half-finished reply.
- **Also:** tools run sequentially, and unknown-tool or thrown errors are returned to the model as `Error: ...` text. That is reasonable. There is no per-turn cost or token budget on the client, and the server has none (see F1).

### F5 (Medium): persistence correctness
- **Runtime DDL on the read path:** `server/db.js` `ensureGoalColumns()` runs `alter table goals add column if not exists ...` once per process before goal reads and writes. It duplicates the same statements at the end of the goals section of `db/schema.sql`, so there are two sources of truth. It needs ALTER privilege at runtime, and on serverless every cold start repeats it.
- **Non-atomic updates:** `updateIdea` and `updateGoal` do select, merge in JS, then update. Concurrent writes from two tabs or from the agent and the user can lose changes (last write wins).
- **Unvalidated patches:** `updateGoal` calls `patch.steps.map(...)` when `"steps" in patch`. A non-array value throws inside the handler. Whether the route validates first was not checked.
- **Client state:** `core/storage.js` `flush()` swallows save errors. It falls back to localStorage if the host document write fails, and ignores a failure of that too. It keeps the last 40 chat messages and 150 audit entries. `migrate()` merges shallowly with `Object.assign`. Chat, memory, prefs and connector settings are lost when the browser or profile changes.
- **Positive:** every SQL statement I read uses tagged-template parameters, with no string concatenation. `db.query` spans record statement text, never bound values.

### F6 (Medium): duplicated routing across Express and Vercel
- **Evidence:** `server/index.js` versus `api/*.js`, plus `vercel.json` rewrites. Commits 460ec69 and f654b5f are Vercel-specific Google routing fixes. A route added on one side can be missed on the other.
- **Suggested follow-up:** a parity test that every Express route has a Vercel counterpart. The `{ status, json }` handler contract and where `withTrace` is applied were not verified here.

### F7 (Low): documentation hygiene
- See D1 to D3. Fix the stale `docs/ARCHITECTURE.md` references and the README persistence claims.

## 4. Recommended follow-up work items for the Technical Lead

1. **Authentication and abuse controls:** replace `currentUserId`, add rate and size limits on `/api/llm`, and decide the public-deployment posture.
2. **Browser-bridge hardening:** require approval for `click` and `fill` in the extension or loop, not only in the prompt. Allow origins to be configured, and verify the goals.js approval path.
3. **Agent-loop safety:** treat web and tool output as untrusted in `policy.js`, signal when `MAX_STEPS` is hit, and add a per-turn budget.
4. **Persistence:** move the goal columns entirely into `db/schema.sql` and a migration step, make updates atomic or versioned, and validate patches.
5. **Route parity test** between `server/index.js` and `api/`.
6. **Docs fix:** README persistence claims and stale `docs/ARCHITECTURE.md` references.

## 5. Out of scope

None of the above is fixed in this change. Each recommendation needs its own work item and plan.

## 6. Limitations: not read for this review

`server/index.js` (read only in part earlier, so the body-size limit is unconfirmed), `server/proxy.js`, `server/google.js` internals, `agent/prompt.js`, `agent/transport.js`, `agent/run.js`, `workflow/checkin.js`, `features/goals/goals.js`, `scripts/db-init.mjs`, and the `api/*.js` handlers other than `api/llm.js`. Claims about those files, such as the 6mb upload limit and the handler contract, are unverified.
