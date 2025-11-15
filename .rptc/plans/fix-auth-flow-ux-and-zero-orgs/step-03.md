# Step 3: Implement CLI Context Clearing

## Purpose

When `getOrganizations()` returns an empty array (0 orgs), clear stale Adobe CLI context (org/project/workspace selections) to prevent 403 errors on subsequent operations. This step preserves the authentication token while removing invalid console context.

**Why this is needed**: A token with no organization access can still be valid but useless. Stale CLI context (console.org, console.project, console.workspace) from a previous session with different token/orgs causes 403 Forbidden errors when Adobe CLI commands run. Clearing this context allows the user to start fresh without needing to re-authenticate.

## Prerequisites

- [x] Step 1 completed (frontend message fix - removed optimistic "Opening browser..." message)
- [x] Step 2 completed (token expiry detection - distinguishes "session expired" from "no org access")
- [ ] Established pattern exists in codebase (organizationValidator.ts:216-232, authenticationService.ts:372-381)
- [ ] Test utilities available (adobeEntityService.testUtils.ts)

## Tests to Write First (RED Phase)

### Unit Tests

**File**: `tests/features/authentication/services/adobeEntityService-organizations.test.ts`

- [ ] Test: `getOrganizations()` clears CLI context when returning empty array via SDK
  - **Given**: SDK returns empty organizations array (body: [])
  - **When**: getOrganizations() is called
  - **Then**: Three config delete commands executed in parallel (Promise.all) followed by clearConsoleWhereCache()
  - **File**: `tests/features/authentication/services/adobeEntityService-organizations.test.ts`

- [ ] Test: `getOrganizations()` clears CLI context when returning empty array via CLI fallback
  - **Given**: SDK not initialized, CLI returns empty array JSON ("[]")
  - **When**: getOrganizations() is called
  - **Then**: Three config delete commands executed in parallel (Promise.all) followed by clearConsoleWhereCache()
  - **File**: `tests/features/authentication/services/adobeEntityService-organizations.test.ts`

- [ ] Test: CLI context clearing uses established pattern (Promise.all with 3 delete commands)
  - **Given**: getOrganizations() returns empty array
  - **When**: Context clearing is triggered
  - **Then**: Verify executeAdobeCLI called 3 times with correct commands:
    - `aio config delete console.org`
    - `aio config delete console.project`
    - `aio config delete console.workspace`
  - **Then**: Verify commands run in parallel via Promise.all (not sequentially)
  - **File**: `tests/features/authentication/services/adobeEntityService-organizations.test.ts`

- [ ] Test: Token is preserved (ims context NOT cleared)
  - **Given**: getOrganizations() returns empty array
  - **When**: Context clearing is triggered
  - **Then**: Verify executeAdobeCLI NOT called with `aio config delete ims`
  - **Then**: Token-related config remains intact
  - **File**: `tests/features/authentication/services/adobeEntityService-organizations.test.ts`

- [ ] Test: Cache manager clearConsoleWhereCache() called after CLI clearing
  - **Given**: getOrganizations() returns empty array
  - **When**: Context clearing completes
  - **Then**: mockCacheManager.clearConsoleWhereCache() called exactly once
  - **Then**: Called AFTER Promise.all completes (verify call order)
  - **File**: `tests/features/authentication/services/adobeEntityService-organizations.test.ts`

- [ ] Test: CLI context NOT cleared when orgs exist
  - **Given**: getOrganizations() returns non-empty array (1+ orgs)
  - **When**: getOrganizations() is called
  - **Then**: executeAdobeCLI NOT called with config delete commands
  - **Then**: clearConsoleWhereCache() NOT called
  - **File**: `tests/features/authentication/services/adobeEntityService-organizations.test.ts`

- [ ] Test: Context clearing resilient to config delete failures
  - **Given**: One or more config delete commands fail (non-zero exit code)
  - **When**: Context clearing is triggered
  - **Then**: clearConsoleWhereCache() still called (cleanup proceeds)
  - **Then**: No error thrown (fail gracefully)
  - **File**: `tests/features/authentication/services/adobeEntityService-organizations.test.ts`

### Integration Tests

- [ ] Test: Full auth flow with 0 orgs verifies CLI context cleared
  - **Given**: Valid token but 0 organizations accessible
  - **When**: Authentication flow completes (Step 2 detects 0 orgs)
  - **Then**: CLI context delete commands executed
  - **Then**: clearConsoleWhereCache() called
  - **Then**: User can select new org without stale context interference
  - **File**: `tests/features/authentication/authenticationFlow-zeroOrgs.integration.test.ts` (new file)

