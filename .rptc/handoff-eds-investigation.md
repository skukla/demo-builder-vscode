# Handoff: EDS Project Creation Investigation

**Date:** 2026-01-09
**Status:** Testing Phase

---

## What Was Completed This Session

### 1. Fixed config.json Timing Bug
**File:** `src/features/project-creation/handlers/executor.ts` (lines 570-640)

**Problem:** config.json was pushed to GitHub with empty `commerce-core-endpoint` because EDS setup runs BEFORE mesh deployment.

**Fix:** Added "EDS Post-Mesh" phase that:
- Runs AFTER mesh deployment completes
- Updates local config.json with mesh endpoint
- Re-pushes config.json to GitHub

**Build Status:** ✅ Compiles successfully

### 2. Research: Workflow Restructuring
**Saved to:** `.rptc/research/project-creation-workflow-restructuring/research.md`

**Key Finding:** PM proposed moving GitHub/DA.live operations into a dedicated wizard step BEFORE project creation. This would:
- Solve config.json timing permanently (single push after mesh)
- Improve error recovery (retry EDS step without losing progress)
- Match user mental model better

**Recommendation:** Option 2 (Combined EDS Preflight Step) - but defer decision until we understand current issues via logging.

---

## What Needs Testing

### Strategic Logging Added Earlier
Logging was added to diagnose EDS project creation inconsistencies:
- GitHub repos not appearing in lists
- DA.live projects missing
- AEM Code Sync not re-running on retry

### Log Prefixes to Watch

| Prefix | File | What It Tracks |
|--------|------|----------------|
| `[GitHub:ListRepos]` | githubRepoOperations.ts | Repo pagination, filtering |
| `[EDS:DaLive]` | edsDaLiveOrgHandlers.ts | Token state, API responses |
| `[EDS:ServiceCache]` | edsHelpers.ts | Service caching behavior |
| `[GitHub App Check]` | checkGitHubAppHandler.ts | AEM Code Sync verification |

### Test Scenarios

**Scenario A: Create New EDS Project**
1. Run `Demo Builder: Create Project`
2. Select EDS stack
3. Go through wizard to GitHub/DA.live steps
4. Watch Debug output channel

**Scenario B: Edit Existing EDS Project**
1. Open existing EDS project
2. Click Edit/Configure
3. Watch Debug output channel

**Scenario C: Retry/Back Navigation**
1. Go to GitHub repo selection
2. Go back, then forward again
3. Check if repos still appear
4. Watch for cache behavior

### What to Look For

```
✅ Good signs:
[EDS:ServiceCache] Creating NEW GitHub services (no cache)
[GitHub:ListRepos] Total repos returned: 45
[EDS:DaLive] Token present: true, length: 1234

❌ Problem signs:
[EDS:ServiceCache] Returning CACHED GitHub services (stale?)
[GitHub:ListRepos] Total repos returned: 0
[EDS:DaLive] Token present: false
[EDS:DaLive] Response status: 401
```

### Questions to Answer

1. **Service caching:** Is cache returning stale services when fresh needed?
2. **Repo filtering:** Are repos returned by API but filtered out?
3. **Token state:** Is DA.live token present when expected?
4. **Retry behavior:** Does going back/forward break state?

---

## Resume Instructions

When you return with test results:

```
/rptc:helper-catch-up-quick
```

Then share:
1. What scenario you tested
2. The relevant Debug output logs
3. What behavior you observed (repos missing, etc.)

We'll analyze the logs together and determine next steps:
- If caching issue → Fix cache invalidation
- If filtering issue → Fix filter logic
- If token issue → Fix auth state management
- If architectural → Proceed with workflow restructuring

---

## Files Modified This Session

- `src/features/project-creation/handlers/executor.ts` - Added EDS Post-Mesh phase
- `.rptc/research/project-creation-workflow-restructuring/research.md` - Created

## Git Status

Changes are uncommitted. Consider committing the fix before testing:
```bash
git add -A && git commit -m "fix: update config.json with mesh endpoint after deployment"
```

---

*Handoff created by RPTC workflow*
