# EDS Media Copy, Preview, and Publish

**Research Date:** 2026-01-16
**Topic:** How to copy, preview, and publish media files for EDS storefronts
**Scope:** Codebase exploration
**Depth:** Standard

---

## Summary

The current content copy process only uses `full-index.json` which lists content pages but NOT media files. However, **all the building blocks already exist** - we just need to wire them up:

1. **DA.live API** already has `listDirectory()` for folder listing
2. **`copySingleFile()`** already handles binary blobs correctly
3. **Helix Admin API** preview/publish endpoints work for ANY file type

---

## Problem Statement

When resetting an EDS project (via Dashboard or Publish Storefront step), images show as broken because:

1. Content copy uses `/full-index.json` to get list of files
2. The index only contains content pages (HTML), NOT media files in `/media/`
3. Media files are never discovered, copied, previewed, or published

---

## Codebase Analysis

### Relevant Files

| File | Purpose | Lines |
|------|---------|-------|
| `src/features/eds/services/daLiveContentOperations.ts` | Content operations | 319-388 |
| `src/features/eds/services/daLiveContentOperations.ts` | `listDirectory()` API | 81-111 |
| `src/features/eds/services/daLiveContentOperations.ts` | `copySingleFile()` | 191-271 |
| `src/features/eds/services/helixService.ts` | Preview/publish APIs | 276-368 |
| `src/features/eds/services/helixService.ts` | `publishAllSiteContent()` | 700-764 |
| `src/features/dashboard/handlers/dashboardHandlers.ts` | Dashboard Reset | 747-763 |
| `src/features/projects-dashboard/handlers/dashboardHandlers.ts` | Projects Dashboard Reset | 736-752 |

### DA.live Directory Listing API

**Endpoint:**
```
GET https://admin.da.live/list/{org}/{site}/{path}
Authorization: Bearer {IMS_TOKEN}
```

**Response Format:**
- **Files**: `{ name, path, ext, lastModified }` (ext IS present)
- **Folders**: `{ name, path }` (ext is ABSENT)

**Folder Detection Pattern** (`daLiveContentOperations.ts:135-137`):
```typescript
const isFolder = !entry.ext;  // Folders lack 'ext' field
```

### Current Limitation

`daLiveContentOperations.ts:338`:
```typescript
const contentPaths: string[] = indexData.data?.map((item: { path: string }) => item.path) || [];
```

Only fetches paths from `full-index.json` - media files are NOT in this index.

### Helix Preview/Publish APIs

**Preview:**
```
POST https://admin.hlx.page/preview/{org}/{site}/{branch}/{path}
Headers:
  x-auth-token: {GITHUB_TOKEN}
  x-content-source-authorization: Bearer {IMS_TOKEN}
```

**Publish:**
```
POST https://admin.hlx.page/live/{org}/{site}/{branch}/{path}
Headers:
  x-auth-token: {GITHUB_TOKEN}
  x-content-source-authorization: Bearer {IMS_TOKEN}
```

**Key Insight:** These endpoints work for ANY file type, not just HTML. Media paths like `/media/image.png` work correctly.

---

## Existing Patterns

### Recursive Folder Walking

`daLiveContentOperations.ts:120-184`:
```typescript
async copyContent(source, destination, options) {
    if (options.recursive) {
        const entries = await this.listDirectory(source.org, source.site, source.path);
        for (const entry of entries) {
            const isFolder = !entry.ext;  // Folders lack 'ext'
            if (isFolder) {
                // Recursively copy subdirectory
                await this.copyContent(
                    { path: entry.path },
                    { path: destPath },
                    { recursive: true }
                );
            } else {
                // Copy individual file
                await this.copySingleFile(...);
            }
        }
    }
}
```

### Single File Copy (Binary Safe)

`daLiveContentOperations.ts:191-271`:
1. Fetches source as blob: `GET https://main--{site}--{org}.aem.live/{path}`
2. Posts to DA.live: `POST /source/{org}/{site}/{path}` with FormData
3. Handles any content-type (binary blobs work correctly)

---

## Implementation Options

### Option 1: Add Media Discovery to `copyContentFromSource`

**Approach:** After copying indexed content, also recursively copy `/media/` folder

**Changes Required:**
1. After line 371 in `copyContentFromSource`, add media copy step
2. Use `listDirectory()` to enumerate `/media/` folder
3. Recursively copy all media files using `copySingleFile()`
4. Track media files separately in progress/results

**Pros:**
- Minimal changes to existing flow
- Reuses existing `listDirectory()` and `copySingleFile()`
- Media copy is explicit and trackable

**Cons:**
- Two passes (index + media folder)
- Need to handle case where `/media/` doesn't exist

### Option 2: Replace Index-Based Copy with Full Recursive Copy

**Approach:** Instead of using `full-index.json`, recursively walk the entire source site

**Pros:**
- Catches ALL files including media
- Single unified approach

**Cons:**
- May copy unnecessary files (config, placeholders, etc.)
- Slower for large sites
- Less control over what gets copied

---

## Publishing Media

The `listAllPages()` method in `helixService.ts` currently skips non-HTML:

```typescript
// Line 634
if (entry.ext !== 'html') continue;
```

**To support media publishing:**
1. Create separate `listAllMedia()` method for `/media/` folder
2. OR use wildcard bulk publish: `{ paths: ["/*"], forceUpdate: true }`
3. OR publish media files individually alongside content

---

## Common Pitfalls

1. **Empty `/media/` folder**: Source may not have media - need graceful 404 handling
2. **Large media files**: Could slow down copy/publish significantly
3. **Excluded folders**: `.helix`, `.milo`, `placeholders` are intentionally skipped
4. **Binary content-type**: Already handled by blob fetch (verified)
5. **Rate limiting**: DA.live API may rate limit on many small files

---

## Key Takeaways

1. **All APIs exist** - `listDirectory()`, `copySingleFile()`, and Helix publish work for media
2. **Missing piece**: Just need to discover and include media paths in the copy/publish flow
3. **Two locations to update**:
   - `copyContentFromSource()` for copy operation
   - `publishAllSiteContent()` for publish operation
4. **Same pattern applies** to both Dashboard Reset and Publish Storefront step
5. **Minimal code changes** - infrastructure is already in place

---

## Recommended Approach

**Option 1 is recommended** because:
- Lower risk (additive change, doesn't modify existing content copy)
- Clear separation of content vs media
- Can be enabled/disabled independently
- Easier to debug if issues arise

**Implementation Steps:**
1. Add `copyMediaFromSource()` method to `daLiveContentOperations.ts`
2. Call it after content copy in both dashboard handlers
3. Add `listAllMedia()` method to `helixService.ts`
4. Include media paths in publish operations
5. Update progress tracking to show media copy/publish status

---

## References

- `src/features/eds/services/daLiveContentOperations.ts` - DA.live operations
- `src/features/eds/services/helixService.ts` - Helix preview/publish
- `src/features/eds/services/daLiveConstants.ts` - API base URLs
- `src/features/dashboard/handlers/dashboardHandlers.ts` - Dashboard Reset
- `src/features/projects-dashboard/handlers/dashboardHandlers.ts` - Projects Dashboard Reset