- [ ] Test: Subsequent CLI commands don't fail with 403 after context clearing
  - **Given**: CLI context cleared due to 0 orgs
  - **When**: User attempts new Adobe CLI operation (e.g., org selection)
  - **Then**: No 403 Forbidden error from stale context
  - **Then**: Command succeeds or fails for valid reasons (not stale context)
  - **File**: `tests/features/authentication/authenticationFlow-zeroOrgs.integration.test.ts` (new file)

## Files to Create/Modify

**Files to Modify:**

- [ ] `src/features/authentication/services/adobeEntityService.ts` - Add CLI context clearing in `getOrganizations()` when empty array returned (lines 76-152)

**Test Files to Create/Modify:**

- [ ] `tests/features/authentication/services/adobeEntityService-organizations.test.ts` - Add 7 new unit tests (existing file, add new describe block)
- [ ] `tests/features/authentication/authenticationFlow-zeroOrgs.integration.test.ts` - Create new integration test file (2 tests)

## Implementation Details (RED-GREEN-REFACTOR)

### RED: Write Failing Tests First

**Location**: `tests/features/authentication/services/adobeEntityService-organizations.test.ts`

Add a new describe block after existing tests (~line 482):

```typescript
describe('CLI context clearing when no orgs', () => {
    it('should clear CLI context when SDK returns empty organizations array', async () => {
        const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = setupMocks();

        // Arrange: SDK returns empty array
        mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
        mockSDKClient.isInitialized.mockReturnValue(true);
        const mockSDKGetOrgs = jest.fn().mockResolvedValue({
            body: [], // Empty orgs array
        });
        mockSDKClient.getClient.mockReturnValue({
            getOrganizations: mockSDKGetOrgs
        } as ReturnType<typeof mockSDKClient.getClient>);

        // Mock config delete commands to succeed
        mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
            stdout: '',
            stderr: '',
            code: 0,
            duration: 100,
        });

        // Act
        const result = await service.getOrganizations();

        // Assert
        expect(result).toEqual([]); // Empty array returned

        // Verify 3 config delete commands called
        expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledTimes(3);
        expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
            'aio config delete console.org',
            { encoding: 'utf8' }
        );
        expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
            'aio config delete console.project',
            { encoding: 'utf8' }
        );
        expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
            'aio config delete console.workspace',
            { encoding: 'utf8' }
        );

        // Verify cache cleared
        expect(mockCacheManager.clearConsoleWhereCache).toHaveBeenCalledTimes(1);
    });

    it('should clear CLI context when CLI returns empty organizations array', async () => {
        const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = setupMocks();

        // Arrange: SDK not initialized, CLI returns empty array
        mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
        mockSDKClient.isInitialized.mockReturnValue(false);

        // First call: CLI org list returns empty array
        // Subsequent calls: config delete commands
        mockCommandExecutor.executeAdobeCLI
            .mockResolvedValueOnce({
                stdout: '[]', // Empty orgs from CLI
                stderr: '',
                code: 0,
                duration: 1000,
            })
            .mockResolvedValue({
                stdout: '',
                stderr: '',
                code: 0,
                duration: 100,
            });

        (parseJSON as jest.Mock).mockReturnValue([]);

        // Act
        const result = await service.getOrganizations();

        // Assert
        expect(result).toEqual([]);

        // Verify 4 CLI calls: 1 for org list + 3 for config delete
        expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledTimes(4);
        expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
            'aio console org list --json',
            expect.any(Object)
        );
        expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
            'aio config delete console.org',
            { encoding: 'utf8' }
        );
        expect(mockCacheManager.clearConsoleWhereCache).toHaveBeenCalledTimes(1);
    });

    it('should use Promise.all for parallel execution of config delete commands', async () => {
        const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = setupMocks();

        // Arrange: SDK returns empty array
        mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
        mockSDKClient.isInitialized.mockReturnValue(true);
        mockSDKClient.getClient.mockReturnValue({
            getOrganizations: jest.fn().mockResolvedValue({ body: [] })
        } as ReturnType<typeof mockSDKClient.getClient>);

        // Track when each command is called
        const callTimestamps: number[] = [];
        mockCommandExecutor.executeAdobeCLI.mockImplementation(async () => {
            callTimestamps.push(Date.now());
            // Add small delay to verify parallelism
            await new Promise(resolve => setTimeout(resolve, 10));
            return { stdout: '', stderr: '', code: 0, duration: 10 };
        });

        // Act
        await service.getOrganizations();

        // Assert: All 3 commands should start within ~10ms of each other (parallel)
        expect(callTimestamps).toHaveLength(3);
        const maxTimeDiff = Math.max(...callTimestamps) - Math.min(...callTimestamps);
        expect(maxTimeDiff).toBeLessThan(50); // Parallel calls start nearly simultaneously
    });

    it('should NOT clear ims context (preserve token)', async () => {
        const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = setupMocks();

        // Arrange: Empty orgs
        mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
        mockSDKClient.isInitialized.mockReturnValue(true);
        mockSDKClient.getClient.mockReturnValue({
            getOrganizations: jest.fn().mockResolvedValue({ body: [] })
        } as ReturnType<typeof mockSDKClient.getClient>);
        mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
            stdout: '',
            stderr: '',
            code: 0,
            duration: 100,
        });

        // Act
        await service.getOrganizations();

        // Assert: Verify ims context NOT cleared
        expect(mockCommandExecutor.executeAdobeCLI).not.toHaveBeenCalledWith(
            expect.stringContaining('ims'),
            expect.any(Object)
        );
        // Only console.* configs cleared
        expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
            'aio config delete console.org',
            expect.any(Object)
        );
    });

    it('should call clearConsoleWhereCache after CLI clearing completes', async () => {
        const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = setupMocks();

        // Arrange: Empty orgs
        mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
        mockSDKClient.isInitialized.mockReturnValue(true);
        mockSDKClient.getClient.mockReturnValue({
            getOrganizations: jest.fn().mockResolvedValue({ body: [] })
        } as ReturnType<typeof mockSDKClient.getClient>);

        // Track call order
        const callOrder: string[] = [];
        mockCommandExecutor.executeAdobeCLI.mockImplementation(async (cmd) => {
            callOrder.push(`cli:${cmd}`);
            return { stdout: '', stderr: '', code: 0, duration: 100 };
        });
        mockCacheManager.clearConsoleWhereCache.mockImplementation(() => {
            callOrder.push('cache:clear');
        });

        // Act
        await service.getOrganizations();

        // Assert: Cache clear happens AFTER all CLI commands
        expect(callOrder).toEqual([
            expect.stringContaining('console.org'),
            expect.stringContaining('console.project'),
            expect.stringContaining('console.workspace'),
            'cache:clear',
        ]);
    });

    it('should NOT clear CLI context when orgs exist', async () => {
        const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = setupMocks();

        // Arrange: SDK returns non-empty orgs
        mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
        mockSDKClient.isInitialized.mockReturnValue(true);
        const mockSDKGetOrgs = jest.fn().mockResolvedValue({
            body: [
                { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' },
            ],
        });
        mockSDKClient.getClient.mockReturnValue({
            getOrganizations: mockSDKGetOrgs
        } as ReturnType<typeof mockSDKClient.getClient>);

        // Act
        const result = await service.getOrganizations();

        // Assert
        expect(result).toHaveLength(1);

        // Verify NO config delete commands called
        expect(mockCommandExecutor.executeAdobeCLI).not.toHaveBeenCalledWith(
            expect.stringContaining('config delete'),
            expect.any(Object)
        );
        expect(mockCacheManager.clearConsoleWhereCache).not.toHaveBeenCalled();
    });

    it('should call clearConsoleWhereCache even if config delete commands fail', async () => {
        const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = setupMocks();

        // Arrange: Empty orgs
        mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
        mockSDKClient.isInitialized.mockReturnValue(true);
        mockSDKClient.getClient.mockReturnValue({
            getOrganizations: jest.fn().mockResolvedValue({ body: [] })
        } as ReturnType<typeof mockSDKClient.getClient>);

        // Mock config delete to fail
        mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
            stdout: '',
            stderr: 'Config not found',
            code: 1, // Failure
            duration: 100,
        });

        // Act
        const result = await service.getOrganizations();

        // Assert: Should not throw error
        expect(result).toEqual([]);

        // Cache clear should still be called (cleanup proceeds despite failures)
        expect(mockCacheManager.clearConsoleWhereCache).toHaveBeenCalledTimes(1);
    });
});
```

