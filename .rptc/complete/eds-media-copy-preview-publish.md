# Implementation Plan: EDS Media Copy, Preview, and Publish

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review
- [x] Security Review
- [x] Complete

**Created:** 2026-01-16
**Completed:** 2026-01-16
**Research Reference:** `.rptc/research/eds-media-copy-preview-publish/research.md`

---

## Executive Summary

**Feature:** Copy, preview, and publish media files (images) for EDS storefronts during Reset operations.

**Problem:** When resetting an EDS project (via Dashboard or Projects Dashboard), images appear broken because:
1. Content copy uses `/full-index.json` which only lists HTML pages
2. Media files in `/media/` folder are never discovered, copied, previewed, or published

**Solution:** Add media file handling to the existing content operations:
1. Add `copyMediaFromSource()` method to discover and copy `/media/` folder contents
2. Call it after content copy in Reset operations
3. Use existing bulk preview/publish which already handles all file types via `/*` wildcard

**Approach:** Option 1 from research - Additive change after content copy (lower risk, clear separation)

**Estimated Complexity:** Low-Medium (all APIs already exist, just wiring them up)

**Key Insight:** Helix bulk APIs use `paths: ["/*"]` which already includes media files. The only missing piece is copying media to DA.live.

---

## Current State Analysis

### What Works
- `listDirectory()` - Can list any folder including `/media/`
- `copySingleFile()` - Handles binary blobs correctly
- Helix bulk preview/publish - Uses `/*` wildcard, already includes media files
- `publishAllSiteContent()` - Already uses bulk APIs

### What's Missing
- **Media discovery during Reset** - Content copy only uses `full-index.json` (line 338)
- **Media copy operation** - Need to copy `/media/` folder from source to destination

### Why Bulk Publish Already Works for Media
The `previewAllContent()` and `publishAllContent()` methods use:
```typescript
body: JSON.stringify({
    paths: ['/*'],
    forceUpdate: true,
})
```
This wildcard pattern includes ALL files, not just HTML. Once media is copied to DA.live, the bulk publish will automatically include it.

---

## Implementation Plan

### Step 1: Add `copyMediaFromSource()` Method

**File:** `src/features/eds/services/daLiveContentOperations.ts`

**Purpose:** Recursively copy all files from `/media/` folder

**Implementation:**
```typescript
/**
 * Copy media files from source site to destination site
 * Recursively copies all files from /media/ folder
 *
 * @param source - Source content configuration (org, site)
 * @param destOrg - Destination organization
 * @param destSite - Destination site
 * @param progressCallback - Optional progress callback
 * @returns Copy result with success status and file lists
 */
async copyMediaFromSource(
    source: { org: string; site: string },
    destOrg: string,
    destSite: string,
    progressCallback?: DaLiveProgressCallback,
): Promise<DaLiveCopyResult>
```

**Logic:**
1. Call `listDirectory(source.org, source.site, '/media')` to get all entries
2. Handle 404 gracefully (source may not have `/media/` folder)
3. For each entry:
   - If folder (no `ext`): recursively process
   - If file: call `copySingleFile()` to copy
4. Track progress and report via callback
5. Return `DaLiveCopyResult` with copied/failed files

**Test Cases:**
- Copy media from source with files
- Handle source with no `/media/` folder (404)
- Handle nested folders within `/media/`
- Progress callback invocation
- Partial failure handling (some files fail)

---

### Step 2: Update Dashboard Reset Handler

**File:** `src/features/dashboard/handlers/dashboardHandlers.ts`

**Purpose:** Call `copyMediaFromSource()` after content copy

**Location:** After `copyContentFromSource()` call in `handleResetEds()` (around line 755)

**Implementation:**
```typescript
// Copy content (existing)
const copyResult = await daLiveOps.copyContentFromSource(...);

// Copy media (NEW)
progress.report({ message: 'Step 4/6: Copying media files...' });
const mediaResult = await daLiveOps.copyMediaFromSource(
    { org: contentSource.org, site: contentSource.site },
    daLiveOrg,
    daLiveSite,
);

// Log media copy result
if (mediaResult.copiedFiles.length > 0) {
    context.logger.info(`[EDS] Copied ${mediaResult.copiedFiles.length} media files`);
}
```

