# Step 3: Audit High-Priority (Data Integrity) Gaps

## Purpose

Address data integrity coverage gaps identified in Step 1. Data integrity code manages state, file operations, and API calls - failures here can cause data corruption or loss.

## Prerequisites

- [ ] Step 1 complete (coverage analysis done)
- [ ] Step 2 complete (security gaps addressed)
- [ ] Data integrity files identified from coverage report
- [ ] All existing tests still passing

---

## Data Integrity Code Areas

### Expected Files to Audit

Based on codebase structure, data integrity code includes:

**State Management:**
- `src/core/state/stateManager.ts`
- `src/core/state/transientStateManager.ts`
- `src/core/state/projectStateSync.ts`
- `src/core/state/recentProjectsManager.ts`
- `src/core/state/projectDirectoryScanner.ts`
- `src/core/state/projectConfigWriter.ts`

**File Operations:**
- `src/core/shell/fileWatcher.ts`
- `src/core/vscode/workspaceWatcherManager.ts`
- `src/features/project-creation/helpers/envFileGenerator.ts`

**API/Command Handlers:**
- `src/features/*/handlers/*.ts`
- `src/core/communication/webviewCommunicationManager.ts`
- `src/core/shell/commandExecutor.ts`
- `src/core/shell/commandSequencer.ts`

**Cache Management:**
- `src/core/cache/AbstractCacheManager.ts`
- `src/features/prerequisites/services/prerequisitesCacheManager.ts`

---

## Tasks

### 3.1 State Management Coverage

**Target:** 90%+ branch coverage for all state code

- [ ] Review `stateManager.ts` coverage
  - [ ] Test all getter methods
  - [ ] Test all setter methods
  - [ ] Test state persistence
  - [ ] Test state restoration
  - [ ] Test error handling during state operations

- [ ] Review `transientStateManager.ts` coverage
  - [ ] Test TTL expiration
  - [ ] Test cache eviction (LRU)
  - [ ] Test concurrent access
  - [ ] Test state cleanup

- [ ] Review `projectStateSync.ts` coverage
  - [ ] Test sync operations
  - [ ] Test conflict resolution
  - [ ] Test partial sync failures

- [ ] Review `projectConfigWriter.ts` coverage
  - [ ] Test write operations
  - [ ] Test atomic writes
  - [ ] Test rollback on failure

**Tests to Write:**

- [ ] Test: State persistence survives restart
  - **Given:** State set with specific values
  - **When:** Extension deactivates and reactivates
  - **Then:** State values restored correctly
  - **File:** `tests/core/state/stateManager-persistence.test.ts`

- [ ] Test: Concurrent state updates handled
  - **Given:** Multiple rapid state updates
  - **When:** Updates processed
  - **Then:** Final state is consistent, no data loss
  - **File:** `tests/core/state/stateManager-concurrency.test.ts`

- [ ] Test: State corruption detected and handled
  - **Given:** Corrupted state data
  - **When:** State loaded
  - **Then:** Error logged, defaults restored safely
  - **File:** `tests/core/state/stateManager-corruption.test.ts`

- [ ] Test: TTL-based cache expiration
  - **Given:** Cache entries with varied TTLs
  - **When:** Time advances past TTL
  - **Then:** Expired entries removed, unexpired retained
  - **File:** `tests/core/state/transientStateManager-ttl-coverage.test.ts`

### 3.2 File Operation Coverage

**Target:** 90%+ coverage for file operations

- [ ] Review `fileWatcher.ts` coverage
  - [ ] Test file change detection
  - [ ] Test file creation events
  - [ ] Test file deletion events
  - [ ] Test debouncing/throttling
  - [ ] Test watcher cleanup

- [ ] Review `envFileGenerator.ts` coverage
  - [ ] Test .env file generation
  - [ ] Test variable merging
  - [ ] Test special character handling
  - [ ] Test file write errors

**Tests to Write:**

- [ ] Test: File watcher detects changes
  - **Given:** Watched file exists
  - **When:** File content changes
  - **Then:** Change event emitted with correct data
  - **File:** `tests/core/shell/fileWatcher-changes.test.ts`

- [ ] Test: Env file preserves user values
  - **Given:** Existing .env with user customizations
  - **When:** Component update merges new values
  - **Then:** User values preserved, new defaults added
  - **File:** `tests/features/project-creation/helpers/envFileGenerator-merge.test.ts`

- [ ] Test: File write failure handled
  - **Given:** Write operation to read-only location
  - **When:** Write attempted
  - **Then:** Error caught, user notified, no data corruption
  - **File:** `tests/core/shell/fileWatcher-errors.test.ts`

### 3.3 Handler Coverage

**Target:** 90%+ coverage for message handlers

- [ ] Review authentication handlers coverage
  - [ ] Test successful auth flow
  - [ ] Test auth failure handling
  - [ ] Test token refresh
  - [ ] Test organization/project selection

- [ ] Review mesh handlers coverage
  - [ ] Test deployment success
  - [ ] Test deployment failure
  - [ ] Test status checking
  - [ ] Test staleness detection

