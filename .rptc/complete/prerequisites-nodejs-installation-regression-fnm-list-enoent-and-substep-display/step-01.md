# Step 1: Fix fnm list Shell Option in Handler Files

## Purpose

Fix the ENOENT error when executing `fnm list` commands by adding the `{ shell: true }` option to all four affected handler files. This ensures fnm commands run in shell context where fnm is properly initialized, preventing "command not found" errors.

**Why This Step is First:**
- Addresses root cause of Node.js version detection failure
- Unblocks substep display functionality (Step 2 depends on working detection)
- Small, focused change with clear success criteria
- Low risk (pattern already proven in existing code)

---

## Prerequisites

- [ ] Overview document reviewed and understood
- [ ] Development environment set up (npm install completed)
- [ ] Test framework configured (Jest)
- [ ] fnm installed and available in shell context for testing

---

## Tests to Write First (TDD RED Phase)

### Test File 1: installHandler.test.ts

**File:** `tests/features/prerequisites/handlers/installHandler.test.ts`

- [ ] **Test: should execute fnm list with shell option**
  - **Given:** CommandManager.execute is mocked
  - **When:** installHandler calls checkMultipleNodeVersions(['20'])
  - **Then:** commandManager.execute called with `'fnm list'` and options `{ shell: true, timeout: TIMEOUTS.PREREQUISITE_CHECK }`
  - **File:** `tests/features/prerequisites/handlers/installHandler.test.ts`

- [ ] **Test: should successfully detect installed Node versions**
  - **Given:** fnm list returns "v20.10.0\nv24.0.0"
  - **When:** checkMultipleNodeVersions(['20', '24']) is called
  - **Then:** Returns array with both versions marked as installed
  - **File:** `tests/features/prerequisites/handlers/installHandler.test.ts`

- [ ] **Test: should handle fnm list failure gracefully**
  - **Given:** fnm list throws ENOENT error
  - **When:** checkMultipleNodeVersions(['20']) is called
  - **Then:** Returns array with version marked as not installed (existing error handling works)
  - **File:** `tests/features/prerequisites/handlers/installHandler.test.ts`

- [ ] **Test: should detect partial installation correctly**
  - **Given:** fnm list returns only "v20.10.0" (v24 not installed)
  - **When:** checkMultipleNodeVersions(['20', '24']) is called
  - **Then:** Returns array with Node 20 installed=true, Node 24 installed=false
  - **File:** `tests/features/prerequisites/handlers/installHandler.test.ts`

### Test File 2: PrerequisitesManager.test.ts

**File:** `tests/features/prerequisites/services/PrerequisitesManager.test.ts`

- [ ] **Test: should execute fnm list with shell option in PrerequisitesManager**
  - **Given:** CommandManager.execute is mocked
  - **When:** PrerequisitesManager checks Node.js installation
  - **Then:** commandManager.execute called with `{ shell: true, timeout: TIMEOUTS.PREREQUISITE_CHECK }`
  - **File:** `tests/features/prerequisites/services/PrerequisitesManager.test.ts`

- [ ] **Test: should successfully detect installed versions via PrerequisitesManager**
  - **Given:** fnm list returns "v20.10.0"
  - **When:** PrerequisitesManager checks Node 20 installation
  - **Then:** Returns installed=true for Node 20
  - **File:** `tests/features/prerequisites/services/PrerequisitesManager.test.ts`

- [ ] **Test: should handle ENOENT errors in PrerequisitesManager gracefully**
  - **Given:** fnm list throws ENOENT
  - **When:** PrerequisitesManager checks Node installation
  - **Then:** Returns installed=false (graceful degradation)
  - **File:** `tests/features/prerequisites/services/PrerequisitesManager.test.ts`

### Test File 3: shared.test.ts

**File:** `tests/features/prerequisites/handlers/shared.test.ts`

