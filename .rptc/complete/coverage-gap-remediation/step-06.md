# Step 6: Logging Infrastructure Tests

**Purpose**: Add comprehensive tests for logging infrastructure modules (User-Facing priority)

**Prerequisites**:
- [x] Step 5 complete (progressUnifier)
- [x] Existing debugLogger test patterns available for reference

---

## Tests to Write First

### 6.1 ErrorLogger Tests (`tests/core/logging/errorLogger.test.ts`)

**Test File Structure**:
```typescript
// Reuse patterns from debugLogger.testUtils.ts
// Mock vscode status bar, diagnostics collection, window
```

**Test Cases**:

- [ ] **Initialization**
  - [ ] Creates status bar item with correct alignment and command
  - [ ] Creates diagnostic collection named 'demo-builder'
  - [ ] Adds status bar and diagnostics to context subscriptions
  - [ ] Handles DebugLogger not initialized (catches error)

- [ ] **logInfo()**
  - [ ] Logs info message without context
  - [ ] Logs info message with context prefix
  - [ ] No-op when debugLogger unavailable

- [ ] **logWarning()**
  - [ ] Logs warning message via debugLogger.warn()
  - [ ] Increments warning count
  - [ ] Updates status bar with warning icon

- [ ] **logError()**
  - [ ] Logs Error object message
  - [ ] Logs string error message
  - [ ] Includes context prefix when provided
  - [ ] Logs details to debug channel when provided
  - [ ] Increments error count
  - [ ] Updates status bar with error icon
  - [ ] Shows notification for critical errors
  - [ ] Notification "Show Logs" button calls show()

- [ ] **updateStatusBar()**
  - [ ] Shows status bar when errors > 0
  - [ ] Shows status bar when warnings > 0
  - [ ] Hides status bar when both counts are 0
  - [ ] Displays combined error and warning text

- [ ] **clear()**
  - [ ] Clears debugLogger
  - [ ] Resets error and warning counts to 0
  - [ ] Clears diagnostics collection
  - [ ] Hides status bar

- [ ] **show()**
  - [ ] Calls debugLogger.show(false)
  - [ ] No-op when debugLogger unavailable

- [ ] **addDiagnostic()**
  - [ ] Creates diagnostic with provided message and severity
  - [ ] Uses default Range when not provided
  - [ ] Appends to existing diagnostics for URI

- [ ] **dispose()**
  - [ ] Disposes status bar item
  - [ ] Disposes diagnostic collection

**Estimated**: 20 test cases

---

### 6.2 Logger Tests (`tests/core/logging/logger.test.ts`)

**Test File Structure**:
```typescript
// Mock getLogger from debugLogger
// Test backward compatibility wrapper
```

**Test Cases**:

- [ ] **Initialization**
  - [ ] Stores logger name
  - [ ] Gets debugLogger instance via getLogger()
  - [ ] Handles getLogger() throwing (graceful no-op)

