# Test Coverage Remediation Plan

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Reviews Complete
- [x] Complete

**Created:** 2025-12-24
**Last Updated:** 2025-12-24
**Completed:** 2025-12-24
**Research Reference:** `.rptc/research/codebase-audit-test-coverage/research.md`

---

## Executive Summary

| Attribute | Value |
|-----------|-------|
| **Feature** | Comprehensive Test Coverage Remediation |
| **Purpose** | Address all findings from codebase audit to restore TDD integrity and prevent future silent failures |
| **Approach** | TDD - fix blocking issues first (imports, types), then systematically expand test coverage |
| **Complexity** | Medium-High (8 steps across 5 phases, touches 8-10 files across multiple features) |
| **Estimated Timeline** | 4-6 hours |
| **Key Risks** | Breaking existing tests, type changes affecting consumers, cross-reference validation complexity |

### Problem Statement

The codebase audit revealed a **breakdown in TDD process** where tests were written after implementation using outdated structures. This resulted in:

1. **BLOCKING**: File rename (`demo-templates.json` to `templates.json`) not reflected in code - runtime failures
2. **Type Mismatch**: TypeScript types missing 3+ fields (`stack`, `brand`, `source`, `submodules`)
3. **Coverage Gaps**: Data model ~40%, updater ~45%, fnm ~55% - all below 80% target

### Critical Findings from Research

**Verified BLOCKING Issues:**
- `src/features/project-creation/ui/helpers/templateLoader.ts:8` imports non-existent `demo-templates.json`
- `tests/unit/templates/demoTemplates.test.ts:49` references non-existent file path
- TypeScript `DemoTemplate` interface missing fields present in actual JSON

**Root Causes:**
- Tests written AFTER implementation (violating TDD)
- TypeScript types not validated against JSON structure
- No cross-reference validation (templates reference stacks/brands by ID without verification)
- File rename without coordinated code/test updates

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with ts-jest (Node environment)
- **Coverage Goals:**
  - Data model: 40% to 80%+ (cross-reference validation)
  - Component updater: 45% to 80%+ (failure paths, rollback)
  - fnm/Node version: 55% to 80%+ (path discovery, FNM_DIR)
- **Test Distribution:** Unit (85%), Integration (15%)

### Test Scenarios Summary

Detailed test scenarios are documented in individual step files (`step-01.md` through `step-08.md`). High-level coverage areas:

**Phase 1: Blocking Fixes (Steps 1-2)**
- Import path resolution tests
- TypeScript type completeness validation
- Type-JSON structure alignment

**Phase 2: Data Model Tests (Steps 3-4)**
- Template structure validation
- Cross-reference validation (stack IDs exist in stacks.json)
- Cross-reference validation (brand IDs exist in brands.json)
- Git source configuration tests
- Legacy test migration to new structure

**Phase 3: Updater Tests (Step 5)**
- Snapshot creation before update
- Automatic rollback on failure
- .env file preservation during updates
- Concurrent update lock mechanism
- Error formatting for user display

**Phase 4: fnm Tests (Steps 6-7)**
- fnm path discovery (4 locations: Apple Silicon, Intel, manual, self-install)
- FNM_DIR environment variable support
- PATH caching mechanism
- `which` fallback command
- Per-Node-version prerequisite checking

**Phase 5: Build Validation (Step 8)**
- TypeScript type vs JSON structure validation
- Import path resolution verification
- Compile-time mismatch detection

---

## Implementation Constraints

- **File Size:** <500 lines per file (standard)
- **Complexity:** <50 lines/function, <10 cyclomatic complexity
- **Dependencies:** Reuse existing test patterns from `brands.test.ts` and `stacks.test.ts`
- **Platforms:** Node.js 18+, Jest with ts-jest
- **Performance:** Tests should complete in <30 seconds each

---

## Acceptance Criteria (Definition of Done)

### Required for Completion

