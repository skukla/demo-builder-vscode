# Adobe org-context: canonical self-heal + concurrency safety + agentic signaling

> **PRIORITY: fix-first.** As of 2026-06-16 this blocks the multi-agent / multi-org workflow the
> owner runs in practice (two agents, or a browser tab in org X + a CLI demo in org Y, competing for
> `aio`'s single global context). It must be **definitively fixed and merged to `develop` before**
> the generalized App-Builder-deployable + workspace work
> (`.rptc/research/adobe-io-deployable-workspace/research.md`) continues — that work multiplies Adobe
> CLI operations and would amplify every gap below.

## Provenance

Found 2026-06-15 while testing the shipped store-discovery credential fix on a headless + PaaS
build. The wizard's project-listing step failed with **"Error Loading Projects — Your Adobe CLI is
configured for a different organization than you are signed into. Run `aio console org select` in
your terminal."** (`adobeEntityFetcher.ts:164-168`). The mismatch was real, but the UX dead-ends
at a terminal instruction with no in-app remedy.

Investigating revealed the deeper issue: **org-context correction is implemented ~5 different ways
across the app, bolted on per call-site, with no single chokepoint** — and the projects-fetch path
got *none* of them. That omission is the bug. The right fix is not a sixth bespoke handler; it is
to consolidate to ONE canonical helper and route every Adobe entity fetch (incl. the projects
path) through it.

**Expanded 2026-06-16 (two research agents, cross-verified).** Reproduced live: token reachable org
= *Adobe Demo System* (285361) only, but `console.org` pinned to *Adobe Commerce Solution Led*
(3397333) → every `aio console`/`workspace` call 403s. Triggered by the owner running **two agents
in two orgs** that compete for `aio`'s single global `console.org` + the one identity-scoped token.
This surfaced two facets the original item did not cover — **concurrency / shared global state** and
**agentic (MCP) signaling** — folded in below as Facets B and C.

## Root cause (one sentence)

The builder steers Adobe operations through `aio`'s **process-global** `console.org`/`project`/
`workspace` config plus a **single identity-scoped IMS token**, with no per-project isolation, no
serialization across "select + dependent command," and no typed error when the global is wrong —
so drift, wrong-identity, and concurrent clobbering all converge on the same opaque 403.

## Corrected CLI/auth model (2026-06-16, source-verified — supersedes earlier assumptions)

Two research agents read the actual `aio` plugin/lib source. Full findings + citations:
`.rptc/research/adobe-org-context-cli-isolation/research.md`. The load-bearing corrections:

- **An `aio` session CAN be isolated from clobbering** — set a per-child-process **`AIO_CONFIG_FILE`**
  (or `XDG_CONFIG_HOME`/`HOME`). The global store resolves `AIO_CONFIG_FILE` → `$XDG_CONFIG_HOME/aio`
  → `~/.config/aio` (`aio-lib-core-config/Config.js`). A private file per process makes
  `console select` AND `api-mesh` write there — clobbering ends, covering console + api-mesh + app
  uniformly. This is Adobe's own CI isolation model. **No file locking exists** (`saveFile` is a bare
  `fs.writeFileSync`, last-writer-wins) — so without isolation, concurrent selects genuinely race.
- **Per-command flags don't help** (`select` still writes global; `api-mesh` has no targeting flags);
  **env-override of the selection is leaky** (config deep-merges → stale `org.code`/`name` survive);
  **per-cwd `.aio` isolates only `aio app`**.
