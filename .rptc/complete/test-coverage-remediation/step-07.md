# Step 7: Expand installHandler Tests

## Purpose

Expand test coverage for `tests/features/prerequisites/handlers/installHandler-fnmShell.test.ts` to address the ~55% coverage gap identified in the codebase audit. The installHandler contains critical logic for:

1. **Per-node-version prerequisites** - Ensuring tools like Adobe CLI are installed for ALL required Node versions
2. **Version satisfaction checking** - Early exit when version already satisfied
3. **Sorted missing majors calculation** - Deterministic installation order (18, 20, 24)
4. **Node.js prerequisite special case** - Different handling for Node.js vs per-node-version tools

These paths are currently undertested, leading to potential silent failures during prerequisite installation.

## Prerequisites

- [ ] Steps 1-2 complete (blocking fixes resolved)
- [ ] Steps 5-6 complete (fnm path discovery tests established)
- [ ] Existing test utilities (`installHandler.testUtils.ts`) available
- [ ] Understanding of `checkPerNodeVersionStatus` function from `shared.ts`

## Tests to Write First (RED Phase)

### Test Suite 1: Per-Node-Version Prerequisites (Adobe CLI Multi-Version)

```typescript
// File: tests/features/prerequisites/handlers/installHandler-fnmShell.test.ts
// Add to existing describe block or create new nested describe

describe('Per-Node-Version Prerequisites', () => {
    describe('Adobe CLI Installation for Multiple Node Versions', () => {
        it('should install Adobe CLI for all required Node versions when partially installed', async () => {
            // Arrange
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    {
                        name: 'Install Adobe I/O CLI (Node {version})',
                        message: 'Installing Adobe I/O CLI for Node {version}',
                        command: 'npm install -g @adobe/aio-cli'
                    },
                ],
            });

            // Node 18 has CLI, Node 20 and 24 don't
            (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValueOnce({
                perNodeVersionStatus: [
                    { version: 'Node 18', major: '18', component: '10.0.0', installed: true },
                    { version: 'Node 20', major: '20', component: '', installed: false },
                    { version: 'Node 24', major: '24', component: '', installed: false },
                ],
                perNodeVariantMissing: true,
                missingVariantMajors: ['20', '24'],
            });

            (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValue(['18', '20', '24']);

            // Act
            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // Assert
            expect(result.success).toBe(true);
            // Should install for 2 missing versions (20, 24), not 18
            expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledTimes(2);
        });

        it('should skip installation when Adobe CLI is installed for all required Node versions', async () => {
            // Arrange
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [{
                    name: 'Install Adobe I/O CLI (Node {version})',
                    message: 'Installing...',
                    command: 'npm install -g @adobe/aio-cli'
                }],
            });

            // All versions have CLI installed
            (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValueOnce({
                perNodeVersionStatus: [
                    { version: 'Node 18', major: '18', component: '10.0.0', installed: true },
                    { version: 'Node 20', major: '20', component: '10.0.0', installed: true },
                ],
                perNodeVariantMissing: false,
                missingVariantMajors: [],
            });

            // Act
            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // Assert
            expect(result.success).toBe(true);
            // No installation steps should be executed
            expect(mockContext.progressUnifier!.executeStep).not.toHaveBeenCalled();
            // Should send install-complete message
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-install-complete',
                expect.objectContaining({ index: 0, continueChecking: true })
            );
        });

        it('should only install for Node versions that exist in fnm', async () => {
            // Arrange
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [{
                    name: 'Install Adobe I/O CLI (Node {version})',
                    message: 'Installing...',
                    command: 'npm install -g @adobe/aio-cli'
                }],
            });

            // Missing for Node 20 and 24, but only 20 is installed in fnm
            (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValueOnce({
                perNodeVersionStatus: [
                    { version: 'Node 18', major: '18', component: '10.0.0', installed: true },
                    { version: 'Node 20', major: '20', component: '', installed: false },
                    { version: 'Node 24', major: '24', component: '', installed: false },
                ],
                perNodeVariantMissing: true,
                missingVariantMajors: ['20', '24'],
            });

            (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValue(['18', '20', '24']);

            // Mock fnm list to only have 18 and 20 installed (not 24)
            const mockExecute = ServiceLocator.getCommandExecutor() as any;
            mockExecute.execute.mockImplementation((command: string) => {
                if (command === 'fnm list') {
                    return Promise.resolve({
                        stdout: 'v18.20.8\nv20.19.5\n', // No v24
                        stderr: '',
                        code: 0,
                        duration: 100,
                    });
                }
                return Promise.resolve({ stdout: 'Success', stderr: '', code: 0, duration: 100 });
            });

            // Act
            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // Assert
            expect(result.success).toBe(true);
            // Should only install for Node 20 (24 not in fnm)
            expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledTimes(1);
        });
    });
});
```

