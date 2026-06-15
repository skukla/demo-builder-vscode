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
