# Step 2: Fix Inconsistent Detection Logic (The Real Bug)

## Purpose

Fix the root cause where initial prerequisite check and per-node check use different detection methods, causing UI to show "error" when CLI is actually installed.

## Root Cause (Actual Bug)

**Initial Check** (`PrerequisitesManager.checkPrerequisite`):
- Uses `executeAdobeCLI()` → runs `aio --version` directly
- Fails with ENOENT because `aio` not in global PATH
- Marks as "not installed" ❌
- Result: UI shows RED error

**Per-Node Check** (`checkPerNodeVersionStatus`):
- Uses `fnm exec --using=20 aio --version`
- Succeeds because fnm provides Node environment
- Discovers CLI IS installed ✅
- Result: Install handler skips installation

**User Experience:**
1. Prerequisites step shows Adobe CLI with red error
2. User clicks "Install"
3. Loading spinner appears
4. Message: "Already installed (Node 20: 11.0.0, Node 24: 10.3.3)"
5. User confused: "Why did it show error if it's installed?"

## Solution

Make initial check use same fnm-aware logic as per-node check for `perNodeVersion` prerequisites.

## Tests to Write First

### Test 1: Initial Check Detects Installed Per-Node Prerequisite

**File**: `tests/features/prerequisites/services/PrerequisitesManager.test.ts`

```typescript
describe('checkPrerequisite - per-node version prerequisites', () => {
  it('should detect Adobe CLI as installed when using fnm-aware check', async () => {
    // GIVEN: Adobe CLI is installed for Node 20 and 24 (via fnm)
    // Mock fnm exec to succeed
    mockCommandExecutor.execute.mockResolvedValueOnce({
      success: true,
      stdout: '@adobe/aio-cli/11.0.0 darwin-arm64 node-v20.19.5\n',
      stderr: '',
      code: 0,
    });
    mockCommandExecutor.execute.mockResolvedValueOnce({
      success: true,
      stdout: '@adobe/aio-cli/10.3.3 darwin-arm64 node-v24.11.1\n',
      stderr: '',
      code: 0,
    });

    // Mock component registry to return Node requirements
    jest.spyOn(ComponentRegistry, 'getNodeVersions').mockReturnValue(['20', '24']);

    // WHEN: Initial prerequisite check runs
    const result = await prerequisitesManager.checkPrerequisite(adobeCliPrereq);

    // THEN: Should detect as installed (not ENOENT error)
    expect(result.installed).toBe(true);
    expect(result.message).toContain('Already installed');
  });

  it('should use checkPerNodeVersionStatus for perNodeVersion prerequisites', async () => {
    // GIVEN: Prerequisite has perNodeVersion: true
    const perNodePrereq = {
      ...adobeCliPrereq,
      perNodeVersion: true,
    };

    // WHEN: checkPrerequisite is called
    await prerequisitesManager.checkPrerequisite(perNodePrereq);

    // THEN: Should call checkPerNodeVersionStatus (not executeAdobeCLI)
    expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
      expect.stringContaining('fnm exec --using='),
      expect.any(Object)
    );
  });
});
```

### Test 2: Non-Per-Node Prerequisites Use Original Logic

```typescript
it('should use original check logic for non-perNodeVersion prerequisites', async () => {
  // GIVEN: Prerequisite without perNodeVersion flag
  const regularPrereq = {
    ...gitPrereq,
    perNodeVersion: false,
  };

  // WHEN: checkPrerequisite is called
  await prerequisitesManager.checkPrerequisite(regularPrereq);

  // THEN: Should use original direct command (not fnm exec)
  expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
    'git --version',
    expect.not.objectContaining({ useNodeVersion: expect.anything() })
  );
});
```

## Files to Modify

### Implementation

**`src/features/prerequisites/services/PrerequisitesManager.ts`**

Modify `checkPrerequisite()` method to:
1. Detect if prerequisite has `perNodeVersion: true`
2. If yes, use `checkPerNodeVersionStatus()` from shared handlers
3. If no, use existing logic
4. Return consolidated result

### Tests

**`tests/features/prerequisites/services/PrerequisitesManager.test.ts`**
- Add tests for per-node detection inconsistency
- Verify fnm-aware check used for perNodeVersion prerequisites
- Verify original logic preserved for regular prerequisites

## Implementation Details

```typescript
// In PrerequisitesManager.checkPrerequisite()

async checkPrerequisite(prereq: Prerequisite): Promise<PrerequisiteCheckResult> {
    // NEW: For per-node version prerequisites, use fnm-aware check
    if (prereq.perNodeVersion) {
        const nodeVersions = await getRequiredNodeVersions(context);
        if (nodeVersions.length > 0) {
            const perNodeStatus = await checkPerNodeVersionStatus(prereq, nodeVersions, context);

            // Consolidate per-node results into single check result
            const allInstalled = perNodeStatus.perNodeVersionStatus.every(s => s.installed);
            const versionDetails = perNodeStatus.perNodeVersionStatus
                .filter(s => s.installed)
                .map(s => `${s.version}: ${s.component}`)
                .join(', ');

            return {
                installed: allInstalled,
                version: versionDetails,
                message: allInstalled
                    ? `Installed (${versionDetails})`
                    : `Missing for some Node versions`,
                nodeVersionStatus: perNodeStatus.perNodeVersionStatus,
            };
        }
    }

    // EXISTING: Original logic for non-perNodeVersion prerequisites
    // ... existing code ...
}
```

## Expected Outcome

After this step:
- [x] Initial check uses same logic as per-node check
- [x] UI shows accurate status from the start
- [x] No more "error → actually installed" confusion
- [x] All existing tests pass
- [x] New regression tests prevent recurrence

## Acceptance Criteria

- [ ] Test 1: Initial check detects installed per-node prerequisite
- [ ] Test 2: Per-node prerequisites use checkPerNodeVersionStatus
- [ ] Test 3: Regular prerequisites use original logic (no regression)
- [ ] All existing tests pass (zero regressions)
- [ ] Manual verification: Adobe CLI shows green check on initial load
- [ ] Coverage ≥ 85% for modified code

## Edge Cases

1. **No Node versions configured**: Fall back to original check
2. **Partially installed**: Some Node versions have CLI, others don't
3. **Cache interaction**: Ensure cache uses consistent detection method
4. **Performance**: Per-node check is slower (acceptable tradeoff for accuracy)

## Estimated Time

1 hour
- 30 min: Write tests (RED)
- 20 min: Implement fix (GREEN)
- 10 min: Refactor and verify (REFACTOR)