- [ ] Review lifecycle handlers coverage
  - [ ] Test start demo
  - [ ] Test stop demo
  - [ ] Test status updates

- [ ] Review component handlers coverage
  - [ ] Test component selection
  - [ ] Test dependency resolution
  - [ ] Test configuration validation

**Tests to Write:**

- [ ] Test: Handler errors don't crash extension
  - **Given:** Handler throws unexpected error
  - **When:** Message processed
  - **Then:** Error caught, logged, graceful response sent
  - **File:** `tests/features/*/handlers/*-errorHandling.test.ts`

- [ ] Test: Handler responses are well-formed
  - **Given:** Various handler inputs
  - **When:** Handler processes message
  - **Then:** Response matches expected schema
  - **File:** `tests/features/*/handlers/*-responseFormat.test.ts`

### 3.4 Communication Manager Coverage

**Target:** 90%+ coverage for webview communication

- [ ] Review `webviewCommunicationManager.ts` coverage
  - [ ] Test handshake protocol
  - [ ] Test message queuing
  - [ ] Test retry logic
  - [ ] Test timeout handling
  - [ ] Test cleanup on dispose

**Tests to Write:**

- [ ] Test: Messages queued before handshake
  - **Given:** Messages sent before webview ready
  - **When:** Handshake completes
  - **Then:** Queued messages delivered in order
  - **File:** `tests/core/communication/webviewCommunicationManager-queue.test.ts`

- [ ] Test: Retry logic with backoff
  - **Given:** Message delivery fails
  - **When:** Retry triggered
  - **Then:** Exponential backoff applied, max retries respected
  - **File:** `tests/core/communication/webviewCommunicationManager-retry.test.ts`

### 3.5 Cache Manager Coverage

**Target:** 90%+ coverage for cache operations

- [ ] Review `AbstractCacheManager.ts` coverage
  - [ ] Test cache operations
  - [ ] Test size limits
  - [ ] Test eviction policies
  - [ ] Test TTL with jitter

- [ ] Review `prerequisitesCacheManager.ts` coverage
  - [ ] Test prerequisite caching
  - [ ] Test cache invalidation
  - [ ] Test cache miss handling

**Tests to Write:**

- [ ] Test: Cache respects size limits
  - **Given:** Cache at max capacity
  - **When:** New entry added
  - **Then:** Oldest entry evicted, new entry stored
  - **File:** `tests/core/cache/AbstractCacheManager-limits.test.ts`

- [ ] Test: Cache invalidation on config change
  - **Given:** Cached prerequisite status
  - **When:** Configuration changes
  - **Then:** Related cache entries invalidated
  - **File:** `tests/features/prerequisites/services/prerequisitesCacheManager-invalidation.test.ts`

---

## Implementation Details

### RED Phase (Write failing tests)

For each uncovered data integrity path:

```typescript
describe('Data Integrity: [Component]', () => {
  describe('[operation]', () => {
    it('should maintain data consistency when [scenario]', () => {
      // Arrange: Set up initial state
      const initialState = {...};

      // Act: Perform operation
      await component.operation();

      // Assert: Data is consistent
      expect(component.state).toEqual(expectedState);
      expect(dataFile).toContainExpectedContent();
    });
  });
});
```

### GREEN Phase (Make tests pass)

- Verify existing code handles data integrity
- Add missing error handling if needed
- Ensure atomic operations where required

### REFACTOR Phase

- Extract common data integrity test utilities
- Consolidate similar test patterns
- Improve test readability

---

## Expected Outcome

After completing this step:
- All state management code at 90%+ coverage
- All file operations tested for success and failure
- All handlers tested for error conditions
- Communication manager fully tested
- Cache operations verified

---

## Acceptance Criteria

- [ ] `src/core/state/*.ts` at 90%+ branch coverage
- [ ] `src/core/shell/fileWatcher.ts` at 90%+ coverage
- [ ] `src/core/communication/webviewCommunicationManager.ts` at 90%+ coverage
- [ ] `src/features/*/handlers/*.ts` at 90%+ coverage
- [ ] `src/core/cache/AbstractCacheManager.ts` at 90%+ coverage
- [ ] All data integrity tests passing
- [ ] No data corruption scenarios uncovered

---

## Data Integrity Review Checklist

After completing tests, verify:

- [ ] All state operations tested (read/write/update/delete)
- [ ] All file operations handle errors gracefully
- [ ] All cache operations respect limits and TTLs
- [ ] All handlers return consistent responses
- [ ] Concurrent operations don't cause data races

---

## Time Estimate

**Estimated:** 2-3 hours

- State management tests: 45-60 minutes
- File operation tests: 30-45 minutes
- Handler tests: 30-45 minutes
- Communication manager tests: 20-30 minutes
- Cache manager tests: 20-30 minutes
- Review and cleanup: 15-30 minutes

---

## Notes

- Data integrity tests should verify both success and failure paths
- Consider edge cases: empty data, large data, concurrent access
- Ensure cleanup in test afterEach to prevent test pollution
- Use mock timers for TTL/timeout testing
- Document any data integrity concerns for future work