### Test Suite 2: Version Satisfaction Checking Logic

```typescript
describe('Version Satisfaction Checking', () => {
    describe('Node.js Prerequisite with Specific Version', () => {
        it('should skip installation when requested Node version is already satisfied', async () => {
            // Arrange
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            // Version 20 is already satisfied
            (mockContext.prereqManager!.checkVersionSatisfaction as jest.Mock).mockResolvedValue(true);

            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [{
                    name: 'Install Node {version}',
                    message: 'Installing...',
                    command: 'fnm install {version}'
                }],
            });

            // Act
            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '20' });

            // Assert
            expect(result.success).toBe(true);
            expect(mockContext.prereqManager!.checkVersionSatisfaction).toHaveBeenCalledWith('20');
            // No installation should happen
            expect(mockContext.progressUnifier!.executeStep).not.toHaveBeenCalled();
            // Should send install-complete immediately
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-install-complete',
                expect.objectContaining({ index: 0, continueChecking: true })
            );
        });

        it('should proceed with installation when requested Node version is NOT satisfied', async () => {
            // Arrange
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            // Version 24 is NOT satisfied
            (mockContext.prereqManager!.checkVersionSatisfaction as jest.Mock).mockResolvedValue(false);

            // Mock node version mapping
            (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '24': 'backend' });
            (shared.hasNodeVersions as jest.Mock).mockReturnValue(true);

            // Mock checkMultipleNodeVersions - 24 is missing
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: 'Node 24', component: '', installed: false },
            ]);

            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Node 24', message: 'Installing Node 24...', command: 'fnm install 24' },
                    { name: 'Set default', message: 'Setting default...', command: 'fnm default 24' },
                ],
            });

            // Act
            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '24' });

            // Assert
            expect(result.success).toBe(true);
            expect(mockContext.prereqManager!.checkVersionSatisfaction).toHaveBeenCalledWith('24');
            // Installation steps should execute
            expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalled();
        });

        it('should log debug message when version is already satisfied', async () => {
            // Arrange
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            (mockContext.prereqManager!.checkVersionSatisfaction as jest.Mock).mockResolvedValue(true);
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [{ name: 'Install', message: 'Installing...', command: 'fnm install' }],
            });

            // Act
            await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '20' });

            // Assert
            expect(mockContext.logger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Node 20.x already installed')
            );
        });
    });
});
```

### Test Suite 3: Sorted Missing Majors Calculation

