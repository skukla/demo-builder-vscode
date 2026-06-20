# Step 2 — Migrate org-context as the first check (= the surprise-browser fix, P1)

**Goal:** move the org-context check onto the orchestrator AND make it non-interactive, so opening the
dashboard can never launch a browser or stall 14.5s. This step's migration *is* the P1 fix.

## Files

- New `src/features/dashboard/services/onOpenChecks/orgContextCheck.ts` — an `OnOpenCheck` wrapping the
  org-reachability logic, P1-compliant.
- Edit `dashboardHandlers.ts` — `handleRequestStatus` calls `void runOnOpenChecks(ctx, [orgContextCheck])`
  instead of `void runOrgContextCheck(...)`. Remove the old `runOrgContextCheck` once parity is proven.
- Edit `useDashboardStatus.ts` — route `checkResult` with `checkId==='org-context'` to the existing org
  banner/badge (keep the `orgContextResult` listener until removed in this step).
- Tests: `orgContextCheck.test.ts` + update `dashboardHandlers.test.ts` + hook test.

## P1-compliant probe (the actual fix)

The current path (`detectProjectOrgMismatch` → `getOrganizations` → SDK-unavailable **CLI fallback**)
is what launches the browser and stalls. The check's `run`:
1. Use a **quick, non-interactive** auth/org probe only — `isAuthenticatedQuick()` (token+expiry, no
   network) and the **SDK** org read if already initialized. NO `aio` CLI interactive path, NO
   `ensureAdobeIOAuth` browser prompt, NO `aio console org list` fallback on open.
2. Map results to outcomes:
   - token valid + org reachable + matches → `{status:'ok', data:{currentOrg}}`.
   - token valid + **mismatch** → `{status:'warning', message:'configured for a different organization', data:{orgMismatch}}` → banner + "Switch IMS Org" CTA (user-initiated re-auth is fine — that's not a surprise).
   - token absent/expired OR SDK not ready/unavailable → **`{status:'unknown', message:'Sign in to check organization'}`** → quiet "click to check / sign in" affordance. **Never** auto-launch the interactive flow.
3. Optional: post `{status:'pending'}` first (preserve the existing "Checking…" telegraph + 300ms
   min-display), but resolve fast (no CLI).

Net: the browser only ever opens when the **user** clicks Switch IMS Org / Sign in — never from the
automatic open-time check.

## Tests (write FIRST)

- valid token + matching org → `ok` outcome with currentOrg; **no CLI / no browser path invoked**
  (assert the interactive auth + CLI-fallback functions are NOT called).
- valid token + mismatch → `warning` outcome with orgMismatch (banner data).
- absent/expired token → `unknown` outcome (NOT an error, NOT a browser launch) — assert
  `ensureAdobeIOAuth`/interactive login NOT called.
- SDK unavailable → `unknown` (degrade), assert NO `aio console org list` fallback fired.
- handler wiring: `handleRequestStatus` invokes `runOnOpenChecks([orgContextCheck])` fire-and-forget;
  status payload returned without awaiting.
- hook: `checkResult{org-context, warning}` renders the mismatch banner; `unknown` renders the
  sign-in-to-check affordance; old `orgContextResult` listener removed.

## Constraints

- Keep the org banner/badge UX identical for the `ok`/`warning` cases; only the `unknown` case is new
  (replaces "silently launches browser / stalls").
- The slow/CLI path is NOT deleted — it stays available behind **user-initiated** actions (Switch IMS
  Org, Sign In); we only forbid it from the automatic on-open check.
- Cross-reference the canonical org-context approach + the backlog item; mark that backlog item
  resolved-by-this-step on completion.
