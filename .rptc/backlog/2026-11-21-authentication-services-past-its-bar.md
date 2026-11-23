---
id: PL-120
kind: chore
area: platform
parent: PL-2
needs: []
value: low
status: built
---

# authentication/services is past its own size bar again

Filed 2026-11-21 from the backlog reconciliation. PL-2's 2026-08-27 verdict on
`src/features/authentication/services` was "leave", with a bar of 38 files. It now holds 45 `.ts`
files, and nothing tracks it.

Done when the directory is re-measured as PL-2 did and either regrouped into subfolders or given a
fresh dated verdict with its new bar.

## Shipped so far

- 2026-11-23  Re-measured 2026-11-23 (loop), as PL-2 did: 45 direct files, no subfolders; 18 added since PL-2's 2026-08-27 verdict. Name families still do the grouping: 17 adobe* (entity facade, reads, console ops, sign-in, SDK), about 10 sign-in and token files (auth*, signIn*, signInGate, tokenManager, rejectedTokens, imsTokenClaims), about 7 org-context files (ensure*, orgContextEnv, detectProjectOrgMismatch, projectOrgGuard, organizationValidator), 2 console teardown. Verdict: LEAVE, new bar 50 files. The one candidate subfolder is the Adobe I/O Events family (eventProviderBinding, eventProviderLifecycle, ioEventsClient, ioEventsTransport): four files with no shared prefix, so the listing does not group them; move them to an ioEvents/ subfolder if a fifth arrives or they keep being edited together.