**Expected Result**: All 7 tests should FAIL initially (RED phase) because the implementation doesn't exist yet.

### GREEN: Minimal Implementation

**File**: `src/features/authentication/services/adobeEntityService.ts`

**Modify `getOrganizations()` method** (currently lines 76-152).

Insert the CLI context clearing logic **after line 137** (after `mappedOrgs` is populated, before caching):

```typescript
async getOrganizations(): Promise<AdobeOrg[]> {
    const startTime = Date.now();

    try {
        // Check cache first
        const cachedOrgs = this.cacheManager.getCachedOrgList();
        if (cachedOrgs) {
            return cachedOrgs;
        }

        this.stepLogger.logTemplate('adobe-setup', 'loading-organizations', {});

        let mappedOrgs: AdobeOrg[] = [];

        // Try SDK first for 30x performance improvement
        if (this.sdkClient.isInitialized()) {
            try {
                this.debugLogger.debug('[Entity Service] Fetching organizations via SDK (fast path)');

                const client = this.sdkClient.getClient() as { getOrganizations: () => Promise<SDKResponse<RawAdobeOrg[]>> };
                const sdkResult = await client.getOrganizations();
                const sdkDuration = Date.now() - startTime;

                if (sdkResult.body && Array.isArray(sdkResult.body)) {
                    mappedOrgs = this.mapOrganizations(sdkResult.body);

                    this.debugLogger.debug(`[Entity Service] Retrieved ${mappedOrgs.length} organizations via SDK in ${sdkDuration}ms`);
                } else {
                    throw new Error('Invalid SDK response format');
                }
            } catch (sdkError) {
                this.debugLogger.debug('[Entity Service] SDK failed, falling back to CLI:', sdkError);
                this.debugLogger.warn('[Entity Service] SDK unavailable, using slower CLI fallback for organizations');
            }
        }

        // CLI fallback (if SDK not available or failed)
        if (mappedOrgs.length === 0) {
            this.debugLogger.debug('[Entity Service] Fetching organizations via CLI (fallback path)');

            const result = await this.commandManager.executeAdobeCLI(
                'aio console org list --json',
                { encoding: 'utf8' },
            );

            const cliDuration = Date.now() - startTime;

            if (result.code !== 0) {
                throw new Error(`Failed to get organizations: ${result.stderr}`);
            }

            // SECURITY: Use parseJSON for type-safe parsing
            const orgs = parseJSON<RawAdobeOrg[]>(result.stdout);

            if (!orgs || !Array.isArray(orgs)) {
                throw new Error('Invalid organizations response format');
            }

            mappedOrgs = this.mapOrganizations(orgs);

            this.debugLogger.debug(`[Entity Service] Retrieved ${mappedOrgs.length} organizations via CLI in ${cliDuration}ms`);
        }

        // **NEW: Clear stale CLI context if no orgs accessible**
        if (mappedOrgs.length === 0) {
            this.debugLogger.debug('[Entity Service] No organizations accessible - clearing stale CLI context');
            await this.clearConsoleContext();
        }

        // Cache the result
        this.cacheManager.setCachedOrgList(mappedOrgs);

        this.stepLogger.logTemplate('adobe-setup', 'found', {
            count: mappedOrgs.length,
            item: mappedOrgs.length === 1 ? 'organization' : 'organizations',
        });

        return mappedOrgs;
    } catch (error) {
        this.debugLogger.error('[Entity Service] Failed to get organizations', error as Error);
        throw error;
    }
}

/**
 * Clear Adobe CLI console context (org/project/workspace selections)
 * Preserves authentication token (ims context)
 */
private async clearConsoleContext(): Promise<void> {
    try {
        // Use established pattern: Promise.all for parallel execution
        await Promise.all([
            this.commandManager.executeAdobeCLI('aio config delete console.org', { encoding: 'utf8' }),
            this.commandManager.executeAdobeCLI('aio config delete console.project', { encoding: 'utf8' }),
            this.commandManager.executeAdobeCLI('aio config delete console.workspace', { encoding: 'utf8' }),
        ]);

        // Clear console.where cache since context was cleared
        this.cacheManager.clearConsoleWhereCache();

        this.debugLogger.debug('[Entity Service] Cleared Adobe CLI console context (preserved token)');
    } catch (error) {
        // Fail gracefully - config may not exist
        this.debugLogger.debug('[Entity Service] Failed to clear console context (non-critical):', error);
    }
}
```