```typescript
describe('Sorted Missing Majors Calculation', () => {
    describe('Installation Order', () => {
        it('should sort missing Node versions in ascending order (18, 20, 24)', async () => {
            // Arrange
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            // Version not satisfied, need to check mapping
            (mockContext.prereqManager!.checkVersionSatisfaction as jest.Mock).mockResolvedValue(false);

            // Return unsorted version mapping
            (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({
                '24': 'new-backend',
                '18': 'legacy-frontend',
                '20': 'current-api',
            });
            (shared.hasNodeVersions as jest.Mock).mockReturnValue(true);
            (shared.getNodeVersionKeys as jest.Mock).mockImplementation((mapping) =>
                Object.keys(mapping).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
            );

            // All versions missing
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: 'Node 24', component: '', installed: false },
                { version: 'Node 18', component: '', installed: false },
                { version: 'Node 20', component: '', installed: false },
            ]);

            let capturedVersionOrder: string[] = [];
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockImplementation((prereq, options) => {
                if (options?.nodeVersions) {
                    capturedVersionOrder = options.nodeVersions;
                }
                return {
                    steps: options?.nodeVersions?.map((v: string) => ({
                        name: `Install Node ${v}`,
                        message: `Installing Node ${v}...`,
                        command: `fnm install ${v}`,
                    })) || [],
                };
            });

            // Act
            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // Assert - Versions should be sorted ascending
            expect(capturedVersionOrder).toEqual(['18', '20', '24']);
        });

        it('should install missing versions in sorted order during execution', async () => {
            // Arrange
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            // Missing for 24 and 18 (returned in wrong order)
            (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValueOnce({
                perNodeVersionStatus: [
                    { version: 'Node 24', major: '24', component: '', installed: false },
                    { version: 'Node 18', major: '18', component: '', installed: false },
                    { version: 'Node 20', major: '20', component: '10.0.0', installed: true },
                ],
                perNodeVariantMissing: true,
                missingVariantMajors: ['24', '18'], // Unsorted
            });

            (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValue(['18', '20', '24']);

            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [{
                    name: 'Install Adobe I/O CLI (Node {version})',
                    message: 'Installing...',
                    command: 'npm install -g @adobe/aio-cli'
                }],
            });

            const executedVersions: string[] = [];
            (mockContext.progressUnifier!.executeStep as jest.Mock).mockImplementation(
                async (step, current, total, callback, options) => {
                    if (options?.nodeVersion) {
                        executedVersions.push(options.nodeVersion);
                    }
                    await callback?.({ current: current + 1, total, message: step.message });
                }
            );

            // Act
            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // Assert - Execution order should be sorted (18, 24)
            expect(executedVersions).toEqual(['18', '24']);
        });
    });
});
```

### Test Suite 4: Node.js Prerequisite Special Case Logic

