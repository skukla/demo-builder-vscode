# Monorepo Support with Independent Release Tracking - Implementation Plan

## Status Tracking
- [x] Planned
- [ ] In Progress
- [ ] Code Review
- [ ] Complete

**Created:** 2025-12-16
**Last Updated:** 2025-12-16

---

## Executive Summary

**Feature:** Monorepo Support with Independent Release Tracking

**Purpose:** Enable components from a monorepo to have independent release tracking via tag prefixes (e.g., `backend@1.0.0`, `optimizer@2.0.0`), allowing multiple Adobe Commerce components to be managed in a single repository while maintaining separate version lifecycles.

**Approach:** Extend the existing update infrastructure with minimal changes:
1. Add `tagPrefix` and `subdirectory` fields to `COMPONENT_REPOS` configuration
2. Filter GitHub releases by tag prefix in `fetchLatestRelease()`
3. Extract specific subdirectories from monorepo archives in `ComponentUpdater`

**Complexity:** Medium

**Key Risks:**
1. Breaking existing component updates (mitigate with backward-compatible type changes)
2. GitHub API rate limiting when fetching release lists (mitigate with existing caching patterns)

---

## Test Strategy

**Framework:** Jest with ts-jest
**Coverage Goals:** 80%+ overall, 100% critical paths

**Test Scenarios Summary:**
- **Tag prefix parsing** (Step 1): Interface normalization, backward compatibility
- **Release filtering by prefix** (Step 2): Matching, non-matching, mixed tags, version parsing
- **Subdirectory extraction** (Step 3): Valid paths, nested paths, backward compatibility
- **End-to-end monorepo update** (Step 3, Test 5): Complete flow from config → filtering → extraction
  - Verifies: Config with both tagPrefix and subdirectory
  - Verifies: Only matching tags selected, version extracted correctly
  - Verifies: Subdirectory passed through update chain and extraction works

See individual step files for detailed test specifications.

---

## Acceptance Criteria

- [ ] Components with `tagPrefix` correctly filter releases (e.g., only `backend@*` tags)
- [ ] Components without `tagPrefix` continue working unchanged (backward compatible)
- [ ] Subdirectory extraction correctly isolates component from monorepo archive
- [ ] Version parsing handles prefixed tags (e.g., `backend@1.0.0` -> `1.0.0`)
- [ ] All existing component update tests continue passing
- [ ] 80%+ test coverage on new code

---

## Risk Assessment

| Risk | Category | Likelihood | Impact | Mitigation | Contingency |
|------|----------|------------|--------|------------|-------------|
| Breaking existing updates | Technical | Low | High | Use TypeScript union types for backward compat | Revert to simple string config |
| Rate limiting on release fetch | Technical | Medium | Medium | Reuse existing fetch with `per_page=20` | Add request caching |
| Incorrect subdirectory extraction | Technical | Medium | Medium | Validate path exists before extraction | Rollback via existing snapshot |

---

## Dependencies

**New Packages:** None required

**Configuration Changes:**
- Extend `COMPONENT_REPOS` type from `Record<string, string>` to `Record<string, string | ComponentRepoConfig>`
- Add new component entries for Adobe Commerce backend/optimizer

**External Services:** GitHub API (existing integration)

---

## File Reference Map

### Existing Files to Modify

- `src/features/updates/services/updateManager.ts` - Add tag prefix support to `COMPONENT_REPOS` and `fetchLatestRelease()`
- `src/features/updates/services/componentUpdater.ts` - Add subdirectory extraction logic
- `templates/components.json` - Add new monorepo component definitions (optional, if needed)

### New Files to Create

- `tests/features/updates/services/updateManager.tagPrefix.test.ts` - Tag prefix unit tests
- `tests/features/updates/services/componentUpdater.subdirectory.test.ts` - Subdirectory extraction tests

---

## Coordination Notes

**Step Dependencies:**
1. **Step 1 (COMPONENT_REPOS extension)** must complete first
   - Provides: `ComponentRepoConfig` interface, `getRepoConfig()` helper
   - Required by: Steps 2 and 3
   - Status: No external dependencies

2. **Step 2 (Tag Prefix Filtering)** depends on Step 1
   - Uses: `getRepoConfig()` to extract tagPrefix
   - Provides: Updated `fetchLatestRelease()`, `parseVersionFromTag()`
   - Can be tested independently with mocked config

3. **Step 3 (Subdirectory Extraction)** depends on Steps 1 and 2
   - Uses: `getRepoConfig()` for subdirectory, `fetchLatestRelease()` results
   - Provides: Updated `updateComponent()`, `downloadAndExtract()` with subdirectory support
   - Includes end-to-end integration test (Test 5)

**Integration Points:**
- `getRepoConfig()` (Step 1) → provides both `tagPrefix` and `subdirectory` to subsequent steps
- `fetchLatestRelease()` (Step 2) → accepts `tagPrefix`, returns version + subdirectory via `ReleaseInfo`
- `parseVersionFromTag()` (Step 2) → strips both `component@` prefix and `v` prefix correctly
- `downloadAndExtract()` (Step 3) → handles optional subdirectory, extracts only needed files
- Existing rollback mechanism continues to work with subdirectory extraction
- Backward compatibility maintained: components without config work as before

---

## Next Actions

1. Begin Step 1: Extend COMPONENT_REPOS with Tag Prefix Support