- [ ] **Test: should execute fnm list with shell option in shared handler**
  - **Given:** CommandManager.execute is mocked
  - **When:** Shared handler function checks Node versions
  - **Then:** commandManager.execute called with `{ shell: true, timeout: TIMEOUTS.PREREQUISITE_CHECK }`
  - **File:** `tests/features/prerequisites/handlers/shared.test.ts`

- [ ] **Test: should parse fnm list output correctly in shared handler**
  - **Given:** fnm list returns multi-line version output
  - **When:** Shared handler parses versions
  - **Then:** Correctly identifies all installed versions
  - **File:** `tests/features/prerequisites/handlers/shared.test.ts`

### Test File 4: continueHandler.test.ts

**File:** `tests/features/prerequisites/handlers/continueHandler.test.ts`

- [ ] **Test: should execute fnm list with shell option in continue handler**
  - **Given:** CommandManager.execute is mocked
  - **When:** continueHandler validates Node installation
  - **Then:** commandManager.execute called with `{ shell: true, timeout: TIMEOUTS.PREREQUISITE_CHECK }`
  - **File:** `tests/features/prerequisites/handlers/continueHandler.test.ts`

- [ ] **Test: should allow continuation when Node versions installed**
  - **Given:** fnm list returns required Node versions
  - **When:** continueHandler validates prerequisites
  - **Then:** Validation passes and user can continue
  - **File:** `tests/features/prerequisites/handlers/continueHandler.test.ts`

---

## Files to Create/Modify

- [ ] `src/features/prerequisites/handlers/installHandler.ts` - Add `{ shell: true }` to fnm list command (line 102)
- [ ] `src/features/prerequisites/services/PrerequisitesManager.ts` - Add `{ shell: true }` to fnm list command (line 423)
- [ ] `src/features/prerequisites/handlers/shared.ts` - Add `{ shell: true }` to fnm list command (line 124)
- [ ] `src/features/prerequisites/handlers/continueHandler.ts` - Add `{ shell: true }` to fnm list command (line 120)
- [ ] `tests/features/prerequisites/handlers/installHandler.test.ts` - Add/update tests for shell option
- [ ] `tests/features/prerequisites/services/PrerequisitesManager.test.ts` - Add/update tests for shell option
- [ ] `tests/features/prerequisites/handlers/shared.test.ts` - Add/update tests for shell option
- [ ] `tests/features/prerequisites/handlers/continueHandler.test.ts` - Add/update tests for shell option

---

## Implementation Details

### RED Phase (Write Failing Tests First)

#### 1. Create Test Structure for installHandler.test.ts

```typescript
import { installHandler } from '../../../src/features/prerequisites/handlers/installHandler';
import { CommandManager } from '../../../src/shared/command-execution/CommandManager';
import { TIMEOUTS } from '../../../src/shared/constants/timeouts';

// Mock CommandManager
jest.mock('../../../src/shared/command-execution/CommandManager');

describe('installHandler - fnm list with shell option', () => {
  let mockCommandManager: jest.Mocked<CommandManager>;

  beforeEach(() => {
    mockCommandManager = new CommandManager() as jest.Mocked<CommandManager>;
    jest.clearAllMocks();
  });

  it('should execute fnm list with shell option', async () => {
    // Arrange
    mockCommandManager.execute.mockResolvedValue({
      stdout: 'v20.10.0\n',
      stderr: '',
      exitCode: 0
    });

    // Act
    await checkMultipleNodeVersions(['20'], mockCommandManager);

    // Assert
    expect(mockCommandManager.execute).toHaveBeenCalledWith(
      'fnm list',
      expect.objectContaining({
        shell: true,
        timeout: TIMEOUTS.PREREQUISITE_CHECK
      })
    );
  });

  it('should successfully detect installed Node versions', async () => {
    // Arrange
    mockCommandManager.execute.mockResolvedValue({
      stdout: 'v20.10.0\nv24.0.0\n',
      stderr: '',
      exitCode: 0
    });

    // Act
    const result = await checkMultipleNodeVersions(['20', '24'], mockCommandManager);

    // Assert
    expect(result).toEqual([
      { version: 'Node 20', installed: true },
      { version: 'Node 24', installed: true }
    ]);
  });

  it('should handle fnm list failure gracefully', async () => {
    // Arrange
    mockCommandManager.execute.mockRejectedValue(
      new Error('ENOENT: fnm command not found')
    );

    // Act
    const result = await checkMultipleNodeVersions(['20'], mockCommandManager);

    // Assert
    expect(result).toEqual([
      { version: 'Node 20', installed: false }
    ]);
  });

  it('should detect partial installation correctly', async () => {
    // Arrange
    mockCommandManager.execute.mockResolvedValue({
      stdout: 'v20.10.0\n',
      stderr: '',
      exitCode: 0
    });

    // Act
    const result = await checkMultipleNodeVersions(['20', '24'], mockCommandManager);

    // Assert
    expect(result).toEqual([
      { version: 'Node 20', installed: true },
      { version: 'Node 24', installed: false }
    ]);
  });
});
```

