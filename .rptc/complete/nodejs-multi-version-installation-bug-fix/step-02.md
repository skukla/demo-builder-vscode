# Step 2: Eliminate infrastructure version concept

**Purpose:** Remove the misleading infrastructure Node version concept since Adobe CLI adapts to component needs (doesn't dictate versions)

**Prerequisites:**
- [ ] Step 1 completed (installHandler fix for multi-version passing)
- [ ] All tests passing from Step 1

## Tests to Write First

- [ ] Test: PrerequisitesManager handles missing nodeVersions with empty array
  - **Given:** No nodeVersions provided in options
  - **When:** getInstallInstructions() called for Node.js
  - **Then:** Returns empty steps array (no fallback version)
  - **File:** `tests/features/prerequisites/services/PrerequisitesManager.test.ts`

- [ ] Test: PrerequisitesManager doesn't reference infrastructure concept
  - **Given:** PrerequisitesManager instantiated
  - **When:** Checking instance properties
  - **Then:** No infrastructureNodeVersion field exists
  - **File:** `tests/features/prerequisites/services/PrerequisitesManager.test.ts`

- [ ] Test: Components.json no longer contains infrastructure node version
  - **Given:** components.json loaded
  - **When:** Checking infrastructure section
  - **Then:** No nodeVersion field present
  - **File:** `tests/features/prerequisites/services/PrerequisitesManager.test.ts`

## Files to Create/Modify

- [ ] `src/features/prerequisites/services/PrerequisitesManager.ts` - Remove field, method, update fallback
- [ ] `templates/components.json` - Remove nodeVersion from infrastructure section
- [ ] `tests/features/prerequisites/services/PrerequisitesManager.test.ts` - Update mocks and add new tests

## Implementation Details

### RED Phase (Write failing tests first)

```typescript
// Add to PrerequisitesManager.test.ts

describe('infrastructure version removal', () => {
  it('should use empty array when no nodeVersions provided', async () => {
    const instructions = await manager.getInstallInstructions(
      mockNodePrereq,
      {}
    );
    expect(instructions.steps).toHaveLength(0);
  });

  it('should not have infrastructureNodeVersion field', () => {
    expect(manager).not.toHaveProperty('infrastructureNodeVersion');
  });
});
```

### GREEN Phase (Minimal implementation to pass tests)

1. Remove `infrastructureNodeVersion` field (line 38)
2. Remove `loadInfrastructureNodeVersion()` method (lines 53-63)
3. Remove initialization call in constructor (line 46)
4. Update line 344 to: `const versions = options?.nodeVersions || [];`
5. Remove `"nodeVersion": "18"` from templates/components.json (line 8)

### REFACTOR Phase (Improve while keeping tests green)

1. Clean up any comments referencing infrastructure version
2. Update fs mock in test file to remove infrastructure.nodeVersion
3. Ensure all tests still pass
4. Verify no console.log statements remain

## Expected Outcome

- PrerequisitesManager no longer has infrastructure version concept
- Empty array used when no specific versions provided
- Tests demonstrate Adobe CLI adapts to component needs
- All existing tests continue passing

## Acceptance Criteria

- [ ] All new tests passing (3 scenarios)
- [ ] No references to infrastructureNodeVersion in code
- [ ] components.json infrastructure section cleaned up
- [ ] Code coverage maintained at 80%+
- [ ] No regression in existing functionality

## Estimated Time: 1 hour