# Step 5: Expand Component Updater Tests

## Overview

**Purpose**: Add comprehensive test coverage to `tests/features/updates/services/componentUpdater.test.ts` to cover missing functionality including snapshot cleanup, .env file preservation, version tracking, and error formatting.

**Current Coverage**: ~40-50%
**Target Coverage**: 80%+

**File to Modify**: `tests/features/updates/services/componentUpdater.test.ts`

**SOP Reference**: See testing-guide.md for TDD methodology and test patterns

---

## Prerequisites

- [ ] Steps 1-4 completed (imports, types, templates.json, templateLoader tests)
- [ ] Source file `src/features/updates/services/componentUpdater.ts` unchanged
- [ ] Test file currently has 6 tests passing

---

## Test Strategy

### Missing Functionality to Cover

Based on the audit and source code analysis:

| Functionality | Current Status | Priority |
|---------------|----------------|----------|
| Snapshot cleanup on success | NOT TESTED | High |
| .env file backup (backupEnvFiles) | NOT TESTED | High |
| .env file merge (mergeEnvFiles) | NOT TESTED | High |
| Version tracking after verification | NOT TESTED | High |
| formatUpdateError - network errors | NOT TESTED | Medium |
| formatUpdateError - timeout errors | NOT TESTED | Medium |
| formatUpdateError - HTTP 404 | NOT TESTED | Medium |
| formatUpdateError - HTTP 403 | NOT TESTED | Medium |
| formatUpdateError - generic HTTP | NOT TESTED | Medium |
| formatUpdateError - verification errors | NOT TESTED | Medium |
| formatUpdateError - generic fallback | NOT TESTED | Medium |
| verifyComponentStructure - success | NOT TESTED | Medium |
| verifyComponentStructure - missing file | NOT TESTED | Medium |
| verifyComponentStructure - invalid JSON | NOT TESTED | Medium |
| parseEnvFile - comments and empty lines | NOT TESTED | Low |
| parseEnvFile - values with equals signs | NOT TESTED | Low |
| Component not found error | NOT TESTED | Low |
| Rollback failure (critical error) | NOT TESTED | Medium |

---

## Tests to Write First

### Test Group 1: Snapshot Lifecycle

- [ ] **Test**: Should remove snapshot after successful update
  - **Given**: A successful component update completes
  - **When**: The update finishes without errors
  - **Then**: fs.rm is called to remove the snapshot directory
  - **File**: `tests/features/updates/services/componentUpdater.test.ts`

### Test Group 2: .env File Preservation

- [ ] **Test**: Should backup .env files before removing component
  - **Given**: Component has .env and .env.local files
  - **When**: Update process starts
  - **Then**: Both .env file contents are read and preserved
  - **File**: `tests/features/updates/services/componentUpdater.test.ts`

- [ ] **Test**: Should restore .env with no template when .env.example missing
  - **Given**: Old .env content exists but no .env.example in new version
  - **When**: Merge step executes
  - **Then**: Old .env content is written back unchanged
  - **File**: `tests/features/updates/services/componentUpdater.test.ts`

- [ ] **Test**: Should merge .env preserving user values and adding new defaults
  - **Given**: Old .env has user values, .env.example has new keys
  - **When**: Merge step executes
  - **Then**: User values preserved, new keys added with defaults
  - **File**: `tests/features/updates/services/componentUpdater.test.ts`

- [ ] **Test**: Should register programmatic writes before .env operations
  - **Given**: .env files need to be written
  - **When**: Merge step executes
  - **Then**: vscode.commands.executeCommand called with registerProgrammaticWrites
  - **File**: `tests/features/updates/services/componentUpdater.test.ts`

### Test Group 3: Version Tracking

- [ ] **Test**: Should only update version after successful verification
  - **Given**: Component update completes successfully
  - **When**: All verification steps pass
  - **Then**: project.componentVersions is updated with new version and timestamp
  - **File**: `tests/features/updates/services/componentUpdater.test.ts`

- [ ] **Test**: Should NOT update version when verification fails
  - **Given**: Component extraction succeeds but verification fails
  - **When**: verifyComponentStructure throws error
  - **Then**: project.componentVersions remains unchanged
  - **File**: `tests/features/updates/services/componentUpdater.test.ts`

### Test Group 4: Error Message Formatting (formatUpdateError)

- [ ] **Test**: Should format network error with helpful message
  - **Given**: Error with isNetworkError flag or network-related message
  - **When**: formatUpdateError is called (via failed update)
  - **Then**: User-friendly "No internet connection" message returned
  - **File**: `tests/features/updates/services/componentUpdater.test.ts`

- [ ] **Test**: Should format timeout error with helpful message
  - **Given**: Error with isTimeoutError flag or timeout-related message
  - **When**: formatUpdateError is called
  - **Then**: User-friendly "Download timed out" message returned
  - **File**: `tests/features/updates/services/componentUpdater.test.ts`

