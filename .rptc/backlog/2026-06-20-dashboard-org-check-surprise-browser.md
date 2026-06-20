# Dashboard IMS org-check launches a surprise browser (SDK-unavailable CLI fallback)

**Status:** ✅ RESOLVED by `dashboard-open-orchestrator` Step 2 (2026-06-20). The org-context
check now runs through the on-open orchestrator as a non-interactive `OnOpenCheck`
(`src/features/dashboard/services/onOpenChecks/orgContextCheck.ts`): it probes with
`isAuthenticated()` + a new SDK-only `getOrganizationsSdkOnly()` and degrades to `unknown`
("Sign in to check") instead of hitting the `aio console org list` CLI fallback or an interactive
login on open. The CLI/interactive path remains only behind user-initiated actions (Switch IMS
Org / Sign in). Originally filed 2026-06-20 from a live dashboard session; root cause located.

## Symptom

Opening the project dashboard randomly launches a browser window. Reproduced 2026-06-20 — it
coincides with the **IMS org-context check** firing on dashboard load.

## Evidence (live log, 2026-06-20)

```
[Entity Fetcher] SDK unavailable, using slower CLI fallback for organizations
[Retry Strategy] Command succeeded after 14.2s (attempt 1/2)
[Entity Fetcher] Retrieved 1 organizations via CLI in 14.5s
[Performance] getOrganizations took 14.5s ⚠️ SLOW (expected <5.0s)
```

## Root cause (located)

The dashboard's org-context check runs async on load:
`handleRequestStatus` → `runOrgContextCheck` (`dashboardHandlers.ts:~137`) →
`detectProjectOrgMismatch` → `getOrganizations`. When the **Adobe Console SDK is unavailable**
(`adobeEntityFetcher.ts:111` logs "SDK unavailable, using slower CLI fallback"), the call drops to the
`aio` **CLI** path. The CLI `console org`/auth path can **open a browser** when the token needs an
interactive step — so a background dashboard health check produces a surprise browser launch (and a
14.5s stall).

Two coupled problems: (1) **surprise browser** from an automatic, non-user-initiated check; (2) the
**SDK-unavailable fallback** itself (SDK init failing/timing out → every org call is the slow,
browser-capable CLI path).

## Fix direction (investigate first)

- The org-context check on dashboard load must use a **quick, non-interactive** auth/org probe and
  must **never** trigger an `aio` command that can launch a browser without explicit user action
  (mirror the shipped "pre-flight authentication / no surprise browser windows" pattern — see
  `docs/CLAUDE.md` Pre-flight Authentication, and the canonical org-context approach).
- Separately, find why the **SDK is unavailable** here (init failure/timeout) — the CLI fallback is
  meant to be the exception, not the default; it's both slow (14.5s) and the browser-launch vector.
- Gate: the background check should degrade to "unknown / click to check" rather than block + launch.

## Related

- Adobe org-context residual workstreams (`2026-06-15-adobe-org-context-self-heal-consolidation.md`) —
  same subsystem; this is a concrete surprise-browser instance the self-heal work should subsume.
- `docs/CLAUDE.md` → Pre-flight Authentication pattern (the intended guard).
