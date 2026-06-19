# Research: Protecting an `aio` session from clobbering + correcting the auth/org model

**Date:** 2026-06-16
**Type:** Web/platform (aio CLI + IMS source-verified)
**Status:** Complete
**Feeds:** `.rptc/backlog/2026-06-15-adobe-org-context-self-heal-consolidation.md`

Prompted by the owner's two-agent/two-org scenario (two `aio` contexts competing) and a request to
re-verify the prior belief that auth and org-selection cannot be decoupled. Two research agents read
the actual `aio` plugin/lib source.

---

## Q1 — Can an `aio` session be protected from clobbering? VERDICT: YES (via `AIO_CONFIG_FILE`)

`aio`'s global store path resolves as `AIO_CONFIG_FILE` → `$XDG_CONFIG_HOME/aio` → `~/.config/aio`
(`aio-lib-core-config/src/Config.js`). `aio console org/project/workspace select` writes the
**process-global** store via `set(key, value, local=false)` (`console/index.js` → `index.js`). No
file locking exists — `saveFile` is a bare `fs.writeFileSync` (read-modify-deep-merge-write),
last-writer-wins. So concurrent selects into the same store race.

| Mechanism | Isolates console/api-mesh? | Isolates `aio app`? | Mutates shared global? | Notes |
|---|---|---|---|---|
| **`AIO_CONFIG_FILE=/unique/path` per child process** | **YES (clean)** | YES | No (private file) | **Recommended.** Each process gets its own global store; covers console + api-mesh + app uniformly. Mirrors CI container isolation. Must seed the store once per worker. |
| `XDG_CONFIG_HOME` / `HOME` per process | YES (clean) | YES | No | Same effect, broader. |
| Env override `AIO_CONSOLE_ORG_ID/_CODE/_NAME` (+ project/workspace) | PARTIAL (leaky) | n/a | No (read-only) | Config is a **deep-merge** → stale `code`/`name` from the last global `select` survive and mis-target unless every subkey is set. Risky; avoid. |
| Per-cwd local `.aio` | NO (selection is global) | YES | No | `aio app` reads `project.*` from local `.aio`; console/api-mesh ignore it for selection. |
| `--orgId`/`--projectId`/`--workspaceId` flags | NO | n/a | **Yes** (`select` still writes global) | Scopes the API call only; `api-mesh` has no targeting flags (re-confirms prior finding). |
| Store locking | NO | NO | — | None exists; concurrent writes race. |

**Practical recommendation:** give every spawned `aio` child process its own `AIO_CONFIG_FILE`
(per project or per agent-worker) in its env. Then `console select` and `api-mesh` operate on a
private store → cross-process clobbering ends with full fidelity (correct id+code+name objects, no
stale-merge leakage), without changing the interactive login. Seed each store once (run the three
`console … select`, or copy the baseline). Quick check: `AIO_CONFIG_FILE=/tmp/x/config aio console where`.

CI prior art: Adobe's own pipelines isolate via fresh container `HOME` (private global file) +
non-interactive auth (S2S env vars), never a shared global.

---

## Q2 — Auth vs org-selection. VERDICT: prior belief OUTDATED / misdiagnosed

| Prior belief | Reality (source-verified) |
|---|---|
| Token is org-bound | **Wrong** — the `aio` token is identity-scoped; org is per-call (path param / `x-gw-ims-org-id` header) + persisted `console.org` config. |
| Auth & org-selection can't be decoupled | **Wrong** — decoupled at the CLI/SDK layer: `aio console org select` switches org on the existing token, no browser. |
| No decoupled org picker | **Wrong within an identity** — `org select` / `getOrganizations()` is exactly that. Only the browser authorize step lacks an org chooser. |
| "Same org, or forced login" | **Misdiagnosed** — plain login reuses the IMS SSO **session/account** → same org set; `--force` routes through the IMS **logout URL** first (`aio-lib-ims-oauth/helpers.js`), enabling **account** switch. The lever is account, not org. |
| Owned org needed re-login to appear | **Wrong cause** — `aio-cli-lib-console`'s `filterToSelectableOrgs` keeps only **enterprise** orgs ∪ **developer** orgs with the **RUNTIME** feature; others are silently dropped. The org was filtered (or on another account), not gated by login. |
| — | **SDK vs CLI org list diverge by design:** raw `aio-lib-console.getOrganizations()` is unfiltered; the CLI applies `filterToSelectableOrgs`. This is why the extension can show an org the CLI then refuses to select. |

**Corrected model:** (1) `aio auth login` → identity token; plain login reuses SSO (same account),
`--force` allows account switch via IMS logout-redirect. (2) Org is selected **after** login via
`aio console org select` on the existing token — no browser. (3) Selectable set = entp ∪
developer-with-RUNTIME, computed live (not fixed at login). (4) For deterministic org-pinned
automation, OAuth S2S (per-workspace, org-scoped by construction) is the canonical non-interactive
path, at the cost of per-workspace credential setup.

---

## Implications for the org-context fix

1. **Concurrency (Facet B) solvable cleanly** via per-project/per-worker `AIO_CONFIG_FILE` — robust
   isolation with one env var on child spawn (+ seed), not a global-locking refactor. Same-project
   concurrent ops still want a small lock; cross-project/cross-agent clobbering ends.