- [x] **Fix imports:** All broken imports (`demo-templates.json`) fixed to `templates.json`
- [x] **Fix types:** TypeScript types match actual JSON structure (add `stack`, `brand`, `source`, `submodules`)
- [x] **Cross-reference tests:** Tests verify templates reference valid stack/brand IDs
- [x] **Updater coverage:** Component updater tests cover failure paths (>=80%)
- [x] **fnm coverage:** Path discovery and FNM_DIR tests pass (>=80%)
- [x] **Build validation:** Build-time validation catches type/JSON mismatches
- [x] **No regressions:** All existing tests still pass

### Quality Gates

- [x] All new tests follow Given-When-Then pattern
- [x] Test files use checkbox format for TDD tracking
- [x] Coverage report shows improvement in target areas
- [x] No console.log or debugger statements in test code

---

## Risk Assessment

| Risk | Category | Likelihood | Impact | Priority | Mitigation | Contingency |
|------|----------|------------|--------|----------|------------|-------------|
| Breaking existing tests | Technical | Medium | High | Critical | Run full test suite after each step; use `npm run test:watch` for rapid feedback | Revert step immediately, analyze failure root cause |
| Type changes break consumers | Technical | Medium | Medium | High | Search for type usages (`DemoTemplate`) before changes; add fields as optional (`?`) | Add backward-compatible fields; deprecation warning |
| Cross-reference validation false positives | Testing | Low | Medium | Medium | Test against known-good data first; use existing `stacks.json`/`brands.json` as source of truth | Add tolerance for missing refs in edge cases |
| fnm path tests platform-specific | Testing | Medium | Low | Low | Mock file system operations using Jest mocks; test path logic, not actual paths | Skip tests on unsupported platforms with `describe.skip()` |
| Build validation too strict | Process | Low | Medium | Low | Start with warnings (console.warn), graduate to errors after validation | Configure severity levels via environment variable |
| Large PR scope | Schedule | Medium | Medium | Medium | Implement in logical phases; each phase can be merged independently | Split into multiple PRs if needed |

---

## Dependencies

### New Packages
None required - all functionality uses existing Jest and TypeScript infrastructure.

### Configuration Changes
- Possible `tsconfig.json` updates for stricter type checking (optional, Step 8)
- No database migrations required
- No external service integrations

### Existing Patterns to Reuse
- `tests/templates/stacks.test.ts` - Cross-reference validation pattern
- `tests/templates/brands.test.ts` - Structure validation pattern
- `tests/core/shell/environmentSetup-pathDiscovery.test.ts` - Mock patterns for file system

---

## File Reference Map

### Existing Files to Modify

**Critical (Blocking Fixes):**
| File | Line(s) | Change |
|------|---------|--------|
| `src/features/project-creation/ui/helpers/templateLoader.ts` | 8 | Fix import: `demo-templates.json` to `templates.json` |
| `src/types/templates.ts` | 29-44 | Add missing fields: `stack`, `brand`, `source`, `submodules` |
| `tests/unit/templates/demoTemplates.test.ts` | 49 | Fix path reference; consider migration to new test file |

**Test Expansion:**
| File | Purpose |
|------|---------|
| `tests/features/updates/services/componentUpdater.test.ts` | Add snapshot, rollback, .env preservation tests |
| `tests/core/shell/environmentSetup-nodeVersion.test.ts` | Add FNM_DIR support tests |
| `tests/features/prerequisites/handlers/installHandler-fnmShell.test.ts` | Add path discovery, caching tests |

### New Files to Create

| File | Purpose |
|------|---------|
| `tests/templates/templates.test.ts` | New template structure validation + cross-reference tests |

**Total Files:** 6-7 modified, 1 created

---

## Coordination Notes

### Step Dependencies