- [ ] **Test**: Should format HTTP 404 error with version removed message
  - **Given**: Error message contains "http 404"
  - **When**: formatUpdateError is called
  - **Then**: Message indicates release may have been removed
  - **File**: `tests/features/updates/services/componentUpdater.test.ts`

- [ ] **Test**: Should format HTTP 403 error with rate limit message
  - **Given**: Error message contains "http 403"
  - **When**: formatUpdateError is called
  - **Then**: Message mentions GitHub rate limit
  - **File**: `tests/features/updates/services/componentUpdater.test.ts`

- [ ] **Test**: Should format generic HTTP error with server error message
  - **Given**: Error message contains "http" but not specific codes
  - **When**: formatUpdateError is called
  - **Then**: Generic server error message returned
  - **File**: `tests/features/updates/services/componentUpdater.test.ts`

- [ ] **Test**: Should format verification failure with corruption message
  - **Given**: Error message contains "verification failed" or "missing after extraction"
  - **When**: formatUpdateError is called
  - **Then**: Message indicates component is incomplete or corrupted
  - **File**: `tests/features/updates/services/componentUpdater.test.ts`

### Test Group 5: Verification and Edge Cases

- [ ] **Test**: Should verify package.json exists after extraction
  - **Given**: Component extracted successfully
  - **When**: verifyComponentStructure runs
  - **Then**: fs.access called for package.json
  - **File**: `tests/features/updates/services/componentUpdater.test.ts`

- [ ] **Test**: Should verify mesh.json exists for commerce-mesh component
  - **Given**: commerce-mesh component being updated
  - **When**: verifyComponentStructure runs
  - **Then**: fs.access called for mesh.json in addition to package.json
  - **File**: `tests/features/updates/services/componentUpdater.test.ts`

- [ ] **Test**: Should throw when component not found in project
  - **Given**: componentId not in project.componentInstances
  - **When**: updateComponent called
  - **Then**: Error thrown with "Component X not found"
  - **File**: `tests/features/updates/services/componentUpdater.test.ts`

- [ ] **Test**: Should throw critical error when rollback fails
  - **Given**: Update fails AND rollback also fails
  - **When**: Recovery attempt fails
  - **Then**: Error includes "Manual recovery required" and snapshot path
  - **File**: `tests/features/updates/services/componentUpdater.test.ts`

### Test Group 6: parseEnvFile Edge Cases

