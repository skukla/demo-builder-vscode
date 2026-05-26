# Implementation Plan: EDS Mesh Architecture Separation

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review
- [x] Security Review
- [x] Complete

**Completed:** 2026-01-10

**Created:** 2026-01-09

---

## Executive Summary

**Feature:** Separate API Mesh configurations for EDS and Headless storefronts

**Purpose:** EDS dropins expect unprefixed GraphQL operations (`productSearch`) while Headless/Next.js uses prefixed operations (`Catalog_productSearch`). Currently both stack types share a single mesh, causing EDS sites to fail when using PaaS backend.

**Approach:**
1. Rename existing `commerce-mesh` repo to `headless-citisignal-mesh` (preserves PREFIX transforms)
2. Fork and create `eds-commerce-mesh` repo with passthrough configuration (no prefixes) and caching enabled
3. Update Demo Builder extension to route each stack type to its correct mesh

**Performance Context (Research-Validated):**
API Mesh on Edge (Cloudflare Workers) adds minimal overhead:
- Cold start: ~5ms (99.99% warm rate)
- Typical overhead: ~50ms with caching enabled
- Value: Extensibility layer worth the minimal latency cost

**Estimated Complexity:** Medium

**Key Risks:**
1. GitHub API rename operations may affect existing projects referencing old repo name
2. Component registry changes could break existing project configurations
3. Mesh deployment routing logic must correctly detect stack type
4. Performance regression if caching not properly configured (mitigated by enabling cache in mesh.json)

---

## Implementation Constraints

- **File Size:** <500 lines (standard)
- **Complexity:** <50 lines/function, <10 cyclomatic complexity
- **Dependencies:**
  - REQUIRED: Reuse existing `GitHubRepoOperations` for GitHub API calls
  - REQUIRED: Reuse existing `components.json` patterns for registry
  - PROHIBITED: Creating new abstract base classes for single mesh type
- **Platforms:** VS Code Extension, Node.js 18+
- **Performance:** GitHub API operations <30s, no UI blocking

---

## Test Strategy

**Framework:** Jest with ts-jest
**Coverage Goal:** 80%+

**Test Scenarios Summary:**
(Detailed test scenarios are in each step file)

- Step 1: Repository URL reference updates in components.json
- Step 2: MANUAL - No tests (fork and configure mesh.json manually)
- Step 3: Component registry validation (both mesh types, stack routing, frontend dependency)
- Step 4: Config.json generation with correct mesh endpoints for both commerce-core-endpoint and commerce-endpoint
- Step 5: End-to-end integration verification (mocked)

---

## Acceptance Criteria

- [x] Existing `commerce-mesh` repo renamed to `headless-citisignal-mesh` on GitHub
- [x] New `eds-commerce-mesh` repo created with passthrough (no prefix) configuration
- [x] EDS mesh configured with response caching enabled (`responseConfig.cache: true`)
- [x] `components.json` contains both `eds-commerce-mesh` and `headless-commerce-mesh` entries
- [x] EDS stack projects automatically use `eds-commerce-mesh` component
- [x] Headless stack projects continue using `headless-commerce-mesh` (renamed from commerce-mesh)
- [x] EDS `config.json` uses mesh endpoint for BOTH `commerce-core-endpoint` and `commerce-endpoint`
- [x] Mesh caching verified working (Cache-Status header returns HIT on repeated queries)
- [x] All existing tests pass after changes
- [x] Coverage >= 80% for new code

---

## Risk Assessment

### Risk 1: GitHub Rename Breaks References

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** High
- **Mitigation:**
  1. Rename operation creates automatic redirect on GitHub
  2. Update all Demo Builder code references before renaming
  3. Document migration path for existing projects

### Risk 2: Mesh Endpoint Routing Errors

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** High
- **Mitigation:**
  1. Unit test stack type detection thoroughly
  2. Validate mesh type matches frontend type
  3. Add logging for mesh selection decisions

### Risk 3: Config.json Format Incompatibility

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Medium
- **Mitigation:**
  1. Verify EDS dropin expectations via documentation
  2. Test with real EDS site before merging
  3. Keep existing behavior for ACCS backend (no mesh needed)

---

## File Reference Map

### Existing Files to Modify

- `src/features/components/config/components.json` - Add both mesh types, update stacks and frontend dependency
- `src/features/eds/services/edsSetupPhases.ts` - Update config.json generation for EDS (both endpoints use mesh)

### New Files to Create

- `tests/features/components/services/ComponentRegistryManager-mesh-entries.test.ts` - Mesh registry tests
- `tests/features/components/stackRouting.test.ts` - Stack-to-mesh routing tests
- `tests/features/eds/services/edsSetupPhases-configJson.test.ts` - EDS config.json generation tests
- `tests/integration/features/mesh/meshArchitectureRouting.test.ts` - Integration tests

---

## Configuration

**Efficiency Review:** enabled
**Security Review:** enabled (GitHub token handling in repo operations)

---

## Step Breakdown

1. **Rename GitHub Repo** - Use `gh repo rename` to rename `skukla/commerce-mesh` to `skukla/headless-citisignal-mesh`, then update extension code references
2. **Create EDS Mesh Repo** - Use `gh repo create` to create `skukla/eds-commerce-mesh` with passthrough config (no prefixes) and caching enabled
3. **Update Component Registry and Stack Routing** - Add both mesh types to `components.json`, update stacks and frontend dependency
4. **Update Config Generation** - EDS `config.json` uses mesh for both `commerce-core-endpoint` and `commerce-endpoint`
5. **Integration Testing** - Verify mesh deployment and EDS site functionality

---

## Next Actions

To execute this plan:
```
/rptc:tdd "@eds-mesh-architecture/"
```