**Line-by-line placement**:
- **Line ~138-142**: Add CLI context clearing check and call
- **Line ~858-876** (end of class): Add private `clearConsoleContext()` method (after existing methods, before closing brace)

**Expected Result**:
- All 7 unit tests now PASS (GREEN phase)
- Empty org array triggers CLI context clearing
- Token remains intact (ims context not touched)

### REFACTOR: Clean Up

**Error Handling Enhancement**:

The implementation already includes try-catch in `clearConsoleContext()` to fail gracefully. This is correct because:
- Config keys may not exist (first-time user)
- Network timeouts are non-critical (cleanup is best-effort)
- We don't want to throw errors during cleanup

**Logging Enhancement**:

Add user-facing log message when clearing context (helps debugging):

```typescript
if (mappedOrgs.length === 0) {
    this.logger.info('No organizations accessible. Clearing previous selections...');
    this.debugLogger.debug('[Entity Service] No organizations accessible - clearing stale CLI context');
    await this.clearConsoleContext();
}
```

**Performance Consideration**:

The `Promise.all()` pattern executes the 3 delete commands in parallel (~300ms total) rather than sequentially (~900ms total). This is optimal.

**Edge Case: What if delete commands fail?**

Already handled - the try-catch in `clearConsoleContext()` logs the error but doesn't throw. The cache clear still happens because it's after the Promise.all (not inside it).