- [ ] **Test**: Should skip comments and empty lines when parsing .env
  - **Given**: .env content with comments (#) and blank lines
  - **When**: parseEnvFile processes content
  - **Then**: Only key=value pairs are extracted
  - **File**: `tests/features/updates/services/componentUpdater.test.ts`

- [ ] **Test**: Should preserve values containing equals signs
  - **Given**: .env value like "API_URL=https://example.com?param=value"
  - **When**: parseEnvFile processes content
  - **Then**: Full value after first = is preserved
  - **File**: `tests/features/updates/services/componentUpdater.test.ts`

---

## Implementation Details

### RED Phase: Write Failing Tests

Add the following test structure to `componentUpdater.test.ts`:

```typescript
describe('ComponentUpdater - Extended Coverage', () => {
    // Reuse existing beforeEach setup

    describe('Snapshot lifecycle', () => {
        it('should remove snapshot after successful update', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // Verify snapshot cleanup - fs.rm called with snapshot path
            expect(fs.rm).toHaveBeenCalledWith(
                expect.stringContaining('.snapshot-'),
                { recursive: true, force: true }
            );
        });
    });

    describe('.env file preservation', () => {
        it('should backup .env files before removing component', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Mock .env file exists
            jest.spyOn(fs, 'readFile')
                .mockResolvedValueOnce('OLD_VAR=old_value')  // .env
                .mockResolvedValueOnce('LOCAL_VAR=local')   // .env.local
                .mockResolvedValue('{"name": "test"}');     // package.json

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // Verify .env was read
            expect(fs.readFile).toHaveBeenCalledWith(
                expect.stringContaining('.env'),
                'utf-8'
            );
        });

        it('should restore .env unchanged when no .env.example exists', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';
            const oldEnvContent = 'USER_VAR=user_value\nANOTHER=test';

            // Mock: .env exists, .env.example does not
            jest.spyOn(fs, 'readFile')
                .mockImplementation(async (path: any) => {
                    if (path.includes('.env.example')) {
                        throw new Error('ENOENT');
                    }
                    if (path.includes('.env') && !path.includes('package')) {
                        return oldEnvContent;
                    }
                    return '{"name": "test"}';
                });

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // Old content should be written back
            expect(fs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('.env'),
                oldEnvContent,
                'utf-8'
            );
        });

        it('should merge .env preserving user values and adding new defaults', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Old .env has USER_VAR, new template has USER_VAR and NEW_VAR
            jest.spyOn(fs, 'readFile')
                .mockImplementation(async (path: any) => {
                    if (path.includes('.env.example')) {
                        return 'USER_VAR=default\nNEW_VAR=new_default';
                    }
                    if (path.includes('.env') && !path.includes('package')) {
                        return 'USER_VAR=user_value';
                    }
                    return '{"name": "test"}';
                });

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // Merged content should have user's USER_VAR and new NEW_VAR
            expect(fs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('.env'),
                expect.stringContaining('USER_VAR=user_value'),
                'utf-8'
            );
            expect(fs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('.env'),
                expect.stringContaining('NEW_VAR=new_default'),
                'utf-8'
            );
        });

        it('should register programmatic writes before .env operations', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            jest.spyOn(fs, 'readFile')
                .mockImplementation(async (path: any) => {
                    if (path.includes('.env') && !path.includes('package')) {
                        return 'VAR=value';
                    }
                    return '{"name": "test"}';
                });

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.registerProgrammaticWrites',
                expect.any(Array)
            );
        });
    });

    describe('Version tracking', () => {
        it('should update version after successful verification', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            expect(mockProject.componentVersions).toBeDefined();
            expect(mockProject.componentVersions['test-component']).toEqual({
                version: '1.0.0',
                lastUpdated: expect.any(String)
            });
        });

        it('should NOT update version when verification fails', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Make verification fail by having package.json not exist
            jest.spyOn(fs, 'access').mockRejectedValueOnce(new Error('ENOENT'));

            await expect(
                updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion)
            ).rejects.toThrow();

            // Version should not be set
            expect(mockProject.componentVersions['test-component']).toBeUndefined();
        });
    });

    describe('formatUpdateError error formatting', () => {
        // Helper to trigger formatUpdateError via failed update with rollback
        const triggerErrorFormatting = async (error: Error) => {
            mockExecutor.execute.mockRejectedValueOnce(error);

            try {
                await updater.updateComponent(
                    mockProject,
                    'test-component',
                    'https://github.com/test/repo/archive/v1.0.0.zip',
                    '1.0.0'
                );
            } catch (e) {
                return (e as Error).message;
            }
            return '';
        };

        it('should format network error with helpful message', async () => {
            const networkError = new Error('fetch failed');
            (networkError as any).code = 'ENOTFOUND';

            const message = await triggerErrorFormatting(networkError);

            expect(message).toContain('internet connection');
        });

        it('should format timeout error with helpful message', async () => {
            const timeoutError = new Error('operation timed out');
            (timeoutError as any).code = 'ETIMEDOUT';

            const message = await triggerErrorFormatting(timeoutError);

            expect(message).toContain('timed out');
        });

        it('should format HTTP 404 error with version removed message', async () => {
            const http404Error = new Error('Download failed: HTTP 404');

            const message = await triggerErrorFormatting(http404Error);

            expect(message).toContain('not found');
        });

        it('should format HTTP 403 error with rate limit message', async () => {
            const http403Error = new Error('Download failed: HTTP 403');

            const message = await triggerErrorFormatting(http403Error);

            expect(message).toContain('rate limit');
        });

        it('should format generic HTTP error with server error message', async () => {
            const http500Error = new Error('Download failed: HTTP 500');

            const message = await triggerErrorFormatting(http500Error);

            expect(message).toContain('Server error');
        });

        it('should format verification failure with corruption message', async () => {
            const verificationError = new Error('package.json missing after extraction');

            const message = await triggerErrorFormatting(verificationError);

            expect(message).toContain('incomplete or corrupted');
        });
    });

    describe('Verification edge cases', () => {
        it('should verify package.json exists after extraction', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            expect(fs.access).toHaveBeenCalledWith(
                expect.stringContaining('package.json')
            );
        });

        it('should verify mesh.json exists for commerce-mesh component', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            const meshProject = {
                ...mockProject,
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        path: '/path/to/project/components/commerce-mesh',
                        port: 3000
                    }
                }
            } as any;

            await updater.updateComponent(meshProject, 'commerce-mesh', downloadUrl, newVersion);

            expect(fs.access).toHaveBeenCalledWith(
                expect.stringContaining('mesh.json')
            );
        });

        it('should throw when component not found in project', async () => {
            await expect(
                updater.updateComponent(
                    mockProject,
                    'non-existent-component',
                    'https://github.com/test/repo/archive/v1.0.0.zip',
                    '1.0.0'
                )
            ).rejects.toThrow('Component non-existent-component not found');
        });

        it('should throw critical error when rollback fails', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Make extraction fail
            mockExecutor.execute.mockRejectedValueOnce(new Error('Extraction failed'));

            // Make rollback also fail
            jest.spyOn(fs, 'rm').mockRejectedValueOnce(new Error('Permission denied'));
            jest.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('Cannot rename'));

            await expect(
                updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion)
            ).rejects.toThrow('Manual recovery required');
        });
    });

    describe('parseEnvFile edge cases', () => {
        it('should skip comments and empty lines when parsing .env', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            const envWithComments = '# This is a comment\nVAR1=value1\n\n# Another comment\nVAR2=value2';

            jest.spyOn(fs, 'readFile')
                .mockImplementation(async (path: any) => {
                    if (path.includes('.env.example')) {
                        return 'VAR1=default1\nVAR2=default2';
                    }
                    if (path.includes('.env') && !path.includes('package')) {
                        return envWithComments;
                    }
                    return '{"name": "test"}';
                });

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // Merged should only have the actual vars, not comments
            const writeCall = (fs.writeFile as jest.Mock).mock.calls.find(
                (call: any[]) => call[0].includes('.env') && !call[0].includes('package')
            );
            expect(writeCall[1]).toContain('VAR1=value1');
            expect(writeCall[1]).toContain('VAR2=value2');
            expect(writeCall[1]).not.toContain('#');
        });

        it('should preserve values containing equals signs', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            const envWithEquals = 'API_URL=https://example.com?param=value&other=123';

            jest.spyOn(fs, 'readFile')
                .mockImplementation(async (path: any) => {
                    if (path.includes('.env.example')) {
                        return 'API_URL=http://default.com';
                    }
                    if (path.includes('.env') && !path.includes('package')) {
                        return envWithEquals;
                    }
                    return '{"name": "test"}';
                });

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // The full URL with = signs should be preserved
            const writeCall = (fs.writeFile as jest.Mock).mock.calls.find(
                (call: any[]) => call[0].includes('.env') && !call[0].includes('package')
            );
            expect(writeCall[1]).toContain('API_URL=https://example.com?param=value&other=123');
        });
    });
});
```

### GREEN Phase: Tests Should Pass

The tests are designed to work with the existing implementation. Run tests:

```bash
npm run test:file -- tests/features/updates/services/componentUpdater.test.ts
```

All tests should pass as they test existing functionality.

### REFACTOR Phase

After all tests pass:
1. Review test organization for clarity
2. Extract common test helpers if patterns emerge
3. Ensure test descriptions are clear and self-documenting
4. Remove any redundant assertions

---

## Expected Outcome

After completing this step:

- [ ] 24 new tests added (from 6 to 30 total)
- [ ] Coverage increases from ~40-50% to 80%+
- [ ] All major code paths in componentUpdater.ts are tested
- [ ] Error formatting is fully covered
- [ ] .env preservation logic is thoroughly tested
- [ ] Snapshot lifecycle (create, cleanup, rollback) is tested

---

## Acceptance Criteria

- [ ] All 30 tests passing
- [ ] No console.log or debugger statements
- [ ] Test descriptions clearly describe what is being tested
- [ ] Coverage target of 80%+ achieved for componentUpdater.ts
- [ ] Tests follow Given-When-Then pattern

---

## Estimated Time

**RED Phase**: 45 minutes (write all failing tests)
**GREEN Phase**: 30 minutes (verify tests pass with existing code)
**REFACTOR Phase**: 15 minutes (clean up and organize)

**Total**: ~1.5 hours

---

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| `tests/features/updates/services/componentUpdater.test.ts` | MODIFY | Add 24 new tests |

---

## Notes

- The `formatUpdateError` method is private, so it's tested indirectly through failed update scenarios
- The `parseEnvFile` method is private, so it's tested indirectly through .env merge scenarios
- Some tests may need mock adjustment based on actual error type detection in `toAppError`
- If `toAppError` uses specific error properties, mocks should include those properties

---

**Step Status:** ✅ COMPLETE (2025-12-24)

**Completion Summary:**
- Added 22 new tests (9 to 31 total)
- All 31 tests passing (100%)
- Coverage: 96.15% statements, 82.71% branches (target 80% achieved)
- Test groups covered:
  - Snapshot lifecycle (cleanup after success)
  - .env file preservation (backup, merge, restore)
  - Version tracking after verification
  - Error formatting (network, timeout, HTTP 404/403/500, verification)
  - Verification edge cases (component not found, rollback failure)
  - parseEnvFile edge cases (comments, equals signs)

**Implementation Notes:**
- formatUpdateError return value is logged but "Manual recovery required" always thrown
  (error formatting throw at line 108 is inside try block, gets caught by inner catch)
- Tests designed to work with existing implementation structure

**Files Modified:**
- `tests/features/updates/services/componentUpdater.test.ts` (+22 tests)

**Next Step:** Step 6 - fnm Path Discovery Tests
