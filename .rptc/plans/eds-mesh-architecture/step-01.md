# Step 1: Rename GitHub Repo

## Type: AUTOMATED (gh CLI)

## Purpose

Rename the existing `skukla/commerce-mesh` repository to `skukla/headless-citisignal-mesh` using the GitHub CLI, then update all extension code references.

## Prerequisites

- [ ] `gh` CLI installed and authenticated (`gh auth status`)
- [ ] User has admin access to `skukla/commerce-mesh` repository

## GitHub CLI Command

```bash
# Rename the repository
gh repo rename headless-citisignal-mesh --repo skukla/commerce-mesh --yes
```

**Note:** GitHub automatically creates redirects from the old URL, so existing clones will continue to work.

## Tests to Write First (RED Phase)

### Test 1: Repository URL Updated
- **Given:** ComponentRegistryManager loading components.json
- **When:** Getting mesh component `commerce-mesh`
- **Then:** Source URL is `https://github.com/skukla/headless-citisignal-mesh`

### Test 2: Repository Resolver Returns New Repo
- **Given:** ComponentRepositoryResolver initialized
- **When:** Getting repository info for `commerce-mesh`
- **Then:** Returns `{ repository: 'skukla/headless-citisignal-mesh', ... }`

## Files to Create/Modify

### Modify: `src/features/components/config/components.json`
- Change line 133: `"url": "https://github.com/skukla/commerce-mesh"` to `"url": "https://github.com/skukla/headless-citisignal-mesh"`

### Modify: `tests/features/updates/services/componentRepositoryResolver.test.ts`
- Update expected repository value from `skukla/commerce-mesh` to `skukla/headless-citisignal-mesh`

## Implementation Details (GREEN Phase)

1. Update `components.json` mesh section with new repository URL
2. Update test assertions to expect new repository name
3. Verify no hardcoded references to old repo name remain

## Expected Outcome

- Extension clones mesh component from `skukla/headless-citisignal-mesh`
- All tests pass with updated repository references
- Component ID `commerce-mesh` unchanged (ID rename deferred to Step 3)

## Acceptance Criteria

- [x] `components.json` references new repository URL
- [x] `componentRepositoryResolver.test.ts` expects new repo name
- [x] `npm test` passes (componentRepositoryResolver tests: 12/12 passing)
- [x] No remaining references to `skukla/commerce-mesh` in source files

## Completion Notes

**Completed:** 2026-01-09
**Coverage:** 86.11% for componentRepositoryResolver.ts

**Additional Files Updated:**
- `tests/features/updates/services/updateManager-submodules.test.ts`
- `tests/features/project-creation/handlers/executor-meshComponentLoading.test.ts`
- `src/features/updates/services/componentRepositoryResolver.ts` (JSDoc)
- `src/features/updates/README.md`
- `src/features/components/README.md`
- `docs/architecture/component-version-management.md`
- `docs/architecture/update-system-refactoring.md`
