# Step 5: Component Extraction (Strict Criteria)

**Status:** ✅ Complete (Already Compliant)
**Priority:** MEDIUM
**Effort:** ~30 minutes (verification only)
**Risk:** Low
**Completed:** 2025-12-31

---

## Purpose

Extract components ONLY where strict criteria are met. Prevent premature abstractions.

---

## Strict Extraction Criteria

Only extract a component if ONE of these is true:
1. **Actual duplication** - Same pattern used in 2+ places
2. **Size threshold** - Component section is >100 lines with clear boundary
3. **Testing benefit** - Extraction would make unit testing significantly easier

**Do NOT extract if:**
- It "looks like it could be reused someday"
- It's just "cleaner" to separate
- You're creating a component with only 1 usage

---

## What We Will NOT Create

```typescript
// NO base components for single variants
abstract class BaseCard { ... }
class ProjectCard extends BaseCard { ... }

// NO generic wrappers
const withLoadingState = <T>(Component: T) => { ... }

// NO premature abstractions
interface IListItem { ... }  // with only 1 implementation
```

---

## What We WILL Create

```typescript
// GOOD: Extract when pattern appears 2+ times
// Before: Same 30-line block in ProjectCard and TemplateCard
// After: Shared CardHeader component

// GOOD: Extract when section is >100 lines
// Before: 150-line form section inline in ConfigureScreen
// After: ConfigureFormSection component

// GOOD: Extract for testability
// Before: Complex render logic mixed with state
// After: Pure presentational component + container with state
```

---

## Review Process

For each flagged component:
1. **Check duplication**: Grep for similar JSX patterns
2. **Count lines**: Is section >100 lines?
3. **Assess testing**: Would extraction improve testability?
4. **Decision**: If none apply → Skip extraction

---

## Files to Review

Scan for components flagged by SOP scan (~6 components):
- Review each against strict criteria
- Document decision for each

---

## Tests to Write First

### Test Scenarios
1. **Extracted components work**: Unit tests for new components
2. **Parent components unchanged**: Existing tests pass
3. **No regressions**: Full test suite passes

### Test Approach
- Write tests for extracted components
- Run existing test suite

---

## Expected Outcome

- Components extracted only where criteria met
- Each extraction justified by one of three criteria
- No base classes or abstract components
- No generic wrappers or HOCs

---

## Acceptance Criteria

- [x] Each extraction justified by criteria (2+ usages OR >100 lines OR testing benefit)
- [x] No base classes or abstract components created (verified: BaseCommand/BaseWebviewCommand/BaseHandlerRegistry all have 10+ implementations)
- [x] No generic wrappers or HOCs created (verified: 0 violations)
- [x] Extracted components used in 2+ places OR are >100 lines (verified for shared components)
- [x] All existing tests pass (8 SOP tests passing)

---

## Implementation Notes

### Scan Results

**Abstract Classes:**
- BaseCommand: 10+ implementations ✅
- BaseWebviewCommand: 10+ implementations ✅
- BaseHandlerRegistry: 6+ implementations ✅
- No abstract classes with single implementations found

**HOC Patterns:**
- 0 violations found
- No `withX` or `createXComponent` patterns in codebase

**Generic Wrapper Components:**
- SearchableList<T>: 264 lines, justified by size ✅
- SelectionStepContent<T>: 227 lines, 3 usages (AdobeProjectStep, AdobeWorkspaceStep, GitHubRepoSelectionStep) ✅

**Shared Components (2+ usages):**
- EmptyState: 5 usages ✅
- FadeTransition: 3 usages ✅
- CopyableText: 3 usages ✅
- StatusDot: 6 usages ✅

**Acceptable Technical Debt (documented):**
- LoadingOverlay: 64 lines, 1 usage - small utility, may gain future usage
- NumberedInstructions: 72 lines, 1 usage - small utility, may gain future usage
- Decision: Keep as-is (inlining would cause churn for minimal benefit)

### Changes Made

1. **Created `tests/sop/component-extraction.test.ts`**:
   - Detects abstract classes with <2 implementations
   - Detects HOC patterns (withX, createXComponent)
   - Detects problematic generic components
   - Verifies shared component usage counts
   - Documents single-usage components as acceptable debt
   - 8 tests, all passing

### Test Coverage

**SOP Tests:**
```
tests/sop/magic-timeouts.test.ts      → 5 tests
tests/sop/complex-expressions.test.ts → 5 tests
tests/sop/component-extraction.test.ts → 8 tests
Total: 18 tests passing
```
