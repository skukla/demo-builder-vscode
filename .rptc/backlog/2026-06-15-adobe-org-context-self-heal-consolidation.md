# Consolidate Adobe org-context correction into one canonical self-heal → escalate path

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

## Research verdict (2026-06-15, two agents, cross-verified with aio-cli source + Experience League)

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

**Additional facet — the auth cache makes external auth changes invisible:** `AuthCacheManager`
holds `cachedOrganization` / `console.where` / org list in memory and only clears on in-app
login/logout (`authenticationService.clearAll()`, `:213/296`) or a window reload. A user who fixes
auth in a terminal (`aio auth login --force` + `aio console org select`) still hits the stale cached
org until they reload the window — confirmed live 2026-06-15 (terminal force-login + org-select did
NOT take effect until "Developer: Reload Window"). The in-app remedy must perform force-login +
org-select + cache clear ITSELF so the user never needs the terminal-then-reload dance. (Also note:
force-login refreshes the token but does NOT set `console.org` — the helper must org-select after.)

**Additional facet — the extension can surface orgs the CLI can't use:** the extension's org list
(SDK `client.getOrganizations`, `adobeEntityFetcher.ts:215`) and the CLI's App-Builder-scoped
`aio console org list` can DIVERGE (different filters / identity). The wizard can show/let the user
pick an org that the CLI then can't select or operate on → dead-end. The consolidation should
reconcile these: only offer orgs that are actually usable (or detect the divergence and prompt
re-login / a different org) rather than letting the picker and the CLI disagree silently.

**Open product question (separate):** should headless + PaaS *without* mesh require an
App-Builder-entitled org at all? If the App-Builder-scoped org list blocks an otherwise-valid
Commerce demo, the Adobe-setup gating may be over-broad for non-App-Builder demos.

## The ~5 existing variants to consolidate

| Variant | Location | Behavior |
|---|---|---|
| `ensureContext` self-heal | `adobeEntitySelector.ts:85-126` | org-mismatch → re-select org (for selectProject/selectWorkspace) |
| Direct `selectOrganization(project.adobe.organization)` | `edsResetMeshHelper.ts:122-123`, `projectResetService.ts:258-259` | reset flows set org context manually |
| `loginAndRestoreProjectContext` | `authenticationService.ts:564-617` via `adobeAuthGuard.ts` | login + re-select org/project/workspace |
| `validateAndClearInvalidOrgContext` | `organizationValidator.ts:134-146` | clear org context on persistent 403 |
| **(none)** — projects fetch | `adobeEntityFetcher.ts:285-289` `aio console project list` (no org arg) | dead-ends at terminal message ← the bug |

## Goal / scope

One canonical helper — e.g. `ensureOrgContext(orgId)` performing **self-heal (org-select + retry)
→ escalate (re-login) → surface "choose a different org"** — that ALL entity fetches and
context-dependent commands route through. Migrate the five variants to it (no soft deprecation:
delete the bespoke ones as each call site moves over). The projects-fetch path is the first
consumer (fixes the reported bug); the wizard step then shows an in-app remedy, never a terminal
instruction.

The extension already knows the target org id (`project.adobe.organization` on the dashboard; the
wizard-selected org id in state during creation) — thread it into `getProjects` (currently ignores
`_payload.orgId`, `projectHandlers.ts:52`) and the CLI fallback.

## Constraints / risk

- Touches the auth flows broadly — regression risk across org/project/workspace selection, mesh
  deploy gating, reset, and the wizard. Migrate call-site by call-site with tests; this is why it's
  a dedicated effort, not folded into a bug fix.
- Preserve the 401-vs-403 taxonomy (re-login vs org-select) exactly.
- Keep the access-revocation case ("identity lost org access") surfacing "pick a different org".

## Kickoff prompt

`/rptc:feat "Consolidate Adobe org-context correction into one canonical ensureOrgContext(orgId)
helper (self-heal via aio console org select + retry → escalate to in-app re-login → 'choose a
different org'), and route all entity fetches + the projects-fetch path through it (fixing the
'configured for a different organization' dead-end). Migrate and delete the ~5 existing bespoke
variants. See .rptc/backlog/2026-06-15-adobe-org-context-self-heal-consolidation.md."`