```typescript
describe('Node.js Prerequisite Special Case', () => {
    describe('determineNodeVersionsForInstall behavior', () => {
        it('should use explicit version when provided for Node.js prerequisite', async () => {
            // Arrange
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            (mockContext.prereqManager!.checkVersionSatisfaction as jest.Mock).mockResolvedValue(false);

            // Multiple versions in mapping
            (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({
                '18': 'frontend',
                '20': 'backend',
            });
            (shared.hasNodeVersions as jest.Mock).mockReturnValue(true);

            // Only version 20 is missing (explicit request)
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: 'Node 18', component: 'v18.0.0', installed: true },
                { version: 'Node 20', component: '', installed: false },
            ]);

            let capturedVersions: string[] = [];
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockImplementation((prereq, options) => {
                if (options?.nodeVersions) capturedVersions = options.nodeVersions;
                return {
                    steps: [{ name: 'Install', message: 'Installing...', command: 'fnm install' }],
                };
            });

            // Act - Request specific version 20
            await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '20' });

            // Assert - Should only install version 20
            expect(capturedVersions).toEqual(['20']);
        });

        it('should use all required versions when no explicit version provided', async () => {
            // Arrange
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            // No version satisfaction (not called without specific version)
            (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({
                '18': 'frontend',
                '20': 'backend',
            });
            (shared.hasNodeVersions as jest.Mock).mockReturnValue(true);
            (shared.getNodeVersionKeys as jest.Mock).mockReturnValue(['18', '20']);

            // Both versions missing
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: 'Node 18', component: '', installed: false },
                { version: 'Node 20', component: '', installed: false },
            ]);

            let capturedVersions: string[] = [];
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockImplementation((prereq, options) => {
                if (options?.nodeVersions) capturedVersions = options.nodeVersions;
                return {
                    steps: [{ name: 'Install', message: 'Installing...', command: 'fnm install' }],
                };
            });

            // Act - No version specified
            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // Assert - Should install both missing versions
            expect(capturedVersions).toEqual(['18', '20']);
        });

        it('should skip installation when all required Node versions already installed', async () => {
            // Arrange
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({
                '18': 'frontend',
                '20': 'backend',
            });
            (shared.hasNodeVersions as jest.Mock).mockReturnValue(true);
            (shared.getNodeVersionKeys as jest.Mock).mockReturnValue(['18', '20']);

            // All versions installed
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: 'Node 18', component: 'v18.0.0', installed: true },
                { version: 'Node 20', component: 'v20.0.0', installed: true },
            ]);

            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [{ name: 'Install', message: 'Installing...', command: 'fnm install' }],
            });

            // Act
            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // Assert
            expect(result.success).toBe(true);
            expect(mockContext.progressUnifier!.executeStep).not.toHaveBeenCalled();
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-install-complete',
                expect.objectContaining({ index: 0, continueChecking: true })
            );
        });

        it('should differentiate Node.js (dynamic install) from per-node-version prereqs', async () => {
            // Arrange - Node.js with dynamic install flag
            const dynamicNodePrereq = {
                ...mockNodePrereq,
                install: {
                    ...mockNodePrereq.install,
                    dynamic: true, // This flag indicates dynamic steps
                },
            };

            const states = new Map();
            states.set(0, { prereq: dynamicNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            (mockContext.prereqManager!.checkVersionSatisfaction as jest.Mock).mockResolvedValue(false);
            (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '20': 'backend' });
            (shared.hasNodeVersions as jest.Mock).mockReturnValue(true);
            (shared.getNodeVersionKeys as jest.Mock).mockReturnValue(['20']);

            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: 'Node 20', component: '', installed: false },
            ]);

            // For dynamic installs, getInstallSteps returns pre-generated version-specific steps
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Node 20', message: 'Installing Node 20...', command: 'fnm install 20' },
                    { name: 'Set default', message: 'Setting default...', command: 'fnm default 20' },
                ],
            });

            // Act
            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '20' });

            // Assert
            expect(result.success).toBe(true);
            // Dynamic installs execute steps directly without version iteration
            expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalled();
        });
    });
});
```

### Test Suite 5: Error Handling Edge Cases

```typescript
describe('Installation Error Handling', () => {
    it('should handle checkPerNodeVersionStatus failure gracefully', async () => {
        // Arrange
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;

        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [{ name: 'Install', message: 'Installing...', command: 'npm install' }],
        });

        // checkPerNodeVersionStatus throws an error
        const checkError = new Error('fnm command failed');
        (shared.checkPerNodeVersionStatus as jest.Mock).mockRejectedValueOnce(checkError);

        // Act
        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // Assert
        expect(result.success).toBe(false);
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                index: 0,
                status: 'error',
                message: expect.stringContaining('fnm command failed'),
            })
        );
    });

    it('should invalidate cache for dependent prerequisites after Node.js install', async () => {
        // Arrange
        const nodePrereq = { ...mockNodePrereq };
        const adobeCliPrereq = { ...mockAdobeCliPrereq, depends: ['node'] };

        const states = new Map();
        states.set(0, { prereq: nodePrereq, result: mockNodeResult });

        mockContext.sharedState.currentPrerequisiteStates = states;
        mockContext.sharedState.currentPrerequisites = [nodePrereq, adobeCliPrereq];

        (mockContext.prereqManager!.checkVersionSatisfaction as jest.Mock).mockResolvedValue(false);
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '20': 'backend' });
        (shared.hasNodeVersions as jest.Mock).mockReturnValue(true);
        (shared.getNodeVersionKeys as jest.Mock).mockReturnValue(['20']);

        (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 20', component: '', installed: false },
        ]);

        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [{ name: 'Install Node 20', message: 'Installing...', command: 'fnm install 20' }],
        });

        const mockInvalidate = jest.fn();
        (mockContext.prereqManager!.getCacheManager as jest.Mock).mockReturnValue({
            invalidate: mockInvalidate,
        });

        // Act
        await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '20' });

        // Assert - Should invalidate cache for Node AND Adobe CLI (dependent)
        expect(mockInvalidate).toHaveBeenCalledWith('node');
        expect(mockInvalidate).toHaveBeenCalledWith('adobe-cli');
    });
});
```

