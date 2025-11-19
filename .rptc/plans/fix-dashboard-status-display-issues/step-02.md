# Step 2: Verify Fixes with Tests and Manual Validation

## Purpose

This step ensures both dashboard bugs are fixed through comprehensive automated testing and manual validation:
- Bug 1: StatusCard bundle rebuild verification (stacked layout fix)
- Bug 2: Mesh status timeout handling (shows "checking" instead of "not-deployed")

Verification prevents regressions and confirms the fixes work in real scenarios.

## Prerequisites

- [x] Step 1 completed (code changes implemented in stalenessDetector.ts and dashboardHandlers.ts)
- [ ] Test environment set up (Jest, @testing-library/react)
- [ ] VS Code extension development host available for manual testing

## Tests to Write First

### Unit Tests for Staleness Detector (Bug 2)

- [ ] Test: Timeout during mesh config fetch returns hasChanges: false
  - **Given:** fetchDeployedMeshConfig() throws timeout error
  - **When:** detectMeshChanges() is called
  - **Then:** Returns { hasChanges: false, unknownDeployedState: true }
  - **File:** `tests/unit/features/mesh/services/stalenessDetector.test.ts`

- [ ] Test: Network error during mesh config fetch returns hasChanges: false
  - **Given:** fetchDeployedMeshConfig() throws network error
  - **When:** detectMeshChanges() is called
  - **Then:** Returns { hasChanges: false, unknownDeployedState: true }
  - **File:** `tests/unit/features/mesh/services/stalenessDetector.test.ts`

- [ ] Test: Successful fetch with no changes returns hasChanges: false
  - **Given:** fetchDeployedMeshConfig() returns config matching local
  - **When:** detectMeshChanges() is called
  - **Then:** Returns { hasChanges: false, shouldSaveProject: true }
  - **File:** `tests/unit/features/mesh/services/stalenessDetector.test.ts`

### Unit Tests for Dashboard Handlers (Bug 2)

- [ ] Test: Unknown deployed state shows "checking" status
  - **Given:** getMeshStatus() called with unknownDeployedState: true
  - **When:** Status is determined
  - **Then:** Returns status "checking" with appropriate message
  - **File:** `tests/unit/features/dashboard/handlers/dashboardHandlers.test.ts`

- [ ] Test: Known deployed state with changes shows "changes-pending"
  - **Given:** getMeshStatus() called with unknownDeployedState: false, hasChanges: true
  - **When:** Status is determined
  - **Then:** Returns status "changes-pending"
  - **File:** `tests/unit/features/dashboard/handlers/dashboardHandlers.test.ts`

- [ ] Test: Known deployed state without changes shows "deployed"
  - **Given:** getMeshStatus() called with unknownDeployedState: false, hasChanges: false
  - **When:** Status is determined
  - **Then:** Returns status "deployed"
  - **File:** `tests/unit/features/dashboard/handlers/dashboardHandlers.test.ts`

### Integration Test for StatusCard Bundle (Bug 1)

- [ ] Test: StatusCard renders with horizontal layout (not stacked)
  - **Given:** StatusCard component imported in dashboard
  - **When:** Component is rendered with test props
  - **Then:** Layout is horizontal (flex-row), not vertical (flex-col)
  - **File:** `tests/integration/core/ui/components/feedback/StatusCard.test.tsx`

## Files to Create/Modify

### Test Files to Create

- [ ] `tests/unit/features/mesh/services/stalenessDetector.test.ts` - Unit tests for mesh staleness detection timeout handling
- [ ] `tests/unit/features/dashboard/handlers/dashboardHandlers.test.ts` - Unit tests for mesh status determination logic
- [ ] `tests/integration/core/ui/components/feedback/StatusCard.test.tsx` - Integration test for StatusCard layout verification

### Manual Validation Checklist

- [ ] Manual test: Verify StatusCard layout in running extension
- [ ] Manual test: Verify mesh status displays "checking" during timeout
- [ ] Manual test: Verify no regressions in other dashboard features

## Implementation Details

### RED Phase (Write Failing Tests)

**1. Create Staleness Detector Tests**

```typescript
// tests/unit/features/mesh/services/stalenessDetector.test.ts
import { detectMeshChanges } from '../../../../../src/features/mesh/services/stalenessDetector';
import * as meshConfigFetcher from '../../../../../src/features/mesh/services/meshConfigFetcher';

jest.mock('../../../../../src/features/mesh/services/meshConfigFetcher');

describe('detectMeshChanges - Timeout Handling', () => {
  const mockProject = {
    name: 'test-project',
    path: '/test/project',
    meshState: { envVars: {}, sourceHash: null, lastDeployed: '' }
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns hasChanges: false when fetch times out', async () => {
    const timeoutError = new Error('Request timeout');
    (meshConfigFetcher.fetchDeployedMeshConfig as jest.Mock).mockRejectedValue(timeoutError);

    const result = await detectMeshChanges(mockProject, {});

    expect(result.hasChanges).toBe(false);
    expect(result.unknownDeployedState).toBe(true);
  });

  it('returns hasChanges: false on network error', async () => {
    const networkError = new Error('Network error');
    (meshConfigFetcher.fetchDeployedMeshConfig as jest.Mock).mockRejectedValue(networkError);

    const result = await detectMeshChanges(mockProject, {});

    expect(result.hasChanges).toBe(false);
    expect(result.unknownDeployedState).toBe(true);
  });

  it('returns hasChanges: false when configs match', async () => {
    const deployedConfig = { ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql' };
    (meshConfigFetcher.fetchDeployedMeshConfig as jest.Mock).mockResolvedValue(deployedConfig);

    const result = await detectMeshChanges(mockProject, {});

    expect(result.hasChanges).toBe(false);
    expect(result.shouldSaveProject).toBe(true);
  });
});
```