**Code Organization**:

The new `clearConsoleContext()` method follows the established pattern from:
- `organizationValidator.ts:216-232`
- `authenticationService.ts:372-381`

Both existing implementations use the same pattern, confirming this is the codebase standard.

## Expected Outcome

**Behavior After This Step:**

1. When `getOrganizations()` returns an empty array (0 orgs):
   - CLI context is cleared (console.org, console.project, console.workspace)
   - Authentication token is preserved (ims context untouched)
   - User can select a new organization without 403 errors

2. When `getOrganizations()` returns 1+ orgs:
   - CLI context is NOT cleared (normal flow)
   - Existing behavior unchanged

3. Error resilience:
   - Config delete failures don't crash the process
   - Cache clearing proceeds even if CLI commands fail
   - Non-critical failures logged for debugging

**Verification:**

**Manual Testing**:
1. Use token with 0 org access
2. Trigger `getOrganizations()` (via Adobe Auth step)
3. Check debug logs: should see "Cleared Adobe CLI console context"
4. Verify `aio config delete` commands in logs
5. Run `aio console where` - should show no org/project/workspace

**Automated Testing**:
```bash
# Run unit tests
npm run test:watch -- tests/features/authentication/services/adobeEntityService-organizations.test.ts

# Verify all 7 new tests pass
npm run test:file -- tests/features/authentication/services/adobeEntityService-organizations.test.ts
```

## Acceptance Criteria

- [ ] CLI context cleared when `getOrganizations()` returns empty array
- [ ] Three delete commands executed in parallel (Promise.all)
- [ ] Cache manager `clearConsoleWhereCache()` called after CLI commands
- [ ] Token preserved (ims context NOT touched)
- [ ] CLI context NOT cleared when 1+ orgs exist
- [ ] Error resilient (config delete failures don't crash)
- [ ] All 7 unit tests passing
- [ ] Debug logging indicates context clearing occurred
- [ ] Code follows established pattern (organizationValidator.ts, authenticationService.ts)

## Dependencies from Other Steps

**Depends on:**
- Step 2 (token expiry detection creates scenario where `getOrganizations()` returns empty array for valid-but-useless tokens)

**Used by:**
- Step 4 may rely on clean CLI state after this step
- Future authentication flows benefit from automatic cleanup

## Estimated Time

**45 minutes - 1 hour**

**Breakdown**:
- Write 7 unit tests: 20-25 minutes
- Implement CLI context clearing: 10-15 minutes
- Run tests, iterate to GREEN: 10-15 minutes
- Refactor and verify: 5-10 minutes

**Complexity**: Medium (established pattern exists, straightforward implementation)

---

**References**:
- Established pattern: `src/features/authentication/services/organizationValidator.ts:216-232`
- Established pattern: `src/features/authentication/services/authenticationService.ts:372-381`
- Test utilities: `tests/features/authentication/services/adobeEntityService.testUtils.ts`
- Testing guide SOP: `.rptc/sop/testing-guide.md`