**Test Cases:**
- Reset copies media files after content
- Media copy failure doesn't block Reset (log warning, continue)
- Progress shows media copy step

---

### Step 3: Update Projects Dashboard Reset Handler

**File:** `src/features/projects-dashboard/handlers/dashboardHandlers.ts`

**Purpose:** Same changes as Dashboard Reset handler

**Location:** After `copyContentFromSource()` call in `handleResetEds()` (around line 740)

**Implementation:** Same as Step 2

**Test Cases:**
- Same as Step 2 but for Projects Dashboard handler

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/features/eds/services/daLiveContentOperations.ts` | Add method | `copyMediaFromSource()` for recursive media copy |
| `src/features/dashboard/handlers/dashboardHandlers.ts` | Update | Call `copyMediaFromSource()` after content copy |
| `src/features/projects-dashboard/handlers/dashboardHandlers.ts` | Update | Call `copyMediaFromSource()` after content copy |
| `tests/features/eds/services/daLiveContentOperations.test.ts` | New/Update | Tests for `copyMediaFromSource()` |
| `tests/features/dashboard/handlers/dashboardHandlers-eds.test.ts` | Update | Test media copy in Reset |
| `tests/features/projects-dashboard/handlers/dashboardHandlers-dalive-auth.test.ts` | Update | Test media copy in Reset |

---

## Test Strategy

### Unit Tests

**daLiveContentOperations.test.ts:**
1. `copyMediaFromSource` - copies files from /media/ folder
2. `copyMediaFromSource` - handles 404 when /media/ doesn't exist
3. `copyMediaFromSource` - recursively copies nested folders
4. `copyMediaFromSource` - invokes progress callback correctly
5. `copyMediaFromSource` - returns partial success when some files fail

**dashboardHandlers-eds.test.ts (existing file):**
6. `handleResetEds` - copies media files after content copy
7. `handleResetEds` - continues if media copy fails (logs warning)

### Integration Test
8. Full Reset flow: reset repo → copy content → copy media → publish

---

## Acceptance Criteria

- [ ] Media files are copied from source `/media/` folder during Reset
- [ ] Missing `/media/` folder is handled gracefully (no error, just skip)
- [ ] Progress UI shows media copy step
- [ ] Reset completes successfully even if media copy partially fails
- [ ] Bulk publish includes media files (already works, just verify)
- [ ] All existing tests pass
- [ ] Build succeeds

---

## Risk Assessment

### Risk 1: Large Media Folders
- **Likelihood:** Medium
- **Impact:** Medium (slow Reset)
- **Mitigation:** Progress callback shows file count; existing rate limiting handles API limits

### Risk 2: Nested Folder Structure
- **Likelihood:** Low (most sites have flat /media/)
- **Impact:** Low
- **Mitigation:** Recursive implementation handles any depth

### Risk 3: Binary Content Types
- **Likelihood:** N/A (already handled)
- **Impact:** None
- **Mitigation:** `copySingleFile()` uses blob fetch, verified to work with any content type

---

## Implementation Notes

### Why Not Modify `copyContentFromSource()`?
The research recommended Option 1 (additive) over Option 2 (replace index-based) because:
1. Lower risk - doesn't modify existing content copy logic
2. Clear separation - content vs media are distinct operations
3. Easier debugging - can identify which operation failed
4. Can be disabled independently if issues arise

### Why Bulk Publish Doesn't Need Changes
The `previewAllContent()` and `publishAllContent()` methods use `paths: ['/*']` which:
1. Recursively includes ALL files in the site
2. Already processes media files correctly
3. No code changes needed for publishing

### Progress Step Count Update
Current Reset progress: 5 steps
- Step 1: Checking DA.live authentication
- Step 2: Resetting code to template
- Step 3: Copying content
- Step 4: Copying media (NEW)
- Step 5: Publishing to CDN
- Step 6: Verifying (implied)

---

## Verification Checklist

- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] Create EDS project
- [ ] Reset project via Dashboard
- [ ] Verify images load on site
- [ ] Check browser network tab - media files return 200
- [ ] Reset project via Projects Dashboard
- [ ] Same verification

---

_Plan ready for PM approval_