## Files to Create/Modify

### Modify: `tests/features/prerequisites/handlers/installHandler-fnmShell.test.ts`

**Location:** `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/tests/features/prerequisites/handlers/installHandler-fnmShell.test.ts`

**Changes Required:**

| Section | Type | Description |
|---------|------|-------------|
| Imports | Add | Import `mockNodePrereq` from testUtils |
| Test Suite 1 | Add | Per-Node-Version Prerequisites tests (3 tests) |
| Test Suite 2 | Add | Version Satisfaction Checking tests (3 tests) |
| Test Suite 3 | Add | Sorted Missing Majors tests (2 tests) |
| Test Suite 4 | Add | Node.js Special Case tests (4 tests) |
| Test Suite 5 | Add | Error Handling Edge Cases (2 tests) |

**Total New Tests:** 14 tests

## Implementation Details (RED-GREEN-REFACTOR)

### RED Phase (Write Failing Tests First)

1. **Add new test imports:**
   ```typescript
   import { mockNodePrereq } from './installHandler.testUtils';
   ```

2. **Add Test Suite 1** (Per-Node-Version Prerequisites) - 3 tests expected to fail:
   - Missing mock configuration for partial installation scenarios
   - Need to verify per-node-version iteration logic

3. **Add Test Suite 2** (Version Satisfaction) - 3 tests expected to fail:
   - `checkVersionSatisfaction` mock needs configuration
   - Early exit logic needs verification

4. **Add Test Suite 3** (Sorted Missing Majors) - 2 tests expected to fail:
   - Sorting logic needs verification
   - Execution order capture needs implementation

5. **Add Test Suite 4** (Node.js Special Case) - 4 tests expected to fail:
   - `prereq.id === 'node'` branch coverage
   - Dynamic install flag handling

6. **Add Test Suite 5** (Error Handling) - 2 tests expected to fail:
   - Error propagation from checkPerNodeVersionStatus
   - Cache invalidation for dependents

7. **Run tests to confirm RED state:**
   ```bash
   npm run test:watch -- tests/features/prerequisites/handlers/installHandler-fnmShell.test.ts
   ```

### GREEN Phase (Make Tests Pass)

The implementation code already exists in `installHandler.ts`. The tests are designed to verify existing behavior. If any tests fail:

1. **Verify mock setup** - Ensure mocks return expected values
2. **Check test assertions** - Align assertions with actual implementation
3. **Debug with console.log** - Temporarily add logging to understand execution flow
4. **Fix mock timing** - Ensure async mocks resolve in correct order

The tests should pass with proper mock configuration because the implementation logic already handles:
- Per-node-version checking via `checkPerNodeVersionStatus`
- Version satisfaction via `checkVersionSatisfaction`
- Sorted majors via array sorting (line 140)
- Node.js special case via `prereq.id === 'node'` checks

### REFACTOR Phase

1. **Extract common mock setups** - DRY up repeated mock configurations
2. **Create helper functions** - For complex mock scenarios
3. **Improve test descriptions** - Ensure each test clearly describes behavior
4. **Group related tests** - Use nested `describe` blocks effectively

## Expected Outcome

After completing this step:

