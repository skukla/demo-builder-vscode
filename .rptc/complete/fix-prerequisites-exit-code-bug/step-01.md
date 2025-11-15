# Step 1: Add test for non-zero exit code handling in shared utility

## Purpose

Establish RED phase by adding failing test that verifies correct exit code checking

## Prerequisites

- [ ] Existing test file loaded
- [ ] Test framework configured

## Tests to Write First

### Test 1: Detect tool as NOT installed when exit code is non-zero

- **Given:** Mock `commandManager.execute()` returns `{ code: 127, stdout: '', stderr: 'command not found' }`
- **When:** `checkPerNodeVersionStatus()` executes for Node 18
- **Then:** Returns `installed: false` for Node 18
- **File:** `tests/features/prerequisites/handlers/shared-per-node-status.test.ts`

### Test 2: Detect tool as installed when exit code is 0

- **Given:** Mock `commandManager.execute()` returns `{ code: 0, stdout: '@adobe/aio-cli/10.0.0', stderr: '' }`
- **When:** `checkPerNodeVersionStatus()` executes for Node 18
- **Then:** Returns `installed: true` for Node 18 with parsed version
- **File:** `tests/features/prerequisites/handlers/shared-per-node-status.test.ts`

## Files to Create/Modify

- [ ] `tests/features/prerequisites/handlers/shared-per-node-status.test.ts` - Add two new test cases

## Implementation Details

**RED Phase** (Write failing tests first):

```typescript
describe('Prerequisites Handlers - checkPerNodeVersionStatus', () => {
    // ... existing tests ...

    it('should detect tool as NOT installed when command exits with non-zero code', async () => {
        const prereq: PrerequisiteDefinition = {
            id: 'adobe-cli',
            name: 'Adobe I/O CLI',
            perNodeVersion: true,
            check: { command: 'aio --version' },
        } as PrerequisiteDefinition;

        mockCommandExecutor.execute.mockImplementation((cmd: string) => {
            if (cmd === 'fnm list') {
                return Promise.resolve(createCommandResult('v18.0.0'));
            }
            // Simulate command failure with non-zero exit code
            return Promise.resolve(createCommandResult('', 'command not found: aio', 127));
        });

        const context = createMockContext();
        const result = await checkPerNodeVersionStatus(prereq, ['18'], context);

        expect(result.perNodeVersionStatus[0].installed).toBe(false);
        expect(result.perNodeVariantMissing).toBe(true);
        expect(result.missingVariantMajors).toEqual(['18']);
    });

    it('should detect tool as installed when command exits with code 0', async () => {
        const prereq: PrerequisiteDefinition = {
            id: 'adobe-cli',
            name: 'Adobe I/O CLI',
            perNodeVersion: true,
            check: {
                command: 'aio --version',
                parseVersion: '@adobe/aio-cli/(\\S+)',
            },
        } as PrerequisiteDefinition;

        mockCommandExecutor.execute.mockImplementation((cmd: string) => {
            if (cmd === 'fnm list') {
                return Promise.resolve(createCommandResult('v18.0.0'));
            }
            // Simulate successful command with exit code 0
            return Promise.resolve(createCommandResult('@adobe/aio-cli/10.0.0', '', 0));
        });

        const context = createMockContext();
        const result = await checkPerNodeVersionStatus(prereq, ['18'], context);

        expect(result.perNodeVersionStatus[0].installed).toBe(true);
        expect(result.perNodeVersionStatus[0].component).toBe('10.0.0');
        expect(result.perNodeVariantMissing).toBe(false);
    });
});
```

**GREEN Phase** (Minimal implementation to pass tests):

Implementation happens in Step 2 (fix the bug).

## Expected Outcome

- New tests written and FAILING (RED phase complete)
- Tests verify correct behavior: check `result.code` not try-catch
- Coverage gap identified

## Acceptance Criteria

- [ ] Two new test cases added to shared-per-node-status.test.ts
- [ ] Tests fail with current implementation (RED phase)
- [ ] Test descriptions clearly document expected behavior
- [ ] No console.log or debugger statements

## Estimated Time

0.5 hours
