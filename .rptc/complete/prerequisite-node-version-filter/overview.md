# Plan: Prerequisite Node Version Filter

## Status Tracking

- [x] Planned
- [x] In Progress
- [x] Reviews Complete
- [x] Complete

## Executive Summary

**Feature**: Fix plugin Node version display to show only versions that actually need the plugin

**Purpose**: Eliminate user confusion when prerequisites UI shows "API Mesh Plugin (Node 20, Node 24)" but only Node 20 components actually require the mesh plugin

**Approach**: Extract existing filtering logic from installHandler.ts (lines 298-351) to shared.ts, then reuse in checkHandler.ts for accurate display

**Complexity**: Simple (2 steps)

**Key Risks**: Potential regression in installHandler if extraction changes behavior

## Step Breakdown

1. **Step 1: Extract getPluginNodeVersions to shared.ts** - Extract the requiredFor filtering logic from installHandler into a reusable function with comprehensive tests
2. **Step 2: Update checkHandler to use filtered versions** - Replace raw nodeVersionMapping usage with filtered versions for accurate plugin display

## Test Strategy

**Framework**: Jest with ts-jest

**Coverage Goals**: 80%+ for new code

**Test Scenarios Summary** (details in step files):

- **Unit tests for getPluginNodeVersions()**:
  - Returns correct Node versions when plugin has requiredFor components
  - Returns empty array when no components match requiredFor
  - Handles dependencies array (commerce-mesh, adobe-commerce-paas)
  - Handles edge cases (empty requiredFor, missing dependencies)

- **Integration tests for checkHandler display**:
  - Plugin shows only filtered Node versions in UI message
  - Backward compatibility with existing prerequisite display

## Acceptance Criteria

- [x] Plugin display shows only Node versions that actually need the plugin
- [x] "API Mesh Plugin (Node 20, Node 24)" becomes "API Mesh Plugin (Node 20)" for EDS+PaaS config
- [x] installHandler continues to work correctly (no regression)
- [x] All existing tests pass (6051 tests)
- [x] New shared function has 80%+ test coverage (100% coverage)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking installHandler | Low | High | Extract without modifying behavior, add tests first |
| Edge cases in dependency resolution | Low | Medium | Comprehensive test coverage for dependencies array |

## Dependencies

**New Packages**: None

**Configuration Changes**: None

**External Services**: None

## File Reference Map

**Existing Files to Modify**:

- `src/features/prerequisites/handlers/shared.ts` - Add getPluginNodeVersions function
- `src/features/prerequisites/handlers/checkHandler.ts` - Use new function for plugin display
- `src/features/prerequisites/handlers/installHandler.ts` - Refactor to use shared function

**New Files to Create**:

- `tests/features/prerequisites/handlers/shared-getPluginNodeVersions.test.ts` - Tests for new function (Step 1)

**Existing Test Files to Modify**:

- `tests/features/prerequisites/handlers/checkHandler-operations.test.ts` - Add per-node-version filtering tests (Step 2)

## Implementation Constraints

- **File Size**: shared.ts should remain under 600 lines after addition
- **Complexity**: New function should be under 50 lines
- **Dependencies**: Use existing NodeVersionMapping type from shared.ts
- **Pattern Reuse**: Follow existing shared.ts function patterns (pure functions, clear JSDoc)

## Configuration

**Efficiency Review**: enabled

**Security Review**: disabled (no security implications for utility extraction)

## Next Actions

Run TDD: `/rptc:tdd "@prerequisite-node-version-filter/"`
