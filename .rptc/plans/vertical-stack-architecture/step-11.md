# Step 11: Project Lifecycle Management (Cleanup & Deletion)

## Status

- [ ] Tests Written (RED)
- [ ] Implementation Complete (GREEN)
- [ ] Refactored (REFACTOR)

---

## Purpose

Implement proper cleanup and deletion for EDS projects. When a user deletes an EDS project, all associated external resources must also be cleaned up:

1. **Backend Data** - Remove demo data from Commerce/ACO backend (via commerce-demo-ingestion)
2. **GitHub Repository** - Delete or archive the repository
3. **DA.live Content** - Remove the site/content from DA.live
4. **Helix Configuration** - Unpublish and remove site from EDS
5. **Local Files** - Already handled by existing deletion logic

This ensures no orphaned resources remain after project deletion.

**Data Ingestion Tool:** Uses [commerce-demo-ingestion](https://github.com/skukla/commerce-demo-ingestion) for both creation (import) and deletion (cleanup) of backend data.

---

## Prerequisites

- [ ] Step 5 complete (GitHub Service with delete capability)
- [ ] Step 6 complete (DA.live Service with delete capability)
- [ ] Step 7 complete (EDS Project Service)
- [ ] Step 8 complete (Tool Integration - commerce-demo-ingestion)
- [ ] Understanding of existing project deletion flow (`handleDeleteProject`)

---

## API Reference (Researched)

### Backend Data Cleanup (commerce-demo-ingestion)

**Source:** [commerce-demo-ingestion](https://github.com/skukla/commerce-demo-ingestion)

#### Commerce Data Cleanup

```bash
npm run delete:commerce
```

**Purpose:** Reverse-dependency deletion of project-specific Commerce data (stores, categories, products, customers)

**Smart Detection:** Uses attribute prefixes (e.g., `cs_*` for CitiSignal, `br_*` for BuildRight) to identify project-specific data

**Dry Run Mode:**
```bash
DRY_RUN=true npm run delete:commerce
```
Tests deletion logic without actual removal - useful for preview before cleanup.

#### ACO Data Cleanup

```bash
npm run delete:aco
```

**Purpose:** Remove ACO data (products, variants, prices)

**Notes:**
- All operations are idempotent (safe to re-run)
- Deletion follows reverse dependency order (products before categories, etc.)
- Requires same `.env` configuration as import

---

### Helix Admin API - Unpublish/Delete

**Source:** [AEM Admin API](https://www.aem.live/docs/admin.html)

#### Unpublish from Live (Production)

```
DELETE https://admin.hlx.page/live/{org}/{site}/{ref}/{path}
```

**Purpose:** Removes content from live partition, purges CDN cache

**Authentication:** `_AuthCookie_` (IMS session cookie)

**Response Codes:**
- `204` - Resource unpublished
- `401` - Not authenticated
- `403` - Access role lacks permission
- `404` - Resource not found

**Query Parameters:**
- `disableNotifications` (boolean) - Suppress notification emails

#### Delete from Preview

```
DELETE https://admin.hlx.page/preview/{org}/{site}/{ref}/{path}
```

**Purpose:** Removes content from preview partition

**Authentication:** `_AuthCookie_`

**Response Codes:** Same as unpublish

#### To unpublish entire site:

```typescript
// Must iterate all pages or use wildcard path
// Unpublish from live first, then delete from preview
await fetch(`https://admin.hlx.page/live/${org}/${site}/main/*`, { method: 'DELETE' });
await fetch(`https://admin.hlx.page/preview/${org}/${site}/main/*`, { method: 'DELETE' });
```

**Note:** Helix 5 uses Configuration Service - full site removal may also require config API call.

---

### DA.live Admin API - Delete Content

**Source:** [DA Admin API](https://opensource.adobe.com/da-admin/)

```
DELETE https://admin.da.live/source/{org}/{repo}/{path}
```

**Purpose:** Delete content source file or directory

**Authentication:** `Authorization: Bearer <IMS token>`

**Response Codes:**
- `204` - Deleted successfully
- `400` - Invalid request
- `401` - Not authenticated
- `500` - Server error

**To delete entire site:**
```typescript
// Delete root directory removes all content
await fetch(`https://admin.da.live/source/${org}/${site}/`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${imsToken}` }
});
```

---

### GitHub API - Repository Deletion

**Source:** [GitHub REST API](https://docs.github.com/en/rest/repos/repos)

#### Delete Repository

```
DELETE https://api.github.com/repos/{owner}/{repo}
```

**Authentication:** `Authorization: Bearer <token>` with `delete_repo` scope

**Response Codes:**
- `204` - Repository deleted
- `403` - Forbidden (missing scope or not admin)
- `404` - Not found

#### Archive Repository (Safer Alternative)

```
PATCH https://api.github.com/repos/{owner}/{repo}
Body: { "archived": true }
```

**Authentication:** `repo` scope sufficient (no `delete_repo` needed)

**Response Codes:**
- `200` - Repository archived
- `403` - Forbidden

---

### OAuth Scope Requirements

| Operation | Required Scope | Notes |
|-----------|---------------|-------|
| Archive repo | `repo` | Safe, reversible |
| Delete repo | `delete_repo` | Dangerous, separate scope |
| DA.live delete | IMS token | DA scope required |
| Helix unpublish | IMS token | Same as publish scope |

**Recommendation:** Default to archive (requires only `repo` scope). Only request `delete_repo` if user explicitly wants permanent deletion.

---

## User Experience Design

### Deletion Confirmation Dialog

When user clicks "Delete Project" for an EDS project:

```
┌─────────────────────────────────────────────────────────────┐
│  Delete "my-citisignal-demo"?                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  This project has external resources that will also be      │
│  affected:                                                  │
│                                                             │
│  ☑ Clean up backend data (Commerce/ACO)                    │
│  ☑ Delete GitHub repository (user/my-citisignal-demo)      │
│  ☑ Delete DA.live content (org/my-citisignal-demo)         │
│  ☑ Unpublish from Edge Delivery (aem.live)                 │
│                                                             │
│  ⚠ This action cannot be undone.                           │
│                                                             │
│  [Cancel]                              [Delete Everything]  │
└─────────────────────────────────────────────────────────────┘
```

**Options:**
- Checkboxes let user choose what to delete
- Default: all checked (clean deletion)
- User can uncheck to preserve specific resources
- **Backend data cleanup first** - runs before removing frontend resources

### Alternative: Archive Instead of Delete

For GitHub, offer archive option:

```
☐ Delete GitHub repository
  └─ ○ Delete permanently
     ● Archive (preserves history, makes read-only)
```

---

## Implementation Design

### Extend Existing Delete Handler

**File:** `src/features/dashboard/handlers/dashboardHandlers.ts`

```typescript
// In handleDeleteProject, after confirmation:

async function cleanupEdsResources(
    project: Project,
    options: EdsCleanupOptions,
    context: HandlerContext,
): Promise<CleanupResult> {
    const results: CleanupResult = {
        backendData: { success: false, skipped: false },
        github: { success: false, skipped: false },
        daLive: { success: false, skipped: false },
        helix: { success: false, skipped: false },
    };

    // Only cleanup if project is EDS stack
    if (!isEdsProject(project)) {
        return results;
    }

    const edsMetadata = project.edsMetadata; // { githubRepo, daLiveOrg, daLiveSite, backendType }

    // 1. Clean up backend data FIRST (before removing frontend)
    // This is critical - data deletion depends on tool config which references project files
    if (options.cleanupBackendData) {
        try {
            const toolManager = new ToolManager();
            if (edsMetadata?.backendType === 'aco') {
                await toolManager.executeAcoCleanup();
            } else {
                await toolManager.executeCommerceCleanup();
            }
            results.backendData.success = true;
        } catch (error) {
            results.backendData.error = error.message;
            // Continue with other cleanup - backend failure shouldn't block frontend cleanup
        }
    } else {
        results.backendData.skipped = true;
    }

    // 2. Unpublish from Helix (depends on GitHub repo existing)
    if (options.unpublishHelix && edsMetadata?.githubRepo) {
        try {
            await helixService.unpublishSite(edsMetadata.githubRepo);
            results.helix.success = true;
        } catch (error) {
            results.helix.error = error.message;
        }
    } else {
        results.helix.skipped = true;
    }

    // 3. Delete DA.live content
    if (options.deleteDaLive && edsMetadata?.daLiveSite) {
        try {
            await daLiveService.deleteSite(edsMetadata.daLiveOrg, edsMetadata.daLiveSite);
            results.daLive.success = true;
        } catch (error) {
            results.daLive.error = error.message;
        }
    } else {
        results.daLive.skipped = true;
    }

    // 3. Delete/archive GitHub repo last
    if (options.deleteGitHub && edsMetadata?.githubRepo) {
        try {
            if (options.archiveInsteadOfDelete) {
                await githubService.archiveRepository(edsMetadata.githubRepo);
            } else {
                await githubService.deleteRepository(edsMetadata.githubRepo);
            }
            results.github.success = true;
        } catch (error) {
            results.github.error = error.message;
        }
    } else {
        results.github.skipped = true;
    }

    return results;
}
```

### EDS Metadata Storage

Store EDS-specific metadata in project manifest:

```typescript
interface EdsMetadata {
    /** GitHub repository in format "owner/repo" */
    githubRepo?: string;
    /** DA.live organization */
    daLiveOrg?: string;
    /** DA.live site name */
    daLiveSite?: string;
    /** Helix site URL */
    helixSiteUrl?: string;
    /** When the site was last published */
    lastPublished?: string;
    /** Backend type for data cleanup ('commerce' | 'aco') */
    backendType?: 'commerce' | 'aco';
    /** Brand ID used (for attribute prefix detection during cleanup) */
    brandId?: string;
}

interface Project {
    // ... existing fields
    edsMetadata?: EdsMetadata;
}
```

### Service Methods to Add

**GitHub Service:**
```typescript
async deleteRepository(repoFullName: string): Promise<void>;
async archiveRepository(repoFullName: string): Promise<void>;
```

**DA.live Service:**
```typescript
async deleteSite(org: string, site: string): Promise<void>;
async deleteFolder(org: string, site: string, path: string): Promise<void>;
```

**Helix Service (new or part of EDS Project Service):**
```typescript
async unpublishSite(repoFullName: string): Promise<void>;
async removeConfiguration(repoFullName: string): Promise<void>;
```

---

## Tests to Write First (TDD)

### Cleanup Flow Tests

```typescript
describe('EDS Project Cleanup', () => {
    describe('cleanupEdsResources', () => {
        it('should skip cleanup for non-EDS projects', async () => {
            const project = createMockProject({ stack: 'headless' });
            const result = await cleanupEdsResources(project, defaultOptions, context);

            expect(result.github.skipped).toBe(true);
            expect(result.daLive.skipped).toBe(true);
            expect(result.helix.skipped).toBe(true);
        });

        it('should cleanup all resources when all options enabled', async () => {
            const project = createMockProject({
                stack: 'edge-delivery',
                edsMetadata: {
                    githubRepo: 'user/test-repo',
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                },
            });

            const result = await cleanupEdsResources(project, {
                deleteGitHub: true,
                deleteDaLive: true,
                unpublishHelix: true,
            }, context);

            expect(helixService.unpublishSite).toHaveBeenCalledWith('user/test-repo');
            expect(daLiveService.deleteSite).toHaveBeenCalledWith('test-org', 'test-site');
            expect(githubService.deleteRepository).toHaveBeenCalledWith('user/test-repo');
        });

        it('should archive instead of delete when option set', async () => {
            const project = createMockProject({ /* ... */ });

            await cleanupEdsResources(project, {
                deleteGitHub: true,
                archiveInsteadOfDelete: true,
            }, context);

            expect(githubService.archiveRepository).toHaveBeenCalled();
            expect(githubService.deleteRepository).not.toHaveBeenCalled();
        });

        it('should continue cleanup even if one service fails', async () => {
            githubService.deleteRepository.mockRejectedValue(new Error('API error'));

            const result = await cleanupEdsResources(project, defaultOptions, context);

            expect(result.github.success).toBe(false);
            expect(result.github.error).toBe('API error');
            // DA.live and Helix should still be attempted
            expect(daLiveService.deleteSite).toHaveBeenCalled();
        });

        it('should cleanup in correct order (Backend → Helix → DA.live → GitHub)', async () => {
            const callOrder: string[] = [];
            toolManager.executeCommerceCleanup.mockImplementation(() => {
                callOrder.push('backend');
                return Promise.resolve({ success: true });
            });
            helixService.unpublishSite.mockImplementation(() => {
                callOrder.push('helix');
                return Promise.resolve();
            });
            daLiveService.deleteSite.mockImplementation(() => {
                callOrder.push('dalive');
                return Promise.resolve();
            });
            githubService.deleteRepository.mockImplementation(() => {
                callOrder.push('github');
                return Promise.resolve();
            });

            await cleanupEdsResources(project, defaultOptions, context);

            expect(callOrder).toEqual(['backend', 'helix', 'dalive', 'github']);
        });

        it('should use ACO cleanup for ACO backend type', async () => {
            const project = createMockProject({
                stack: 'edge-delivery',
                edsMetadata: {
                    backendType: 'aco',
                },
            });

            await cleanupEdsResources(project, { cleanupBackendData: true }, context);

            expect(toolManager.executeAcoCleanup).toHaveBeenCalled();
            expect(toolManager.executeCommerceCleanup).not.toHaveBeenCalled();
        });

        it('should use Commerce cleanup for Commerce backend type', async () => {
            const project = createMockProject({
                stack: 'edge-delivery',
                edsMetadata: {
                    backendType: 'commerce',
                },
            });

            await cleanupEdsResources(project, { cleanupBackendData: true }, context);

            expect(toolManager.executeCommerceCleanup).toHaveBeenCalled();
            expect(toolManager.executeAcoCleanup).not.toHaveBeenCalled();
        });

        it('should continue cleanup even if backend cleanup fails', async () => {
            toolManager.executeCommerceCleanup.mockRejectedValue(new Error('API error'));

            const result = await cleanupEdsResources(project, defaultOptions, context);

            expect(result.backendData.success).toBe(false);
            expect(result.backendData.error).toBe('API error');
            // Other cleanups should still be called
            expect(helixService.unpublishSite).toHaveBeenCalled();
            expect(daLiveService.deleteSite).toHaveBeenCalled();
            expect(githubService.deleteRepository).toHaveBeenCalled();
        });
    });
});
```

### Service Method Tests

```typescript
describe('GitHubService', () => {
    describe('deleteRepository', () => {
        it('should call DELETE /repos/{owner}/{repo}', async () => {
            await githubService.deleteRepository('user/test-repo');

            expect(octokit.request).toHaveBeenCalledWith(
                'DELETE /repos/{owner}/{repo}',
                { owner: 'user', repo: 'test-repo' }
            );
        });

        it('should require delete_repo scope', async () => {
            // Verify token has required scope before attempting delete
        });
    });

    describe('archiveRepository', () => {
        it('should call PATCH with archived: true', async () => {
            await githubService.archiveRepository('user/test-repo');

            expect(octokit.request).toHaveBeenCalledWith(
                'PATCH /repos/{owner}/{repo}',
                { owner: 'user', repo: 'test-repo', archived: true }
            );
        });
    });
});

describe('DaLiveService', () => {
    describe('deleteSite', () => {
        it('should delete site content from DA.live', async () => {
            await daLiveService.deleteSite('test-org', 'test-site');

            // Verify correct API calls
        });
    });
});
```

---

## Error Handling

### Partial Cleanup Failure

If one service fails, continue with others and report results:

```typescript
// Show results dialog after cleanup attempt:
┌─────────────────────────────────────────────────────────────┐
│  Project Deletion Results                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✓ Local files deleted                                      │
│  ✓ DA.live content removed                                  │
│  ✓ Site unpublished from Edge Delivery                      │
│  ✗ GitHub repository deletion failed                        │
│    "Requires admin access to repository"                    │
│                                                             │
│  The GitHub repository may need to be deleted manually:     │
│  https://github.com/user/my-citisignal-demo/settings        │
│                                                             │
│  [OK]                                                       │
└─────────────────────────────────────────────────────────────┘
```

### Permission Errors

- **GitHub**: May lack `delete_repo` scope - prompt for re-auth or manual deletion
- **DA.live**: May lack org admin access - provide manual instructions
- **Helix**: May fail if site was never published - treat as success

---

## Acceptance Criteria

- [ ] Delete confirmation shows EDS-specific resources (including backend data)
- [ ] User can choose which external resources to delete
- [ ] Backend data cleaned up via commerce-demo-ingestion (Commerce or ACO)
- [ ] GitHub repo can be deleted or archived
- [ ] DA.live content is removed
- [ ] Helix site is unpublished
- [ ] Cleanup order enforced: Backend → Helix → DA.live → GitHub
- [ ] Cleanup continues even if one service fails
- [ ] Clear error messages for permission issues
- [ ] EDS metadata stored in project manifest (including backendType)
- [ ] All tests passing

---

## Dependencies

- **Step 5 (GitHub Service):** Add `deleteRepository`, `archiveRepository` methods
- **Step 6 (DA.live Service):** Add `deleteSite` method
- **Step 7 (EDS Project Service):** Store `edsMetadata` during creation
- **Step 8 (Tool Integration):** Provides `executeCommerceCleanup()`, `executeAcoCleanup()` methods

---

## Research Tasks

Research completed - see API Reference section above.

1. [x] **Backend data cleanup** - `npm run delete:commerce` / `delete:aco` via commerce-demo-ingestion
2. [x] **Helix unpublish API** - `DELETE /live/{org}/{site}/{ref}/*` and `/preview/...`
3. [x] **DA.live delete API** - `DELETE /source/{org}/{repo}/` for full site
4. [x] **GitHub delete scope** - `delete_repo` for delete, `repo` for archive
5. [x] **Cleanup order** - Backend Data → Helix → DA.live → GitHub (documented in Notes)

---

## Estimated Complexity

**Medium** - Extends existing deletion, adds service methods

**Estimated Time:** 4-6 hours (plus research)

---

## Notes

### Why Order Matters

1. **Backend data first**: Must clean up Commerce/ACO data while tool config still exists
   - commerce-demo-ingestion reads project `.env` for credentials
   - Uses attribute prefixes (e.g., `cs_*`) to identify project-specific data
   - Safe: data deletion is idempotent and won't affect other projects
2. **Helix second**: Unpublish while repo still exists (may need repo for auth)
3. **DA.live third**: Content can be removed independently
4. **GitHub last**: Repo deletion is most destructive, do after others succeed

### Archive vs Delete

Archiving GitHub repos is safer:
- Preserves git history
- Can be unarchived if needed
- Makes repo read-only
- Shows clear "archived" badge

Consider making archive the default, delete opt-in.

### Missing EDS Metadata

If project was created before metadata tracking:
- Show warning that external resources may exist
- Provide links to check manually
- Don't block local deletion
