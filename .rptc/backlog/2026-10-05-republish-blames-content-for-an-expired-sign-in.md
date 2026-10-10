---
id: EDS-29
kind: fix
area: eds
needs: []
value: med
status: backlog
---

# Republish says "No publishable pages found" when the DA.live sign-in has expired

Filed 2026-10-05 from the first EDS-24 run on Justrite. Republish (`sync_content`) answered
"No publishable pages found. Ensure the site has content in DA.live." The site had content;
the DA.live sign-in had expired. The Debug Logs show the truth one line above the error:

```
[Helix] Failed to list /: Authentication expired. Please log in again.
[Helix] No publishable pages found
```

`helixPageDiscovery.ts` (`listAllPages`; it was in `helixSiteContent.ts` until the 2026-10-08
EDS-8 cut) catches the listing failure, logs a warning and returns an empty list; its caller,
`publishAllSiteContent` in `helixSiteContent.ts`, reads empty as "no content".
An SC is told to go and fix their content when the fix is to sign in.

## The fix

A listing that FAILED is not an empty listing: carry the failure up, and answer with the
sign-in message (the same wording the other DA.live paths use), through the user-facing
error formatters. A test with a lister that throws the auth error, asserting the message
the SC sees. Check the other callers of the same lister for the same swallow.

Also seen in the same run, earlier in the log: `[DaLiveConfig] Failed to grant access: Failed
to read org config: 401 Unauthorized` — logged as a warning and passed over. Same cause; it
should have stopped the run with the sign-in message before any publish.

## Shipped so far

- 2026-10-05  docs(backlog): EDS-29 and EDS-30 — an expired DA.live sign-in reads as no content, and as signed in (`f2e68a8e1`)
