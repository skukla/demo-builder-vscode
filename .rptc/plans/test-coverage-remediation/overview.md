# Test Coverage Remediation Plan

## Status Tracking
- [x] Planned
- [x] In Progress
- [x] Efficiency Review
- [x] Security Review
- [x] Complete

## Executive Summary
- **Feature**: Remediate test mock drift from actual JSON configuration structures
- **Purpose**: Prevent v3.0.0 components.json bug class where tests used outdated v2.0 mock structure
- **Approach**: Extend existing type-json-alignment.test.ts pattern to components.json; verify feature mocks
- **Complexity**: Low (leveraging established patterns)
- **Key Risks**: Mock drift in feature tests not caught by type alignment tests; incomplete inventory

## Test Strategy
- **Framework**: Jest, ts-jest
- **Coverage Goals**: 100% of JSON config files have type alignment tests; all feature mocks verified
- **Test Scenarios Summary**: See individual step files for detailed test cases

## Implementation Constraints
- File Size: <500 lines (standard)
- Complexity: Extend existing patterns only
- Dependencies: Reuse type-json-alignment.test.ts helpers (findUnknownFields, formatUnknownFieldsError)
- Platforms: Node.js 18+

## Acceptance Criteria
- [x] All JSON config files inventoried with coverage status documented
- [x] components.json has type alignment tests matching templates/stacks/brands pattern
- [x] Feature test mocks (ComponentRegistryManager.testUtils.ts) verified against actual JSON
- [x] Mock derivation guidelines documented for future contributors

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Incomplete config file inventory | Low | Medium | Glob all templates/*.json systematically |
| Feature mocks missed in audit | Medium | High | Grep for mock patterns across all test files |
| Type definitions out of sync with JSON | Low | High | Tests catch this by design (that's the point) |

## Dependencies
- **Existing files to extend**: tests/templates/type-json-alignment.test.ts
- **Existing mocks to verify**: tests/features/components/services/ComponentRegistryManager.testUtils.ts
- **Type definitions**: src/types/ (RawComponentRegistry, Component, etc.)
- **No new packages required**

## File Reference Map
- **Extend**: `tests/templates/type-json-alignment.test.ts` - Add components.json tests
- **Create**: `tests/features/components/services/ComponentRegistryManager-mockValidation.test.ts` - Mock structure validation tests (Step 3)
- **Modify**: `tests/features/components/services/ComponentRegistryManager.testUtils.ts` - Update mockRawRegistryV3 for v3.0.0 completeness
- **Modify**: `tests/README.md` - Add mock derivation guidelines section (Step 4)
- **Reference**: `templates/components.json` - v3.0.0 structure (frontends, backends, mesh, etc.)

## Step Reference
- step-01.md: Inventory JSON Config Files and Their Test Coverage
- step-02.md: Extend type-json-alignment.test.ts for components.json
- step-03.md: Verify Feature Test Mock Alignment
- step-04.md: Document Mock Derivation Guidelines

## Next Actions
- Start with Step 1: Inventory existing JSON config files and their test coverage status