```
Phase 1 (Blocking)    Phase 2 (Data Model)   Phase 3-4 (Updater/fnm)   Phase 5 (Build)
     |                      |                        |                      |
  Step 1 -----------------> |                        |                      |
  (Fix imports)             |                        |                      |
     |                      |                        |                      |
  Step 2 ----------------> Step 3 ----------------> Step 5 ------------> Step 8
  (Fix types)          (New template tests)    (Updater tests)      (Build validation)
                            |                        |
                       Step 4 ----------------> Step 6
                       (Migrate legacy)       (fnm path tests)
                                                     |
                                                  Step 7
                                                (FNM_DIR tests)
```

**Critical Path:**
- Steps 1-2 MUST complete before Steps 3-4 (types needed for test fixtures)
- Steps 5-7 are independent of each other (can be parallelized if desired)
- Step 8 depends on Steps 1-2 (types must be correct for validation)

### Integration Points

- **TypeScript types (Step 2)** affect all subsequent test steps - fixture definitions, assertions
- **Cross-reference validation pattern (Step 3)** establishes pattern for future data model tests
- **Build validation (Step 8)** integrates with CI/CD pipeline

---

## Process Improvements (From Research)

The research identified these process improvements to prevent future TDD breakdowns:

| Gap Identified | Recommended Fix | Implemented By |
|----------------|-----------------|----------------|
| File renames break imports | Pre-commit hook to verify imports resolve | Step 8 (build validation) |
| Types out of sync with JSON | JSON schema to TypeScript type generator (future) | Manual type update (Step 2) |
| Cross-references unvalidated | Contract tests between features | Step 3 (cross-reference tests) |
| Tests written after implementation | Enforce TDD in PR reviews | Process change (documentation) |
| Fragmented test organization | Test file per source file convention | Already following pattern |

---

## TDD Execution Guide

### Watch Mode Setup (Per Testing SOP)

```bash
# Terminal 1: Auto-compile TypeScript
npm run watch

# Terminal 2: Watch mode for tests
npm run test:watch -- tests/templates tests/features/updates tests/core/shell
```

### Phase Execution Order

1. **Phase 1 (Steps 1-2):** Run first - blocking fixes enable all other phases
2. **Phase 2 (Steps 3-4):** Data model tests - establish cross-reference pattern
3. **Phase 3-4 (Steps 5-7):** Can run in parallel - independent test expansion
4. **Phase 5 (Step 8):** Run last - validates entire build

### Quality Gate Validation

After all steps complete:
```bash
npm run test:fast   # Quick full validation (3-5 min)
npm test           # Full pretest + lint + tests (final CI validation)
```

---

## Next Actions

After plan approval, execute:
```bash
/rptc:tdd "@test-coverage-remediation"
```

**First Step:** Step 1 - Fix import path in `templateLoader.ts` (BLOCKING)

---

## Appendix: Research Summary

### Quantified Coverage Gaps (From Research)

| Area | Current Coverage | Target | Gap |
|------|------------------|--------|-----|
| Data Model (templates/stacks/brands) | ~40% | 80%+ | Cross-references, new fields |
| Component Updater | ~45% | 80%+ | Snapshot, rollback, .env preservation |
| fnm/Node Version | ~55% | 80%+ | Path discovery, FNM_DIR, caching |

### Files Verified to Need Changes

| File | Issue | Verification |
|------|-------|--------------|
| `templateLoader.ts:8` | Imports `demo-templates.json` (doesn't exist) | Confirmed via Read tool |
| `templates.ts:29-44` | Missing `stack`, `brand`, `source`, `submodules` | Confirmed by comparing with `templates.json` |
| `demoTemplates.test.ts:49` | References non-existent file | Confirmed via Read tool |

### Existing Good Patterns to Follow

| Test File | Pattern |
|-----------|---------|
| `tests/templates/stacks.test.ts` | Cross-reference validation with components.json |
| `tests/templates/brands.test.ts` | Structure validation with schema compliance |

---

_Plan created by Master Feature Planner (Overview Generator Sub-Agent)_
_Status: Ready for Step Generation_