- [ ] **setOutputChannel()**
  - [ ] No-op for backward compatibility (doesn't throw)

- [ ] **error()**
  - [ ] Delegates to debugLogger.error()
  - [ ] Passes error object when provided
  - [ ] No-op when debugLogger unavailable

- [ ] **warn()**
  - [ ] Delegates to debugLogger.warn()
  - [ ] Logs additional args to debug channel
  - [ ] No-op when debugLogger unavailable

- [ ] **info()**
  - [ ] Delegates to debugLogger.info()
  - [ ] Logs additional args to debug channel
  - [ ] No-op when debugLogger unavailable

- [ ] **debug()**
  - [ ] Delegates to debugLogger.debug()
  - [ ] Passes args when present
  - [ ] No-op when debugLogger unavailable

- [ ] **trace()**
  - [ ] Delegates to debugLogger.trace()
  - [ ] Passes args when present
  - [ ] No-op when debugLogger unavailable

**Estimated**: 16 test cases

---

### 6.3 StepLogger Tests (`tests/core/logging/stepLogger.test.ts`)

**Test File Structure**:
```typescript
// Mock Logger class
// Mock fs.existsSync and fs.readFileSync
// Test configuration-driven logging
```

**Test Cases**:

- [ ] **Initialization**
  - [ ] Loads default step names
  - [ ] Loads default templates
  - [ ] Overrides defaults with provided wizardSteps
  - [ ] Skips disabled steps (enabled: false)

- [ ] **loadTemplates()**
  - [ ] Returns defaults when no path provided
  - [ ] Returns defaults when file doesn't exist
  - [ ] Loads custom templates from valid JSON file
  - [ ] Falls back to defaults on parse error

- [ ] **getStepName()**
  - [ ] Returns configured name for known step ID
  - [ ] Normalizes 'adobe-auth' to 'adobe-setup'
  - [ ] Creates readable fallback from unknown ID

- [ ] **log()**
  - [ ] Formats message with step name prefix
  - [ ] Routes to correct logger method by level
  - [ ] Defaults to info level

- [ ] **logOperation()**
  - [ ] Logs operation with item when provided
  - [ ] Logs operation without item
  - [ ] Uses specified log level

- [ ] **logStatus()**
  - [ ] Formats count with item name (pluralization)
  - [ ] Formats status with item name (no count)
  - [ ] Logs status alone

- [ ] **logTemplate()**
  - [ ] Finds template by section.key path
  - [ ] Searches both sections for single key
  - [ ] Replaces parameters in template
  - [ ] Creates fallback for missing template
  - [ ] Cleans up unreplaced placeholders

- [ ] **logStepStart()**
  - [ ] Logs to debug level with "Starting" prefix

- [ ] **logStepComplete()**
  - [ ] Logs success with checkmark
  - [ ] Logs failure with X mark

- [ ] **forStep()**
  - [ ] Returns StepLoggerContext bound to step ID
  - [ ] Context delegates to parent methods

- [ ] **getStepLogger() singleton**
  - [ ] Creates and returns singleton instance
  - [ ] Throws when called without logger before initialization
  - [ ] Returns same instance on subsequent calls

- [ ] **StepLoggerContext class**
  - [ ] log() delegates to parent.log()
  - [ ] logOperation() delegates to parent
  - [ ] logStatus() delegates to parent
  - [ ] logTemplate() delegates to parent
  - [ ] logStart() calls parent.logStepStart()
  - [ ] logComplete() calls parent.logStepComplete()

**Estimated**: 28 test cases

---

## Files to Create/Modify

- [ ] `tests/core/logging/errorLogger.test.ts` - New (ErrorLogger tests)
- [ ] `tests/core/logging/logger.test.ts` - New (Logger wrapper tests)
- [ ] `tests/core/logging/stepLogger.test.ts` - New (StepLogger tests)
- [ ] `tests/core/logging/logging.testUtils.ts` - New (shared mocks if needed)

---

## Implementation Details

### Mock Strategy

**ErrorLogger mocks needed**:
```typescript
// Mock debugLogger singleton
jest.mock('@/core/logging/debugLogger', () => ({
  getLogger: jest.fn(),
  DebugLogger: jest.fn(),
}));

// Mock VS Code APIs
const mockStatusBarItem = {
  text: '',
  tooltip: '',
  command: '',
  show: jest.fn(),
  hide: jest.fn(),
  dispose: jest.fn(),
};

const mockDiagnosticCollection = {
  get: jest.fn(),
  set: jest.fn(),
  clear: jest.fn(),
  dispose: jest.fn(),
};
```

**StepLogger mocks needed**:
```typescript
// Mock fs for template loading
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

// Mock Logger class
const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  trace: jest.fn(),
};
```

### TDD Execution

```bash
# Watch mode for logging tests
npm run test:watch -- tests/core/logging

# Single file during development
npm run test:file -- tests/core/logging/errorLogger.test.ts
npm run test:file -- tests/core/logging/logger.test.ts
npm run test:file -- tests/core/logging/stepLogger.test.ts
```

---

## Expected Outcome

- [x] errorLogger.ts coverage: 0% -> 91.2% statements, 80% branches
- [x] logger.ts coverage: 0% -> 96.96% statements, 95% branches
- [x] stepLogger.ts coverage: 0% -> 95.52% statements, 85.71% branches
- [x] All 122 test cases passing (exceeded 64 estimate)
- [x] Reuses existing debugLogger test patterns

---

## Acceptance Criteria

- [x] All tests passing for this step (122/122)
- [x] Coverage meets 85%+ for each file (94.18% overall)
- [x] Tests verify VS Code UI integration (status bar, diagnostics)
- [x] Tests verify configuration-driven behavior (wizard-steps.json, logging.json)
- [x] Mocks properly isolated (no real file system access)
- [x] No debug code (console.log, debugger)

**Estimated Time**: 4-5 hours
