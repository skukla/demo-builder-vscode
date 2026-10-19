---
id: EDS-54
kind: fix
area: eds
needs: []
value: low
status: backlog
---

# An expired DA.live sign-in during the access grant is logged and passed over

Filed 2026-10-19, split from EDS-29 by the unattended loop. EDS-29's run on Justrite
(2026-10-05) logged this line before the publish failed:

```
[DaLiveConfig] Failed to grant access: Failed to read org config: 401 Unauthorized
```

`grantAccess` in `daLiveSiteAccess.ts` catches every failure and returns
`{ success: false, error }`; its callers treat that as a warning and carry on. The
401 comes back as a plain `Error` from the org-config read, not as `DaLiveAuthError`,
so the house pattern (`if (error instanceof DaLiveAuthError) throw error;`) cannot see
it yet.

**What it costs now.** Less than it did. Since EDS-29's fix (`3c0fe2c6f`) the same run
stops at the page listing with the sign-in message, one step later. The SC still
waits through the steps between, and the grant itself silently did nothing.

## The fix, roughly

Make the org-config read throw `DaLiveAuthError` on a 401, as `createErrorFromResponse`
does for the other DA.live calls, and let `grantAccess` re-throw it. Then check every
caller of `grantAccess` (project creation's permission step and `ensureEdsContent`
wrap it in a non-fatal helper) so the sign-in error reaches the caller rather than
becoming a warning.

**Not done in the loop because** it changes what several creation-time callers see,
and each needs its own look.