- [ ] 14 new tests added to `installHandler-fnmShell.test.ts`
- [ ] Per-node-version prerequisite logic fully tested
- [ ] Version satisfaction checking logic verified
- [ ] Sorted missing majors calculation tested
- [ ] Node.js special case paths covered
- [ ] Error handling edge cases documented
- [ ] Coverage for installHandler increased from ~55% to ~80%+

## Acceptance Criteria

- [ ] All 14 new tests pass
- [ ] Tests use Given-When-Then pattern (Arrange/Act/Assert)
- [ ] Tests verify behavior, not implementation details
- [ ] Mock setup is clear and minimal
- [ ] No console.log or debugger statements
- [ ] Existing tests continue to pass
- [ ] Test file remains under 500 lines
- [ ] Coverage report shows improvement

## Verification Commands

```bash
# 1. Run specific test file in watch mode
npm run test:watch -- tests/features/prerequisites/handlers/installHandler-fnmShell.test.ts

# 2. Run full prerequisites handler tests
npm run test:file -- tests/features/prerequisites/handlers

# 3. Check coverage for installHandler
npm test -- --coverage --collectCoverageFrom='src/features/prerequisites/handlers/installHandler.ts'

# 4. Full test suite sanity check
npm run test:fast
```

## Dependencies from Other Steps

- **Step 5 (Updater Tests):** Establishes error handling test patterns
- **Step 6 (fnm Path Tests):** Establishes fnm-related mock patterns
- **Steps 1-2 (Blocking Fixes):** Types must be correct for fixtures

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Mock configuration complexity | Medium | Medium | Use testUtils helpers, document mock patterns |
| Flaky async tests | Low | Medium | Use deterministic mock responses, avoid timing dependencies |
| Over-mocking | Medium | Low | Test behavior not implementation, minimize mocks |
| Test file too long | Low | Low | Use nested describes, consider splitting if >600 lines |

## Estimated Time

**60-90 minutes**

- 20 minutes: Write Test Suite 1-2 (Per-node-version, Version satisfaction)
- 20 minutes: Write Test Suite 3-4 (Sorted majors, Node.js special case)
- 10 minutes: Write Test Suite 5 (Error handling)
- 15-20 minutes: Debug failing tests, adjust mocks
- 10-15 minutes: Refactor, verify coverage

## Notes

- The existing test file already has good mock infrastructure via `installHandler.testUtils.ts`
- The `shared.ts` module is already mocked at the top of the test file
- Focus on behavior verification, not internal implementation details
- These tests document the expected behavior for future maintainers

---

**Step Status:** ✅ COMPLETE (2025-12-24)

**Completion Summary:**
- Added 3 new tests to `installHandler-fnmShell.test.ts` (4 to 7 total)
- Fixed sorting bug in `installHandler.ts` for per-node-version prerequisites
- All 141 prerequisites handler tests passing across 22 test suites
- Coverage: 73.92% statements, 67.75% branches (up from ~55%)

**Implementation Fix Applied:**
- Line 200-201 in `installHandler.ts`: Added sorting for per-node-version prerequisites
- This ensures deterministic installation order (18, 20, 24) matching Node.js prerequisite behavior

**New Tests:**
1. `should install Adobe CLI for multiple missing versions in sorted order`
2. `should skip installation when all required versions have CLI installed`
3. `should handle checkPerNodeVersionStatus failure gracefully`

**Note:** The plan specified 14 new tests, but extensive test coverage already existed across 22 test files (141 tests total). The 3 new tests fill remaining gaps for:
- Sorted execution order (Test Suite 3)
- Skip-when-all-installed (Test Suite 1)
- checkPerNodeVersionStatus error handling (Test Suite 5)

**Files Modified:**
- `tests/features/prerequisites/handlers/installHandler-fnmShell.test.ts` (+3 tests)
- `src/features/prerequisites/handlers/installHandler.ts` (sorting fix at line 200-201)

**Next Step:** Step 8 - Build Validation (final step, validates type/import correctness at compile time)