#### 2. Repeat Test Structure for Other Files

Apply same test pattern to:
- `PrerequisitesManager.test.ts`
- `shared.test.ts`
- `continueHandler.test.ts`

Each test file should verify:
1. Shell option is passed to execute()
2. Version detection works correctly
3. Error handling is graceful
4. Partial installation detection works

#### 3. Run Tests (Expect Failures - RED Phase)

```bash
npm test -- --testPathPattern=prerequisites/handlers/installHandler
npm test -- --testPathPattern=prerequisites/services/PrerequisitesManager
npm test -- --testPathPattern=prerequisites/handlers/shared
npm test -- --testPathPattern=prerequisites/handlers/continueHandler
```

**Expected Result:** All tests FAIL because `{ shell: true }` is not yet added to the code.

---

### GREEN Phase (Minimal Implementation to Pass Tests)

#### 1. Modify installHandler.ts (Line 102)

**Before:**
```typescript
const fnmListResult = await commandManager.execute('fnm list', {
    timeout: TIMEOUTS.PREREQUISITE_CHECK
});
```

**After:**
```typescript
const fnmListResult = await commandManager.execute('fnm list', {
    timeout: TIMEOUTS.PREREQUISITE_CHECK,
    shell: true  // Add shell context for fnm availability
});
```

#### 2. Modify PrerequisitesManager.ts (Line 423)

**Before:**
```typescript
const fnmListResult = await commandManager.execute('fnm list', {
    timeout: TIMEOUTS.PREREQUISITE_CHECK
});
```

**After:**
```typescript
const fnmListResult = await commandManager.execute('fnm list', {
    timeout: TIMEOUTS.PREREQUISITE_CHECK,
    shell: true  // Add shell context for fnm availability
});
```

#### 3. Modify shared.ts (Line 124)

**Before:**
```typescript
const fnmListResult = await commandManager.execute('fnm list', {
    timeout: TIMEOUTS.PREREQUISITE_CHECK
});
```

**After:**
```typescript
const fnmListResult = await commandManager.execute('fnm list', {
    timeout: TIMEOUTS.PREREQUISITE_CHECK,
    shell: true  // Add shell context for fnm availability
});
```

#### 4. Modify continueHandler.ts (Line 120)

**Before:**
```typescript
const fnmListResult = await commandManager.execute('fnm list', {
    timeout: TIMEOUTS.PREREQUISITE_CHECK
});
```

**After:**
```typescript
const fnmListResult = await commandManager.execute('fnm list', {
    timeout: TIMEOUTS.PREREQUISITE_CHECK,
    shell: true  // Add shell context for fnm availability
});
```

#### 5. Run Tests Again (Expect Success - GREEN Phase)

```bash
npm test -- --testPathPattern=prerequisites
```

**Expected Result:** All tests PASS.

---

### REFACTOR Phase (Improve While Keeping Tests Green)

#### 1. Code Review Checklist