**2. Create Dashboard Handlers Tests**

```typescript
// tests/unit/features/dashboard/handlers/dashboardHandlers.test.ts
import { getMeshStatus } from '../../../../../src/features/dashboard/handlers/dashboardHandlers';

describe('getMeshStatus - Status Display', () => {
  it('returns "checking" status when deployed state is unknown', () => {
    const result = getMeshStatus({
      unknownDeployedState: true,
      hasChanges: false,
      meshExists: true
    });

    expect(result.status).toBe('checking');
    expect(result.message).toContain('Checking mesh status');
  });

  it('returns "changes-pending" when deployed state is known with changes', () => {
    const result = getMeshStatus({
      unknownDeployedState: false,
      hasChanges: true,
      meshExists: true
    });

    expect(result.status).toBe('changes-pending');
  });

  it('returns "deployed" when deployed state is known without changes', () => {
    const result = getMeshStatus({
      unknownDeployedState: false,
      hasChanges: false,
      meshExists: true
    });

    expect(result.status).toBe('deployed');
  });
});
```

**3. Create StatusCard Integration Test**

```typescript
// tests/integration/core/ui/components/feedback/StatusCard.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { StatusCard } from '../../../../../src/core/ui/components/feedback/StatusCard';

describe('StatusCard Layout', () => {
  it('renders with horizontal layout (not stacked)', () => {
    const { container } = render(
      <StatusCard
        title="Test Status"
        status="success"
        message="Test message"
      />
    );

    const cardElement = container.firstChild as HTMLElement;
    const computedStyle = window.getComputedStyle(cardElement);

    // Verify flex-row layout (horizontal)
    expect(computedStyle.flexDirection).toBe('row');
    expect(computedStyle.flexDirection).not.toBe('column');
  });
});
```

### GREEN Phase (Verify Tests Pass)

**1. Run Unit Tests**
```bash
npm test -- tests/unit/features/mesh/services/stalenessDetector.test.ts
npm test -- tests/unit/features/dashboard/handlers/dashboardHandlers.test.ts
```

**2. Run Integration Test**
```bash
npm test -- tests/integration/core/ui/components/feedback/StatusCard.test.tsx
```

**3. Verify All Tests Pass**
- All 7 tests should pass with Step 1 code changes
- stalenessDetector now returns hasChanges: false on timeout/error
- dashboardHandlers now uses "checking" status for unknown deployed state
- StatusCard bundle rebuilt with correct layout

### REFACTOR Phase (None Required)

No refactoring needed for verification step. If tests fail:
1. Review Step 1 implementation
2. Check test mocks match actual behavior
3. Verify Webpack bundle rebuild completed

### Manual Validation Steps

**1. Verify StatusCard Layout (Bug 1)**
```bash
# 1. Start extension development host (F5 in VS Code)
# 2. Open Dashboard command
# 3. Observe StatusCard layout
# Expected: Horizontal layout (icon + text side-by-side)
# Failure case: Vertical stacked layout (icon above text)
```

**2. Verify Mesh Status Timeout Handling (Bug 2)**
```bash
# 1. Simulate network delay/timeout scenario
# 2. Open Dashboard command
# 3. Observe mesh status display
# Expected: Shows "Checking mesh status..." or similar
# Failure case: Shows "Not Deployed" incorrectly
```

**3. Regression Testing**
```bash
# Verify other dashboard features still work:
# - Start/Stop Demo buttons
# - Logs toggle functionality
# - Component browser
# - Configure button navigation
```

## Expected Outcome

After completing this step:

- **All Tests Passing**: 7 new tests (3 staleness detector + 3 dashboard handlers + 1 StatusCard integration)
- **Bug 1 Fixed**: StatusCard displays with correct horizontal layout
- **Bug 2 Fixed**: Mesh status shows "checking" during timeout (not "not-deployed")
- **No Regressions**: All existing dashboard functionality works correctly
- **Coverage Maintained**: Test coverage ≥ 80% for modified files

## Acceptance Criteria

- [ ] All 7 new tests passing
- [ ] Test coverage ≥ 90% for stalenessDetector.ts
- [ ] Test coverage ≥ 90% for dashboardHandlers.ts
- [ ] Test coverage ≥ 95% for StatusCard.tsx
- [ ] Manual validation confirms Bug 1 fixed (horizontal layout)
- [ ] Manual validation confirms Bug 2 fixed ("checking" status on timeout)
- [ ] No regressions in other dashboard features
- [ ] Code follows project style guide
- [ ] No console.log or debugger statements in test code

## Dependencies from Other Steps

**Depends On:**
- Step 1: Code changes must be implemented before tests can pass

**Enables:**
- Feature completion and release

## Risk Considerations

**Risk: Tests Pass but Bug Still Occurs in Production**
- Mitigation: Comprehensive manual validation required
- Manual testing covers scenarios not captured in unit tests
- Integration test verifies actual bundle rebuild

**Risk: StatusCard Bundle Not Rebuilt**
- Mitigation: Verify Webpack rebuild completed after Step 1
- Check dist/ directory for updated bundle timestamp
- Run `npm run build` if needed

**Risk: False Positive Tests**
- Mitigation: Test mocks accurately reflect production behavior
- Integration test uses actual component rendering
- Manual validation serves as final verification

## Estimated Time

**2-3 hours total:**
- Write tests: 1-1.5 hours
- Run tests and fix issues: 0.5-1 hour
- Manual validation: 0.5 hours
- Documentation: 0.5 hours

---

**Next Step After Completion**: Feature complete - ready for code review and merge to master branch.