- **Auth and org-selection ARE decoupled** — `aio console org select` switches org **on the existing
  token, no browser**. The earlier framing ("re-login is first-class because the target org is absent
  from the list") was **misdiagnosed**: the absence is the client-side filter `filterToSelectableOrgs`
  (entp ∪ developer-with-RUNTIME) in `aio-cli-lib-console`, OR the org belongs to a different IMS
  **account**. Plain login reuses the SSO session (same account → same filtered set); **`--force`
  routes through the IMS logout URL → enables ACCOUNT switching**. So force-login is the
  **account-switch-only** lever, NOT the general org tool.
- **SDK vs CLI org lists diverge by design** — raw `aio-lib-console.getOrganizations()` is unfiltered;
  the CLI applies `filterToSelectableOrgs`. This is why the extension can show an org the CLI then
  can't select. The picker must apply the same filter (or show all + explain the non-selectable ones).

---

## Facet A — Human point-and-click resolution (original scope, strengthened)

### Research verdict (2026-06-15, cross-verified with aio-cli source + Experience League)

- The IMS token from `aio auth login` is **identity-scoped, not org-scoped** (pins to a
  `client_id`, never an org). "Current org" is **separate** persisted CLI config (`console.org`),
  written by `aio console org select`. Sources: `aio-cli-plugin-auth` `auth/login.js`,
  `aio-cli-plugin-console` `org/select.js` + `project/list.js` (`orgId = flags.orgId ||
  getConfig('org.id')` → `getProjects(orgId)` 403s server-side), `aio-cli-plugin-cloudmanager` #359.
- The 403 = the API rejecting a request for a `console.org` that the signed-in identity isn't
  using → **CLI-config drift, not a token problem**. Fix = `aio console org select <correctOrg>`
  with the EXISTING token (no browser).
- **Force logout/login is NOT the primary fix** — it only works incidentally because
  `loginAndRestoreProjectContext` re-runs `selectOrganization` after login
  (`authenticationService.ts:582`). Reserve re-login for the genuine token cases:
  the distinct **401/AUTH_EXPIRED** branch (`adobeEntityFetcher.ts:161-163`), or the edge case
  where org-select succeeds but the next call still 403s (org access revoked / stale token).

**Proper remedy = tiered:** (1) silent `aio console org select <known org>` + retry; (2) escalate
to in-app re-login (`login(force)` → `loginAndRestoreProjectContext`) only if that still 403s;
(3) keep 401/AUTH_EXPIRED → re-login as-is.

**Real-world confirmation (2026-06-15):** the re-login branch is NOT a rare edge case. Live repro —
the target org (*Adobe Commerce Solution Led*, which the user owns) did **not appear** in
`aio console org select` at all, because the CLI's picker is App-Builder-scoped to the *currently
logged-in identity/session*, and that session's selectable list only contained a different org
(*Adobe Demo System*). `org select` with the existing token therefore CANNOT reach the target org;
only re-login (with the correct account) surfaces it. So the canonical helper must treat re-login
as a **first-class branch**, triggered when the target org is absent from the selectable list —
not merely "if org-select still 403s."

**The re-login MUST be a FORCE login** (`login(force=true)` → `aio auth login --force`). A plain
`aio auth logout` + `aio auth login` silently reuses the cached IMS token / browser SSO session and
re-authenticates the SAME (wrong) account without prompting for account selection. Only `--force`
bypasses the cached credential and triggers a fresh flow where the user can pick the correct
account. The extension already exposes this via `authenticationService.login(force)` /
`authenticationHandlers` (the "Starting fresh login" path) — the escalation branch must pass
`force=true`, never a plain login.

**Auth cache makes external auth changes invisible:** `AuthCacheManager` holds `cachedOrganization`
/ `console.where` / org list in memory and only clears on in-app login/logout
(`authenticationService.clearAll()`, `:213/296`) or a window reload. A user who fixes auth in a
terminal (`aio auth login --force` + `aio console org select`) still hits the stale cached org until
they reload the window — confirmed live 2026-06-15 (terminal force-login + org-select did NOT take
effect until "Developer: Reload Window"). The in-app remedy must perform force-login + org-select +
cache clear ITSELF so the user never needs the terminal-then-reload dance. (Also note: force-login
refreshes the token but does NOT set `console.org` — the helper must org-select after.)

**The extension can surface orgs the CLI can't use:** the extension's org list (SDK
`client.getOrganizations`, `adobeEntityFetcher.ts:215`) and the CLI's App-Builder-scoped
`aio console org list` can DIVERGE (different filters / identity). The wizard can show/let the user
pick an org that the CLI then can't select or operate on → dead-end. The consolidation should
reconcile these: only offer orgs that are actually usable (or detect the divergence and prompt
re-login / a different org) rather than letting the picker and the CLI disagree silently.

### Point-and-click gaps confirmed 2026-06-16 (verdict: PARTIAL, dead-ends on wrong-token)

1. **The literal 403 message is a terminal dead-end.** Surfaced via `getProjects` it reaches the
   webview as raw text with only a generic Retry — `adobeEntityFetcher.ts:166` → `projectHandlers.ts:84`
   → `AdobeProjectStep.tsx` ("Error Loading Projects"). No clickable fix.
2. **No org-picker exists anywhere.** "Switch organization" everywhere = force re-login
   (`AdobeAuthStep.tsx:62-85` all call `handleLogin(true)`); there is **no `get-organizations` /
   `select-org` handler** and no `AdobeOrgStep`. Project/workspace have interactive lists; org does not.
   `autoSelectOrganizationIfNeeded` only auto-selects when exactly ONE org is accessible
   (`adobeEntitySelector.ts:395-438`); multi-org → manual.
3. **No out-of-band re-detect affordance.** "Try Again" hits the token-only cached path
   (`authenticationService.ts:159-162`); nothing re-reads `aio console where` short of forced login.
4. **Dashboard shows org frozen at creation time, no switch** (`dashboardStatusService.ts:58`).

**Open product question (separate):** should headless + PaaS *without* mesh require an
App-Builder-entitled org at all? If the App-Builder-scoped org list blocks an otherwise-valid
Commerce demo, the Adobe-setup gating may be over-broad for non-App-Builder demos.

---

## Facet B — Concurrency / shared global state (new, the multi-agent root cause)

`aio`'s org context is a **single global** (`aio config console.org/project/workspace`), set via
`aio console org select` (`adobeEntitySelector.ts:147`), `project select` (`:235`), `workspace
select` (`:344`). The IMS token is identity-scoped and survives `clearConsoleContext`. Two actors
(agent+agent, or agent+UI) interleaving `select X; op` / `select Y; op` race on this global; the
second writer silently wins and the first op runs against the wrong org → 403.

Confirmed gaps:
1. **No serialization spanning select + dependent command.** `ResourceLocker.executeExclusive` /
   `CommandExecutor` `options.exclusive` exist but are **unused in production** (only a test references
   `exclusive:`); none of the `aio console * select` calls or the dependent commands (e.g.
   `aio console workspace download`, `checkHandler.ts:153`) pass `exclusive`.
2. **`ensureContext` check-then-act is itself non-atomic** (`adobeEntitySelector.ts:85-126`):
   `console where` read → conditional `selectOrganization`, with no lock, and not atomic with the
   command that follows.
3. **The documented `StateCoordinator` no longer exists** in the tree — there is no Adobe-CLI-state
   serialization layer at all (the architecture docs still reference it; stale).
4. **MCP ops trust ambient global state**, never re-pinning the project's intended org:
   `create_project` reads `getCurrentOrganization()/getCurrentWorkspace()`
   (`createProjectTool.ts:73,82-83`); `republish`/`sync_content` do no org restore
   (`storefrontTools.ts:72,117`). Contrast the UI path, which DOES re-pin (`deployMesh.ts:74-87`,
   `checkHandler.ts:123-128`).
5. **The shared auth guard doesn't re-pin when already authed.** `ensureAdobeIOAuth` early-returns on
   `isAuthenticated()` (`adobeAuthGuard.ts:51-53`); project-context restore runs only on the
   fresh-login branch (`:68`). An already-authed actor operating after another moved the global gets
   no re-pin.

**OPEN FORK (2026-06-16 verification overturned the clean-isolation assumption).** The IMS token is
stored in the SAME config store `AIO_CONFIG_FILE` redirects (`ims.contexts.<ctx>.access_token`, no
keychain — `aio-lib-ims/token-helper.js` + `ConfigCliContext.js`; issue #67). So a private per-project
`AIO_CONFIG_FILE` **forces a re-login per project** unless the token is seeded. Three candidate
approaches, to settle in planning (details: `.rptc/research/adobe-org-context-cli-isolation/research.md`):

1. **Per-project store + token seeding** — copy the `ims.contexts` subtree into each private store at
   startup. Full isolation; risk = **token-refresh divergence** (each store refreshes independently;
   IMS rotation may invalidate seeded copies). Medium-high risk.
2. **Shared store + per-invocation selection via `AIO_CONSOLE_*` env** — never run the mutating
   `aio console … select`; pass org/project/workspace per call. One login, no clobber; risk = env
   deep-merge leak unless ALL subkeys set; MEDIUM confidence for `console`/`api-mesh`; needs a probe.
3. **Shared store + serialized re-pin lock** — keep `select`, wrap select→dependent-command in an
   exclusive lock, always re-pin first. Simplest; **but** an in-process lock only serializes within ONE
   extension host — two separate processes (two windows / two CLI sessions) need a FILE lock.

**Decider:** are the competing agents in the SAME extension host or SEPARATE processes? Same → a lock
(approach 3) suffices; separate → isolation (1 or 2) is required. Confirm before choosing.

**Confirmed enablers:** `CommandExecutor.execute` already accepts a per-call `env` (no executor change
needed to inject `AIO_CONFIG_FILE`/`AIO_CONSOLE_*`); a single injection point in `applyAdobeCLIDefaults`
can cover all ~30 `aio` call sites if it knows the active project.

**Rejected levers:** per-command `--orgId` flags (don't avoid the global write; `api-mesh` has none);
relying on store locking (none exists — `saveFile` is a bare `fs.writeFileSync`).

## Wizard UI change footprint (verified 2026-06-16, file-level)

Full inventory across 7 areas + an 8-item completeness check lives in
`.rptc/research/adobe-org-context-cli-isolation/research.md` and the agent trace. Headlines:

- **Org is NOT a wizard step today.** Adding `adobe-org` (between `adobe-auth` and `adobe-project`)
  touches: `wizard-steps.json`, the `WizardStep` union (`types/webview.ts`), `stepFiltering.ts`,
  `useWizardState` cascade (`orgDependentSteps`), `wizardHelpers` backward-nav index math, the
  WizardContainer step→component render map; TimelineNav picks up the label automatically.
- **The picker reuses `useSelectionStep`** (`organizationsCache` already in `WizardState`;
  `AdobeProjectStep.tsx` is the template). New: `AdobeOrgStep.tsx`, `orgSearchFilter` state, an
  `onSelect` cascade-clear of project+workspace+mesh.
- **New handlers** `get-organizations` / `select-org` / `re-detect-context` (+ registry entries).
  `select-org` → `selectOrganization` runs `aio console org select` on the existing token (no re-login).
- **The bug:** `get-projects` already receives `{orgId}` from the webview (`WebviewClient:299`) but
  `projectHandlers.ts:52,66` ignores it — thread it (or `selectOrganization(orgId)` first).
- **`AdobeAuthStep.tsx`** — its three force-login buttons (`:66`, `:83`, `:118`) flip to open the
  picker / forward-nav; force-login becomes the labeled **account-switch** fallback only.
- **`filterToSelectableOrgs` gap:** `SelectionStepContent` has no disabled-item affordance — needs one
  to show non-selectable orgs with the "use a different account" explanation (or backend returns only
  selectable + a separate "target filtered" signal).
- **Net-new infra:** `ORG_MISMATCH` error code (`types/errorCodes.ts` — none exists);
  `AuthCacheManager.clearAllCaches()` (compose existing clears); the `AIO_CONFIG_FILE`/`AIO_CONSOLE_*`
  injection point in `applyAdobeCLIDefaults`.
- **Easy-to-miss:** single-org auto-select must not double-prompt; cascade-clear lives in 3 places;
  loading/empty/**filtered-org** copy; ConfigurationSummary org row; replace the literal terminal
  dead-end string (`adobeEntityFetcher.ts:164-168`); backward-nav Adobe index math.
- **Dashboard org-switch = large blast radius** (re-pin context + invalidates the deployed mesh
  endpoint) → **out of initial scope**; wizard-first.

---

## Facet C — Agentic / MCP signaling (new, the token-waste root cause)

The MCP surface handles *missing-auth* and *nothing-selected* well (structured `needsAuth`,
`validOptions`, the `select_org → select_project → select_workspace` ladder). It is **blind to
"pointed at the wrong org."**

Confirmed gaps:
1. **Org-mismatch / 403 / mid-op AUTH_EXPIRED returns as a RAW STRING.** Tool catch-alls serialize
   `err.message` (`createProjectTool.ts:149,244`; `cloudResourceTools.ts:155`; `storefrontTools.ts`
   passthrough). No `{ error_type: 'ORG_MISMATCH', action_required, non_retryable }`. → an agent
   retries the identical call (re-403, global unchanged) or flails → **burns tokens**.
2. **No "non-retryable" marker.** The only MCP retry classifier is socket-connect errors
   (`mcpProxyRetry.ts:29-44`); the `adobe-cli` command retry strategy sits below the tool boundary and
   may silently retry a 403.
3. **Zero agent guidance that org context is global/shared.** AGENTS.md (`aiContextWriter.ts:320-337`)
   shows org/project/workspace as display text only; `skillsWriter.ts` and `toolDescriptors.ts` say
   nothing about re-establishing context per op or about concurrency. The agent cannot know to
   re-pin or to stop-and-ask.

**Remedy:** the canonical helper returns a typed result; MCP tools map org-mismatch to
`{ error_type:'ORG_MISMATCH', action_required:'select org / re-login', non_retryable:true,
target_org }`; AGENTS.md + the relevant skills gain a short "Adobe CLI org context is global and
shared — call `ensure_org_context` before Adobe ops; do not retry ORG_MISMATCH, surface it" note.

---

## The existing variants to consolidate

| Variant | Location | Behavior |
|---|---|---|
| `ensureContext` self-heal | `adobeEntitySelector.ts:85-126` | org-mismatch → re-select org (for selectProject/selectWorkspace); non-atomic |
| Direct `selectOrganization(project.adobe.organization)` | `edsResetMeshHelper.ts:122-123`, `projectResetService.ts:258-259` | reset flows set org context manually |
| `loginAndRestoreProjectContext` | `authenticationService.ts:564-617` via `adobeAuthGuard.ts` | login + re-select org/project/workspace (re-pin only on fresh login) |
| `validateAndClearInvalidOrgContext` | `organizationValidator.ts:134-146` | clear org context on persistent 403 |
| **(none)** — projects fetch | `adobeEntityFetcher.ts:285-289` `aio console project list` (no org arg) | dead-ends at terminal message ← the bug |
| **(none)** — MCP ops | `createProjectTool.ts:73,82-83`, `storefrontTools.ts:72,117` | trust ambient global; no re-pin, raw-string errors |

## Goal / scope (three workstreams, sequenced)

1. **Canonical helper** — `ensureOrgContext(orgId)` performing **self-heal (org-select + retry) →
   escalate (FORCE re-login, incl. when target org absent from the selectable list) → surface
   "choose a different org"**, returning a TYPED result (ok | org_mismatch | needs_relogin |
   access_revoked). All entity fetches and context-dependent commands (UI + MCP) route through it.
   Migrate and delete the bespoke variants (no soft deprecation). Projects-fetch is the first
   consumer (fixes the reported dead-end); thread the known target org
   (`project.adobe.organization` / wizard-selected id; `getProjects` currently ignores
   `_payload.orgId`, `projectHandlers.ts:52`).
2. **Concurrency safety (Facet B)** — per-project `AIO_CONFIG_FILE` isolation on every `aio` spawn
   (private store per project; seed once), plus a small exclusive lock for same-project select→command.
3. **Human + agentic resolution surfaces (Facets A + C)** — a real in-app org-picker that runs
   `aio console org select` on the EXISTING token (no re-login) for same-identity switching, with
   force-login surfaced ONLY as the account-switch fallback, and the `filterToSelectableOrgs`
   divergence reconciled (show selectable orgs; explain filtered/other-account ones); out-of-band
   re-detect; typed MCP `ORG_MISMATCH` (non-retryable) results + AGENTS.md/skills guidance.

## Constraints / risk

- Touches the auth flows broadly — regression risk across org/project/workspace selection, mesh
  deploy gating, reset, the wizard, and every MCP tool. Migrate call-site by call-site with tests;
  this is why it's a dedicated, fix-first effort, not folded into a bug fix.
- Preserve the 401-vs-403 taxonomy (re-login vs org-select) exactly.
- Keep the access-revocation case ("identity lost org access") surfacing "pick a different org".
- Locking must not deadlock the existing `withProgress`/`ExecutionLock` mesh paths — audit before adding.

## Kickoff prompt

`/rptc:feat "Definitively fix Adobe org-context handling (fix-first, merge to develop before the
App-Builder-deployable work). Build ONE canonical ensureOrgContext(orgId) returning a typed result
(ok | org_mismatch | needs_relogin | access_revoked): self-heal via aio console org select + retry →
escalate to FORCE re-login (incl. when the target org is absent from the selectable list) → 'choose
a different org'. Route all entity fetches + the projects-fetch path + every MCP tool through it;
migrate and delete the ~5 bespoke variants. Add concurrency safety via per-project AIO_CONFIG_FILE
isolation on every aio spawn (private store per project + seed) plus a small same-project lock. Add
an in-app org-picker that runs aio console org select on the existing token (no re-login; force-login
only for account switch) and reconciles the filterToSelectableOrgs SDK-vs-CLI divergence; add
out-of-band re-detect; map MCP org-mismatch to a typed non-retryable ORG_MISMATCH result and add
AGENTS.md/skills guidance that aio org context is global/shared. See
.rptc/research/adobe-org-context-cli-isolation/research.md and
.rptc/backlog/2026-06-15-adobe-org-context-self-heal-consolidation.md."`