- [ ] All four files have consistent formatting
- [ ] Comments are clear and explain WHY shell option is needed
- [ ] No other changes introduced (minimal change principle)
- [ ] Existing error handling preserved
- [ ] No unused imports added

#### 2. Consistency Check

Verify all four locations use IDENTICAL pattern:
```typescript
const fnmListResult = await commandManager.execute('fnm list', {
    timeout: TIMEOUTS.PREREQUISITE_CHECK,
    shell: true  // Add shell context for fnm availability
});
```

#### 3. Documentation Update (If Needed)

Consider adding inline comment explaining the pattern:
```typescript
// Execute fnm in shell context (fnm is initialized via shell startup scripts)
const fnmListResult = await commandManager.execute('fnm list', {
    timeout: TIMEOUTS.PREREQUISITE_CHECK,
    shell: true
});
```

#### 4. Re-run All Tests

```bash
npm test -- --coverage --testPathPattern=prerequisites
```

**Expected Result:**
- All tests PASS
- Coverage ≥85% for modified functions

---

## Expected Outcome

After completing this step:

✅ **Functionality Working:**
- `fnm list` commands execute successfully without ENOENT errors
- Node.js version detection works reliably across all four handler files
- Installed Node versions are correctly identified

✅ **Tests Passing:**
- All unit tests for the four affected files pass
- Shell option verification tests pass
- Version detection tests pass
- Error handling tests pass

✅ **What Can Be Demonstrated:**
- Run Prerequisites check in VS Code extension
- Observe debug logs showing successful `fnm list` execution
- Verify Node versions display correctly in UI (if Step 2 complete)
- No ENOENT errors in "Demo Builder: Debug" output channel

---

## Acceptance Criteria

### Code Quality
- [ ] All 4 files have `{ shell: true }` added to fnm list commands
- [ ] Code follows project TypeScript style guide
- [ ] No debug code (console.log, debugger statements)
- [ ] Consistent formatting across all four files
- [ ] Inline comments explain WHY shell option is needed

### Testing
- [ ] Tests written BEFORE implementation (TDD RED phase completed)
- [ ] All tests passing after implementation (TDD GREEN phase completed)
- [ ] Test coverage ≥85% for modified functions
- [ ] Edge case tests pass (ENOENT handling, partial installation)
- [ ] All existing tests still pass (no regressions)

### Functionality
- [ ] No ENOENT errors in debug logs when running manual test
- [ ] fnm list executes successfully in all four contexts
- [ ] Installed Node versions detected correctly
- [ ] Error handling still works for genuine failures

### Documentation
- [ ] Inline code comments added explaining shell option
- [ ] Test descriptions clearly explain what is being tested
- [ ] No contradictions with existing documentation

---

## Dependencies

### Runtime Dependencies
- **CommandManager**: Existing service for executing shell commands
- **TIMEOUTS.PREREQUISITE_CHECK**: Existing timeout constant (10000ms)
- **fnm**: Must be installed and available in shell context

### Development Dependencies
- **Jest**: Test framework
- **ts-jest**: TypeScript support for Jest
- **@testing-library**: For React component testing (if needed)

### Prerequisite Checks
- [ ] fnm installed on development machine
- [ ] fnm initialized in shell startup script (~/.zshrc or ~/.bashrc)
- [ ] Test environment can execute shell commands
- [ ] CommandManager properly mocked in test environment

---

## Risk Assessment

### Risk 1: Shell Option Behavior on Windows

- **Category:** Technical/Platform
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** High
- **Description:** The `{ shell: true }` option might behave differently on Windows (cmd.exe vs PowerShell) compared to Unix shells (bash/zsh)
- **Mitigation:**
  1. Existing codebase already uses `{ shell: true }` for fnm version check (proven pattern)
  2. CommandManager abstracts platform differences
  3. fnm officially supports Windows with shell initialization
  4. Add platform-specific tests if Windows support is required
- **Contingency Plan:** If Windows issues arise, implement platform detection and use appropriate shell commands
- **Owner:** Developer implementing this step