2. **Human org-picker (Facet A) needs no re-login** for same-identity switching — `org select` is the
   decoupled picker. Force-login is the **account-switch-only** fallback. Must handle the
   `filterToSelectableOrgs` divergence (show selectable orgs; explain filtered/other-account ones).
3. **S2S** stays the deterministic alternative for later automation (App-Builder-deployable work).

---

## Q3 (follow-up, 2026-06-16) — Does `AIO_CONFIG_FILE` also isolate the IMS token? VERDICT: YES (forces re-login) — EMPIRICALLY CONFIRMED

Probe run 2026-06-16: default store has `ims.contexts.cli.access_token`; `AIO_CONFIG_FILE=/tmp/empty
aio config get ims.contexts` returns nothing and `aio console where` reports "no org/project/workspace
selected" — a fresh private store is logged-out + unselected. Token travels with `AIO_CONFIG_FILE`.

**Process-model note:** the real clobbering scenario spans the extension host + the user's terminal +
a browser tab = SEPARATE processes sharing `~/.config/aio`. An in-process lock (approach 3) cannot
police the terminal/other windows → approach 3 is out for the general case. **Lean approach 2**
(shared store + per-invocation `AIO_CONSOLE_*` env; one token, no divergence, no mutation); remaining
check = confirm a full-subkey env override targets an org cleanly without mutating the store, against a
healthy (non-mismatched) org.

Source-read `@adobe/aio-lib-ims`: the token is persisted via `ConfigCliContext.setContextValue` →
`aioConfig.set('ims.contexts.<ctx>.access_token'/'.refresh_token', value, local=false)` — i.e. the
**same `aio-lib-core-config` store** that `AIO_CONFIG_FILE` redirects. **No keytar/keychain** in the
current lib (older CLI used keytar — confirm locally if supporting old installs). Independent confirm:
aio-lib-ims issue #67.

Consequence: a fresh private `AIO_CONFIG_FILE` has no `ims.contexts` → logged out → browser login.
So **per-project `AIO_CONFIG_FILE` isolation forces re-login per project** unless the token is seeded.

Three candidate isolation strategies (decide in planning):
1. **Per-project store + token seeding** — copy the `ims.contexts` subtree into each private store at
   startup. Full isolation, but **token refresh diverges** (`_persistTokens` writes the refreshed token
   into the running process's own store → expiry drift + N refresh chains from one seed; IMS
   refresh-token rotation may invalidate copies). Risk: medium-high.
2. **Shared store + per-invocation selection via `AIO_CONSOLE_*` env** — never run the store-mutating
   `aio console … select`; pass org/project/workspace per call. One shared login, no clobber, but
   env-override deep-merges → must set ALL subkeys (`_ID`+`_CODE`+`_NAME`) the consumers read; MEDIUM
   confidence it is clean for `console`/`api-mesh`. Needs a local probe.
3. **Shared store + serialized re-pin lock** — keep `select`, wrap select→command in an exclusive lock,
   always re-pin first. Simplest, one login — but an in-process lock only serializes within ONE
   extension host; **two separate processes** (two windows / two CLI sessions) need a FILE lock or
   isolation. Decide based on whether the competing agents share a process.

Local probe to settle approach 2/the token verdict: after a normal login,
`AIO_CONFIG_FILE=/tmp/x aio console where` (or `aio config get ims.contexts`) → if logged-out, the
verdict holds.

## Wizard UI change footprint (verified 2026-06-16, file-level)

Full inventory in the backlog item. Headlines: org is NOT a wizard step today (adding `adobe-org`
touches wizard-steps.json + `WizardStep` union + stepFiltering + useWizardState cascade + wizardHelpers
backward-nav index math + WizardContainer render map). The picker reuses `useSelectionStep`
(`organizationsCache` already in state; `AdobeProjectStep` is the template). New handlers
`get-organizations`/`select-org`/`re-detect-context`; `select-org` → `selectOrganization` runs
`aio console org select` on the existing token (no re-login — confirmed). `get-projects` already
receives `{orgId}` from the webview but ignores it (`projectHandlers.ts:52,66`) — the named bug.
`CommandExecutor.execute` already accepts a per-call `env` (no executor change for `AIO_CONFIG_FILE`).
Net-new: `ORG_MISMATCH` error code, `AuthCacheManager.clearAllCaches()`, a disabled-item affordance in
`SelectionStepContent` for filtered (non-selectable) orgs. Dashboard org-switch = large blast radius →
out of initial scope.

## Sources (selected, source-verified)

aio-lib-core-config `Config.js`/`util.js`/`index.js`; aio-cli-plugin-console `console/index.js`,
`org/select.js`, `project/select.js`; aio-cli-lib-console `lib/index.js`
(`getOrganizations`/`filterToSelectableOrgs`/`hasOrgFeature`); aio-lib-console `src/index.js`;
aio-cli-plugin-auth `auth/login.js`; aio-lib-ims-oauth `login.js`/`helpers.js`; aio-cli-plugin-app
`deploy.js`; adobe/aio-apps-action + aio-cli-setup-action; developer.adobe.com (App Builder CI/CD,
Configuration, OAuth S2S); API Mesh CI/CD; Experience League KB ka-29604 / ka-30011.