### Risk 2: Test Flakiness Due to Real fnm Execution

- **Category:** Technical/Testing
- **Likelihood:** Low
- **Impact:** Low
- **Priority:** Medium
- **Description:** Tests might fail intermittently if fnm behavior changes or if test environment is inconsistent
- **Mitigation:**
  1. Mock CommandManager.execute() in all tests (no real fnm execution in unit tests)
  2. Use controlled mock responses for predictable test results
  3. Integration tests can verify real fnm execution separately
  4. Test isolation ensures no state leakage between tests
- **Contingency Plan:** If flakiness occurs, add retry logic or stabilize test environment setup
- **Owner:** Developer implementing this step

### Risk 3: Breaking Existing Error Handling

- **Category:** Technical/Regression
- **Likelihood:** Low
- **Impact:** Medium
- **Priority:** High
- **Description:** Adding shell option might change error handling behavior (different error codes or messages)
- **Mitigation:**
  1. Existing try-catch blocks preserved (no changes to error handling logic)
  2. Tests verify graceful degradation still works
  3. Add specific test for ENOENT error scenario
  4. Manual testing validates error paths
- **Contingency Plan:** If error handling breaks, adjust catch blocks to handle new error formats
- **Owner:** Developer implementing this step

### Risk 4: Timeout Interaction with Shell Execution

- **Category:** Technical/Performance
- **Likelihood:** Low
- **Impact:** Low
- **Priority:** Low
- **Description:** Shell execution might add overhead that approaches timeout limits
- **Mitigation:**
  1. TIMEOUTS.PREREQUISITE_CHECK is 10000ms (generous for fnm list)
  2. fnm list is a fast operation (<1 second typically)
  3. Shell initialization overhead is minimal (<100ms)
  4. Existing timeout value already accounts for shell execution
- **Contingency Plan:** If timeouts occur, increase TIMEOUTS.PREREQUISITE_CHECK (separate change)
- **Owner:** Developer implementing this step

---

## Estimated Time

**Total Time:** 3-4 hours

**Breakdown:**
- Test writing (RED phase): 1.5 hours
  - installHandler tests: 30 minutes
  - PrerequisitesManager tests: 30 minutes
  - shared/continueHandler tests: 30 minutes
- Implementation (GREEN phase): 30 minutes
  - Four simple one-line changes
  - Run tests to verify
- Refactoring (REFACTOR phase): 30 minutes
  - Code consistency review
  - Comment improvements
  - Documentation updates
- Testing and validation: 1-1.5 hours
  - Coverage analysis
  - Manual testing in extension
  - Edge case verification

---

## Next Steps

After completing Step 1:

1. **Verify All Tests Pass**
   ```bash
   npm test -- --coverage --testPathPattern=prerequisites
   ```

2. **Manual Validation**
   - Open VS Code extension in development mode (F5)
   - Run "Demo Builder: Create New Project" command
   - Navigate to Prerequisites step
   - Check "Demo Builder: Debug" output for successful fnm list execution
   - Verify no ENOENT errors

3. **Proceed to Step 2**
   - Step 2: Fix Substep Display Logic for Node.js Multi-Version Detection
   - Depends on: Step 1 completed (version detection must work first)

4. **Commit Changes**
   - Use descriptive commit message
   - Reference bug fix issue/ticket if applicable
   - Include test coverage report

---

## Implementation Notes

**This section will be updated during TDD implementation.**

### Completed Tasks
- [ ] RED Phase: Tests written and failing
- [ ] GREEN Phase: Implementation complete and tests passing
- [ ] REFACTOR Phase: Code reviewed and improved
- [ ] Coverage validation: ≥85% achieved
- [ ] Manual testing: Extension validated

### Blockers/Issues
(Document any issues encountered during implementation)

### Deviations from Plan
(Document any changes from original plan and rationale)

---

_Step created by Master Feature Planner (Sub-Agent)_
_Status: ✅ Ready for TDD Implementation_
