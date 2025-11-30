# Step 5: Create Missing Core Test Directories

## Step Overview

**Purpose:** Establish complete test directory structure mirroring src/core/ by creating directories for modules that currently lack test coverage. This step creates placeholder directories with documentation but deliberately avoids creating empty test files (which violates TDD best practices).

**What This Accomplishes:**
- Creates 5 missing test directories to mirror src/core/ structure
- Documents what should be tested in each directory via README.md files
- Establishes complete tests/core/ structure aligned with source code organization
- Provides guidance for future test development without violating TDD principles
- Verifies complete directory structure alignment between tests/core/ and src/core/

**Files Affected:** 5 new directories created, 5 README.md placeholder files added

**Estimated Time:** 30 minutes

---

## Prerequisites

- [ ] Step 1 completed (core infrastructure tests migrated, initial tests/core/ structure created)
- [ ] Step 2 completed (feature handler tests migrated)
- [ ] Step 3 completed (webview component tests migrated)
- [ ] Step 4 completed (duplicate hook tests consolidated)
- [ ] All tests currently passing (run `npm test` to verify)
- [ ] No uncommitted changes (clean working directory)

---

## Test Strategy

### Approach for This Step

**Important:** This step does NOT create test files. Creating placeholder test files violates TDD best practices (tests should only exist when there's code to test, and code should only exist when there's a failing test). Instead, this step creates directory structure with README.md documentation placeholders.

### Directory Creation Scenarios

#### Happy Path: Directory Structure Created Successfully

**Scenario 1: Create Base Test Directory**
- [ ] **Test:** Verify tests/core/base/ directory created with documentation
  - **Given:** src/core/base/ contains baseCommand.ts, BaseHandlerRegistry.ts, baseWebviewCommand.ts
  - **When:** Creating tests/core/base/ with README.md placeholder
  - **Then:** Directory exists, README.md documents what should be tested
  - **Verification:** `ls tests/core/base/README.md` succeeds

**Scenario 2: Create Config Test Directory**
- [ ] **Test:** Verify tests/core/config/ directory created with documentation
  - **Given:** src/core/config/ contains ConfigurationLoader.ts
  - **When:** Creating tests/core/config/ with README.md placeholder
  - **Then:** Directory exists, README.md documents configuration loading test requirements
  - **Verification:** `ls tests/core/config/README.md` succeeds

**Scenario 3: Create DI Test Directory**
- [ ] **Test:** Verify tests/core/di/ directory created with documentation
  - **Given:** src/core/di/ contains serviceLocator.ts
  - **When:** Creating tests/core/di/ with README.md placeholder
  - **Then:** Directory exists, README.md documents dependency injection test requirements
  - **Verification:** `ls tests/core/di/README.md` succeeds

**Scenario 4: Create Logging Test Directory**
- [ ] **Test:** Verify tests/core/logging/ directory created with documentation
  - **Given:** src/core/logging/ contains debugLogger.ts, errorLogger.ts, logger.ts, stepLogger.ts
  - **When:** Creating tests/core/logging/ with README.md placeholder
  - **Then:** Directory exists, README.md documents all 4 logger modules test requirements
  - **Verification:** `ls tests/core/logging/README.md` succeeds

**Scenario 5: Create VSCode Test Directory**
- [ ] **Test:** Verify tests/core/vscode/ directory created with documentation
  - **Given:** src/core/vscode/ contains StatusBarManager.ts
  - **When:** Creating tests/core/vscode/ with README.md placeholder
  - **Then:** Directory exists, README.md documents VS Code integration test requirements
  - **Verification:** `ls tests/core/vscode/README.md` succeeds

**Scenario 6: Complete Structure Alignment**
- [ ] **Test:** Verify tests/core/ structure matches src/core/ structure
  - **Given:** All 5 missing directories created with README.md files
  - **When:** Comparing directory structures
  - **Then:** Every src/core/* directory has corresponding tests/core/* directory
  - **Verification:** Structure comparison script shows 1:1 alignment

#### Edge Cases: Directory Verification and Documentation Quality

**Edge Case 1: Directory Already Exists (Partial Completion)**
- [ ] **Test:** Handle scenario where some directories already exist
  - **Given:** tests/core/base/ might exist from manual creation
  - **When:** Running mkdir -p commands
  - **Then:** mkdir -p succeeds (idempotent), README.md created if missing
  - **Verification:** All 5 directories exist with README.md files regardless of initial state

**Edge Case 2: README.md Already Exists**
- [ ] **Test:** Handle existing README.md files
  - **Given:** README.md might exist from previous manual documentation
  - **When:** Creating new README.md
  - **Then:** Backup existing file before overwriting, or append note if content differs
  - **Verification:** No existing documentation lost

**Edge Case 3: Git Tracking of Empty Directories**
- [ ] **Test:** Ensure empty directories tracked by git
  - **Given:** Git doesn't track empty directories
  - **When:** Creating directories with README.md files
  - **Then:** Git tracks directories via README.md files
  - **Verification:** `git status` shows new files, directories appear in git ls-files

#### Error Conditions: Filesystem and Permission Issues

**Error Condition 1: Permission Denied Creating Directories**
- [ ] **Test:** Detect permission errors during directory creation
  - **Given:** Insufficient filesystem permissions
  - **When:** Running mkdir -p commands
  - **Then:** Clear error message indicating permission issue
  - **Recovery:** Run with appropriate permissions, verify directory ownership
  - **Verification:** mkdir succeeds after permission fix

**Error Condition 2: README.md Write Failures**
- [ ] **Test:** Detect file write errors
  - **Given:** Disk full or permission issues
  - **When:** Writing README.md files
  - **Then:** Clear error message indicating write failure
  - **Recovery:** Check disk space, verify write permissions, retry
  - **Verification:** All 5 README.md files exist and contain expected content

---

## Implementation Details

### Phase 1: Pre-Creation Validation

**Verify Current State**

Run these commands to understand current test structure:

```bash
# Verify Steps 1-4 completed
echo "=== Verify previous steps completed ==="
ls tests/core/communication/ 2>&1 | grep -E "(test\.ts|No such)" # Step 1 result
ls tests/core/state/ 2>&1 | grep -E "(test\.ts|No such)" # Step 1 result
ls tests/core/shell/ 2>&1 | grep -E "(test\.ts|No such)" # Step 1 result
ls tests/features/lifecycle/handlers/ 2>&1 | grep -E "(test\.ts|No such)" # Step 2 result
ls tests/webview-ui/shared/components/ 2>&1 | grep -E "(test\.tsx|No such)" # Step 3 result
ls tests/webview-ui/shared/hooks/ | wc -l # Step 4 result (should be 12)

# Verify all tests currently pass
npm test

# Verify no uncommitted changes
git status

# List current tests/core/ structure
echo ""
echo "=== Current tests/core/ structure ==="
ls -la tests/core/

# Compare with src/core/ structure
echo ""
echo "=== Source src/core/ structure ==="
ls -la src/core/

# Identify missing test directories
echo ""
echo "=== Missing test directories (should show 5) ==="
comm -23 <(ls src/core/ | grep -v "\.ts" | sort) <(ls tests/core/ 2>/dev/null | sort)
```

**Expected Results:**
- Previous steps show completed migrations (tests exist in new locations)
- All tests passing (npm test exits with code 0)
- Clean working directory (git status shows "nothing to commit")
- tests/core/ currently has: commands, validation (and others from Step 1 if executed)
- Missing directories identified: base, config, di, logging, vscode

### Phase 2: Create Missing Test Directory Structure

**Create 5 missing directories for core modules without tests:**

**2A: Create Base Test Directory**
```bash
# Create directory
mkdir -p tests/core/base

# Verify creation
ls -ld tests/core/base/

# Expected: Directory exists with drwxr-xr-x permissions
```

**2B: Create Config Test Directory**
```bash
# Create directory
mkdir -p tests/core/config

# Verify creation
ls -ld tests/core/config/

# Expected: Directory exists
```

**2C: Create DI Test Directory**
```bash
# Create directory
mkdir -p tests/core/di

# Verify creation
ls -ld tests/core/di/

# Expected: Directory exists
```

**2D: Create Logging Test Directory**
```bash
# Create directory
mkdir -p tests/core/logging

# Verify creation
ls -ld tests/core/logging/

# Expected: Directory exists
```

**2E: Create VSCode Test Directory**
```bash
# Create directory
mkdir -p tests/core/vscode

# Verify creation
ls -ld tests/core/vscode/

# Expected: Directory exists
```

**Expected Results After Phase 2:**
- 5 new directories created in tests/core/
- All directories have correct permissions
- mkdir -p is idempotent (safe to run multiple times)
- No errors during creation

### Phase 3: Create README.md Documentation Placeholders

**Document what should be tested in each directory without creating placeholder test files:**

**3A: Create Base README.md**
```bash
cat > tests/core/base/README.md << 'EOF'
# Core Base Module Tests

**Status:** 🔴 No tests currently exist for this module

**Purpose:** This directory will contain tests for base infrastructure classes that provide common functionality for commands and webview interactions.

## Modules to Test

### 1. baseCommand.ts
**What to test:**
- Command initialization and lifecycle
- Common command properties and methods
- Error handling in base command execution
- Integration with VS Code command system

**Test file:** `baseCommand.test.ts`

**Suggested test structure:**
```typescript
describe('BaseCommand', () => {
  describe('initialization', () => {
    it('should initialize with correct command ID')
    it('should register command with VS Code')
  })

  describe('execution', () => {
    it('should execute command logic')
    it('should handle execution errors gracefully')
  })
})
```

### 2. BaseHandlerRegistry.ts
**What to test:**
- Handler registration and retrieval
- Duplicate handler detection
- Handler removal
- Type safety of registered handlers

**Test file:** `BaseHandlerRegistry.test.ts`

**Suggested test structure:**
```typescript
describe('BaseHandlerRegistry', () => {
  describe('registration', () => {
    it('should register handler for message type')
    it('should prevent duplicate handler registration')
  })

  describe('retrieval', () => {
    it('should retrieve registered handler')
    it('should return undefined for unregistered handler')
  })
})
```

### 3. baseWebviewCommand.ts
**What to test:**
- Webview panel creation and lifecycle
- Message passing infrastructure setup
- Handler registration integration
- Webview disposal and cleanup

**Test file:** `baseWebviewCommand.test.ts`

**Suggested test structure:**
```typescript
describe('BaseWebviewCommand', () => {
  describe('webview creation', () => {
    it('should create webview panel with correct options')
    it('should set up message passing')
  })

  describe('message handling', () => {
    it('should register message handlers')
    it('should route messages to correct handlers')
  })

  describe('cleanup', () => {
    it('should dispose webview on command completion')
    it('should clean up message handlers')
  })
})
```

## Test Coverage Goals

- **Overall Target:** 85%+
- **Critical Paths:** 100% (command registration, message routing)
- **Edge Cases:** Error handling, disposal, lifecycle management

## Dependencies for Testing

- VS Code test framework (`@vscode/test-electron`)
- Mock webview panel creation
- Message passing test utilities
- Path aliases: `@/core/base/*`

## Notes

- Base classes are foundational - comprehensive testing critical
- Focus on integration between base classes and VS Code APIs
- Mock VS Code APIs to isolate base class logic
- Test error propagation and handling thoroughly

## When to Create Tests

Create tests when:
1. Refactoring base classes (TDD: write tests first)
2. Adding new base class functionality
3. Debugging issues in command/webview infrastructure
4. Coverage drops below 80% for core modules

**TDD Reminder:** Write tests BEFORE implementing changes to these modules.
EOF

# Verify creation
cat tests/core/base/README.md
```

**3B: Create Config README.md**
```bash
cat > tests/core/config/README.md << 'EOF'
# Core Configuration Module Tests

**Status:** 🔴 No tests currently exist for this module

**Purpose:** This directory will contain tests for configuration loading and management.

## Modules to Test

### 1. ConfigurationLoader.ts
**What to test:**
- Configuration file loading (JSON parsing)
- Default value handling
- Configuration merging (defaults + user overrides)
- Error handling for malformed configuration
- File path resolution

**Test file:** `ConfigurationLoader.test.ts`

**Suggested test structure:**
```typescript
describe('ConfigurationLoader', () => {
  describe('loading', () => {
    it('should load valid JSON configuration file')
    it('should apply default values for missing keys')
    it('should handle malformed JSON gracefully')
  })

  describe('merging', () => {
    it('should merge user config with defaults')
    it('should prioritize user values over defaults')
  })

  describe('error handling', () => {
    it('should handle missing configuration files')
    it('should validate configuration schema')
  })
})
```

## Test Coverage Goals

- **Overall Target:** 90%+ (configuration is critical infrastructure)
- **Critical Paths:** 100% (file loading, parsing, error handling)
- **Edge Cases:** Malformed JSON, missing files, invalid values

## Dependencies for Testing

- Mock filesystem (`fs` module mocking)
- Test configuration fixtures
- Path aliases: `@/core/config/*`

## Notes

- Configuration loading affects entire extension - thorough testing essential
- Test with various JSON structures (valid, invalid, edge cases)
- Mock file I/O to avoid dependency on filesystem state
- Test error messages are clear and actionable

## When to Create Tests

Create tests when:
1. Adding new configuration options
2. Changing configuration loading logic
3. Debugging configuration-related bugs
4. Implementing configuration validation

**TDD Reminder:** Write tests BEFORE implementing configuration changes.
EOF

# Verify creation
cat tests/core/config/README.md
```

**3C: Create DI README.md**
```bash
cat > tests/core/di/README.md << 'EOF'
# Core Dependency Injection Module Tests

**Status:** 🔴 No tests currently exist for this module

**Purpose:** This directory will contain tests for dependency injection and service location.

## Modules to Test

### 1. serviceLocator.ts
**What to test:**
- Service registration
- Service retrieval
- Singleton vs transient service lifecycle
- Dependency resolution
- Circular dependency detection
- Service disposal/cleanup

**Test file:** `serviceLocator.test.ts`

**Suggested test structure:**
```typescript
describe('ServiceLocator', () => {
  describe('registration', () => {
    it('should register service factory')
    it('should register singleton service')
    it('should prevent duplicate registration')
  })

  describe('retrieval', () => {
    it('should return registered service instance')
    it('should return same instance for singleton')
    it('should return new instance for transient')
    it('should throw for unregistered service')
  })

  describe('dependency resolution', () => {
    it('should resolve service dependencies')
    it('should detect circular dependencies')
  })

  describe('cleanup', () => {
    it('should dispose all services')
    it('should call dispose on disposable services')
  })
})
```

## Test Coverage Goals

- **Overall Target:** 90%+ (DI is core infrastructure)
- **Critical Paths:** 100% (service resolution, lifecycle management)
- **Edge Cases:** Circular dependencies, disposal order, missing services

## Dependencies for Testing

- Mock service implementations
- Disposable service test doubles
- Path aliases: `@/core/di/*`

## Notes

- Service locator pattern central to extension architecture
- Test various service lifecycle scenarios (singleton, transient)
- Verify proper cleanup on disposal
- Test error handling for missing/circular dependencies

## When to Create Tests

Create tests when:
1. Adding new services to locator
2. Changing service lifecycle management
3. Debugging service resolution issues
4. Implementing new DI features

**TDD Reminder:** Write tests BEFORE implementing DI changes.
EOF

# Verify creation
cat tests/core/di/README.md
```

**3D: Create Logging README.md**
```bash
cat > tests/core/logging/README.md << 'EOF'
# Core Logging Module Tests

**Status:** 🔴 No tests currently exist for this module

**Purpose:** This directory will contain tests for logging infrastructure (debug, error, step logging).

## Modules to Test

### 1. logger.ts
**What to test:**
- Log message formatting
- Log level filtering
- Output channel integration
- Timestamp generation

**Test file:** `logger.test.ts`

### 2. debugLogger.ts
**What to test:**
- Debug message logging
- Debug channel creation
- Debug context tracking
- Conditional debug logging (enabled/disabled)

**Test file:** `debugLogger.test.ts`

### 3. errorLogger.ts
**What to test:**
- Error logging with stack traces
- Error formatting
- Error categorization
- Integration with VS Code error notifications

**Test file:** `errorLogger.test.ts`

### 4. stepLogger.ts
**What to test:**
- Step-based logging (wizard steps, prerequisites, etc.)
- Configuration-driven message templates
- Step context management
- Progress tracking integration

**Test file:** `stepLogger.test.ts`

**Suggested test structure (example for stepLogger):**
```typescript
describe('StepLogger', () => {
  describe('step logging', () => {
    it('should log step start with template')
    it('should log step completion')
    it('should log step errors with context')
  })

  describe('template loading', () => {
    it('should load message templates from config')
    it('should handle missing templates gracefully')
  })

  describe('context tracking', () => {
    it('should track current step context')
    it('should clear context on step completion')
  })
})
```

## Test Coverage Goals

- **Overall Target:** 85%+
- **Critical Paths:** 100% (error logging, step tracking)
- **Edge Cases:** Missing templates, null contexts, output channel failures

## Dependencies for Testing

- Mock VS Code output channels
- Mock configuration loader
- Test message templates
- Path aliases: `@/core/logging/*`

## Notes

- Logging critical for debugging - thorough testing essential
- Mock output channels to avoid VS Code API dependencies
- Test message formatting and template substitution
- Verify error handling doesn't throw (logging should never crash)

## When to Create Tests

Create tests when:
1. Adding new logging functionality
2. Changing log message formats
3. Debugging logging-related issues
4. Implementing new loggers (e.g., performance logger)

**TDD Reminder:** Write tests BEFORE implementing logging changes.
EOF

# Verify creation
cat tests/core/logging/README.md
```

**3E: Create VSCode README.md**
```bash
cat > tests/core/vscode/README.md << 'EOF'
# Core VS Code Integration Module Tests

**Status:** 🔴 No tests currently exist for this module

**Purpose:** This directory will contain tests for VS Code API integrations and UI components.

## Modules to Test

### 1. StatusBarManager.ts
**What to test:**
- Status bar item creation
- Status bar updates (text, tooltip, icon)
- Status bar commands (click handlers)
- Status bar disposal/cleanup
- Status bar visibility toggling

**Test file:** `StatusBarManager.test.ts`

**Suggested test structure:**
```typescript
describe('StatusBarManager', () => {
  describe('initialization', () => {
    it('should create status bar item with correct alignment')
    it('should set initial text and tooltip')
  })

  describe('updates', () => {
    it('should update status bar text')
    it('should update tooltip')
    it('should update icon')
  })

  describe('commands', () => {
    it('should register click command')
    it('should execute command on click')
  })

  describe('visibility', () => {
    it('should show status bar item')
    it('should hide status bar item')
  })

  describe('cleanup', () => {
    it('should dispose status bar item')
  })
})
```

## Test Coverage Goals

- **Overall Target:** 85%+
- **Critical Paths:** 100% (status bar updates, command handling)
- **Edge Cases:** Rapid updates, disposal during updates, missing icons

## Dependencies for Testing

- Mock VS Code status bar API
- Mock VS Code window API
- Mock command registration
- Path aliases: `@/core/vscode/*`

## Notes

- VS Code integrations require extensive mocking
- Test state management (visibility, text, commands)
- Verify proper disposal to prevent memory leaks
- Test command registration and execution flow

## When to Create Tests

Create tests when:
1. Adding new VS Code UI integrations
2. Changing status bar behavior
3. Debugging VS Code API issues
4. Implementing new VS Code features (progress indicators, notifications, etc.)

**TDD Reminder:** Write tests BEFORE implementing VS Code integration changes.
EOF

# Verify creation
cat tests/core/vscode/README.md
```

**Expected Results After Phase 3:**
- 5 README.md files created, one in each new directory
- Each README.md documents the modules to test
- Each README.md provides suggested test structure
- Each README.md explains testing approach and coverage goals
- All README.md files emphasize TDD principles

### Phase 4: Verify Directory Structure Alignment

**Compare tests/core/ with src/core/ to ensure complete mirroring:**

```bash
# List all src/core/ directories
echo "=== Source directories (src/core/) ==="
ls -1 src/core/ | grep -v "\.ts"

# List all tests/core/ directories
echo ""
echo "=== Test directories (tests/core/) ==="
ls -1 tests/core/

# Verify 1:1 alignment (should show no differences)
echo ""
echo "=== Directories in src/core/ but not tests/core/ (should be empty) ==="
comm -23 <(ls -1 src/core/ | grep -v "\.ts" | sort) <(ls -1 tests/core/ | sort)

echo ""
echo "=== Directories in tests/core/ but not src/core/ (should be empty) ==="
comm -13 <(ls -1 src/core/ | grep -v "\.ts" | sort) <(ls -1 tests/core/ | sort)

# Count directories to verify completeness
echo ""
echo "=== Directory counts (should be equal) ==="
echo "src/core/ directories: $(ls -1 src/core/ | grep -v "\.ts" | wc -l)"
echo "tests/core/ directories: $(ls -1 tests/core/ | wc -l)"
```

**Expected Results:**
- All src/core/ directories have corresponding tests/core/ directories
- No extra directories in tests/core/ that don't exist in src/core/
- Directory counts match (11 directories total)
- Complete 1:1 structural alignment achieved

**Directory Alignment Expected:**
```
src/core/base         ←→ tests/core/base
src/core/commands     ←→ tests/core/commands
src/core/communication ←→ tests/core/communication
src/core/config       ←→ tests/core/config
src/core/di           ←→ tests/core/di
src/core/logging      ←→ tests/core/logging
src/core/shell        ←→ tests/core/shell
src/core/state        ←→ tests/core/state
src/core/utils        ←→ tests/core/utils
src/core/validation   ←→ tests/core/validation
src/core/vscode       ←→ tests/core/vscode
```

### Phase 5: Verify No Placeholder Test Files Created

**Important:** Confirm this step did NOT create empty test files (violates TDD):**

```bash
# Verify no .test.ts files in new directories
echo "=== Checking for test files in new directories (should be empty) ==="
find tests/core/base tests/core/config tests/core/di tests/core/logging tests/core/vscode -name "*.test.ts" 2>/dev/null

# Should output nothing (no test files)

# Verify only README.md files exist in new directories
echo ""
echo "=== Files in new directories (should only show README.md) ==="
ls -la tests/core/base/
ls -la tests/core/config/
ls -la tests/core/di/
ls -la tests/core/logging/
ls -la tests/core/vscode/
```

**Expected Results:**
- No .test.ts files found in new directories
- Only README.md files exist
- No placeholder test files violating TDD principles
- Documentation provides guidance without creating untested code

### Phase 6: Run Existing Test Suite

**Verify existing tests still pass after directory creation:**

```bash
# Run all tests (should still pass, no changes to test files)
npm test

# Verify test count unchanged (directory creation doesn't add tests)
find tests -name "*.test.ts" -o -name "*.test.tsx" | wc -l

# Expected: Same count as after Step 4 (91 files)
```

**Expected Results:**
- All tests pass (npm test exits with code 0)
- Test count: 91 files (unchanged from Step 4)
- No test failures introduced by directory creation
- No new tests added (only structure created)

### Phase 7: Commit Directory Structure

**Create atomic commit for this structure creation step:**

```bash
# Stage all changes (new directories and README.md files)
git add tests/core/base/
git add tests/core/config/
git add tests/core/di/
git add tests/core/logging/
git add tests/core/vscode/

# Verify what will be committed
git status

# Expected changes:
# - 5 new directories added
# - 5 README.md files added
# - No test files added

# Create commit with descriptive message
git commit -m "test: create missing core test directory structure (Step 5)

- Create 5 missing test directories to mirror src/core/ structure:
  - tests/core/base/ (for baseCommand, BaseHandlerRegistry, baseWebviewCommand)
  - tests/core/config/ (for ConfigurationLoader)
  - tests/core/di/ (for serviceLocator)
  - tests/core/logging/ (for debugLogger, errorLogger, logger, stepLogger)
  - tests/core/vscode/ (for StatusBarManager)
- Add README.md documentation in each directory
  - Documents what should be tested
  - Provides suggested test structure
  - Explains coverage goals and dependencies
  - Emphasizes TDD principles (tests first)
- Deliberately NO placeholder test files created (violates TDD)
- Complete 1:1 structural alignment: tests/core/ mirrors src/core/
- All existing tests passing (no test files changed)

Directory structure: 11 core directories, all with corresponding test directories
Test count: 91 files (unchanged, only structure added)
Coverage: Maintained at 80%+

Part of test reorganization plan (Step 5/7)"
```

**Expected Results:**
- Single atomic commit with all structural changes
- Commit message clearly describes directory creation and documentation
- Git tracks new directories via README.md files
- Clean working directory after commit
- No test file changes (only directory structure)

---

## Detailed Directory Creation Map

### Directories to CREATE (Currently Missing Test Coverage)

| Source Directory | Test Directory | Source Files | README Purpose |
|-----------------|----------------|--------------|----------------|
| `src/core/base/` | `tests/core/base/` | baseCommand.ts, BaseHandlerRegistry.ts, baseWebviewCommand.ts | Document base class testing requirements |
| `src/core/config/` | `tests/core/config/` | ConfigurationLoader.ts | Document configuration loading test strategy |
| `src/core/di/` | `tests/core/di/` | serviceLocator.ts | Document dependency injection test approach |
| `src/core/logging/` | `tests/core/logging/` | debugLogger.ts, errorLogger.ts, logger.ts, stepLogger.ts | Document logging infrastructure test requirements |
| `src/core/vscode/` | `tests/core/vscode/` | StatusBarManager.ts | Document VS Code integration test strategy |

### Files to CREATE (Documentation Placeholders)

| File Path | Purpose | Contents |
|-----------|---------|----------|
| `tests/core/base/README.md` | Document base class testing | Module descriptions, test structure suggestions, coverage goals |
| `tests/core/config/README.md` | Document config testing | Configuration loading test scenarios, error handling |
| `tests/core/di/README.md` | Document DI testing | Service registration/retrieval tests, lifecycle management |
| `tests/core/logging/README.md` | Document logging testing | Logger test requirements for all 4 modules |
| `tests/core/vscode/README.md` | Document VS Code integration testing | Status bar manager test scenarios |

### Complete tests/core/ Structure After Step 5

```
tests/core/
├── base/              [NEW - Step 5]
│   └── README.md      [Documentation placeholder]
├── commands/          [Existing]
│   └── (test files)
├── communication/     [Created in Step 1]
│   └── webviewCommunicationManager.test.ts
├── config/            [NEW - Step 5]
│   └── README.md      [Documentation placeholder]
├── di/                [NEW - Step 5]
│   └── README.md      [Documentation placeholder]
├── logging/           [NEW - Step 5]
│   └── README.md      [Documentation placeholder]
├── shell/             [Created in Step 1]
│   ├── pollingService.test.ts
│   ├── resourceLocker.test.ts
│   └── retryStrategyManager.test.ts
├── state/             [Created in Step 1]
│   └── stateManager.test.ts
├── utils/             [Created in Step 1]
│   └── timeoutConfig.test.ts
├── validation/        [Existing]
│   ├── fieldValidation.test.ts
│   └── securityValidation.test.ts
└── vscode/            [NEW - Step 5]
    └── README.md      [Documentation placeholder]
```

### Why No Placeholder Test Files?

**TDD Principle Violation:**
- Placeholder test files with no assertions violate TDD
- Tests should only exist when there's code to test
- Code should only exist when there's a failing test

**Proper TDD Workflow:**
1. **RED:** Write failing test for new functionality
2. **GREEN:** Implement minimal code to pass test
3. **REFACTOR:** Improve code while keeping tests green

**Creating placeholder tests violates this by:**
- Creating tests with no implementation to test
- Creating implementation with no failing test first
- Encouraging "fill in the blanks" instead of TDD

**README.md Approach:**
- Documents what SHOULD be tested (guidance)
- Provides suggested test structure (templates)
- Doesn't create untested code
- Maintains TDD discipline

---

## Expected Outcome

**After Successful Completion:**

- [ ] **Directory Count:** 11 directories in tests/core/ (5 new + 6 existing)
- [ ] **Directory Alignment:** Complete 1:1 mirror of src/core/ structure
- [ ] **Documentation:** 5 README.md files documenting test requirements
- [ ] **No Test Files Added:** Only documentation, no placeholder tests
- [ ] **All Tests Passing:** `npm test` succeeds (existing tests unchanged)
- [ ] **Test Count:** 91 files (unchanged from Step 4)
- [ ] **Git Tracked:** All new directories tracked via README.md files
- [ ] **TDD Compliance:** No violation of test-first principles

**What Works After This Step:**
- Complete test directory structure mirrors source code organization
- Clear documentation for future test development
- TDD guidance available for all core modules
- Foundation for comprehensive core module testing
- Alignment verification script available for ongoing maintenance

**New Directories Created:**
1. tests/core/base/ - Base class infrastructure testing (3 modules)
2. tests/core/config/ - Configuration loading testing (1 module)
3. tests/core/di/ - Dependency injection testing (1 module)
4. tests/core/logging/ - Logging infrastructure testing (4 modules)
5. tests/core/vscode/ - VS Code integration testing (1 module)

---

## Acceptance Criteria

- [ ] All existing tests passing (`npm test` succeeds)
- [ ] Test count: 91 files (unchanged from Step 4)
- [ ] 5 new directories created in tests/core/
- [ ] 5 README.md files created (one per new directory)
- [ ] No .test.ts files in new directories (TDD compliance)
- [ ] Complete 1:1 alignment: tests/core/ mirrors src/core/
- [ ] Each README.md documents modules to test, coverage goals, and TDD approach
- [ ] Directory structure verification script confirms alignment
- [ ] All new directories tracked by git (via README.md files)
- [ ] Single atomic commit with descriptive message
- [ ] No test failures or broken imports
- [ ] No violations of TDD principles (no placeholder tests)

---

## Dependencies

**Files This Step Depends On:**
- src/core/base/*.ts (3 source files - determines what to document)
- src/core/config/*.ts (1 source file - determines what to document)
- src/core/di/*.ts (1 source file - determines what to document)
- src/core/logging/*.ts (4 source files - determines what to document)
- src/core/vscode/*.ts (1 source file - determines what to document)

**Files This Step Modifies:**
- None (only creates new directories and documentation)

**Files This Step Creates:**
- tests/core/base/ (directory)
- tests/core/base/README.md (documentation)
- tests/core/config/ (directory)
- tests/core/config/README.md (documentation)
- tests/core/di/ (directory)
- tests/core/di/README.md (documentation)
- tests/core/logging/ (directory)
- tests/core/logging/README.md (documentation)
- tests/core/vscode/ (directory)
- tests/core/vscode/README.md (documentation)

**Files This Step Does NOT Modify:**
- Any existing test files (pure structure creation)
- jest.config.js (no changes needed)
- tsconfig.json (no changes needed)
- Any source files in src/core/ (documentation only)

**Subsequent Steps That Depend on This:**
- Step 6: Jest config final update (references complete structure)
- Step 7: Documentation update (references complete test organization)
- Future test development (uses README.md guidance)

---

## Rollback Plan

**If This Step Fails:**

**Immediate Rollback (Before Commit):**
```bash
# Remove all created directories and files
rm -rf tests/core/base/
rm -rf tests/core/config/
rm -rf tests/core/di/
rm -rf tests/core/logging/
rm -rf tests/core/vscode/

# Verify clean state
git status
npm test

# Verify directories removed
ls tests/core/
```

**Rollback After Commit:**
```bash
# Find commit hash for this step
git log --oneline | head -5

# Revert commit (preserves history)
git revert <commit-hash>

# OR reset to previous commit (destructive)
git reset --hard HEAD~1

# Verify tests pass
npm test

# Verify directories removed
ls tests/core/
```

**Partial Rollback (Remove Specific Directory):**
```bash
# Remove specific directory if problematic
git rm -r tests/core/base/

# Verify removal
ls tests/core/

# Re-commit if needed
git commit -m "Remove problematic test directory"
```

**Validation After Rollback:**
- [ ] All tests passing
- [ ] tests/core/ has original directory count (6 after Step 1-4)
- [ ] No README.md files in removed directories
- [ ] No uncommitted changes
- [ ] Test count: 91 files (unchanged)

---

## Common Issues and Solutions

### Issue 1: Directory Already Exists

**Symptom:** mkdir -p succeeds but README.md conflicts with existing file

**Cause:** Manual directory creation or partial completion

**Solution:**
```bash
# Check if README.md exists
ls -la tests/core/base/README.md

# If exists, backup before overwriting
cp tests/core/base/README.md tests/core/base/README.md.backup

# Create new README.md
cat > tests/core/base/README.md << 'EOF'
[content]
EOF

# Compare with backup if needed
diff tests/core/base/README.md.backup tests/core/base/README.md
```

### Issue 2: Permission Denied

**Symptom:** mkdir or file creation fails with "Permission denied"

**Cause:** Insufficient filesystem permissions

**Solution:**
```bash
# Check directory permissions
ls -ld tests/core/

# Should show drwxr-xr-x (755) or similar

# If permission denied, check ownership
ls -la tests/

# Fix ownership if needed (replace USER with your username)
sudo chown -R USER:USER tests/

# Retry directory creation
mkdir -p tests/core/base
```

### Issue 3: Git Not Tracking Empty Directories

**Symptom:** git status doesn't show new directories

**Cause:** Git doesn't track empty directories

**Solution:**
```bash
# Verify README.md files exist (they make directories trackable)
ls tests/core/base/README.md
ls tests/core/config/README.md
ls tests/core/di/README.md
ls tests/core/logging/README.md
ls tests/core/vscode/README.md

# Add files to git
git add tests/core/*/README.md

# Verify tracking
git status
```

### Issue 4: README.md Content Incorrect

**Symptom:** README.md doesn't document correct modules

**Cause:** Typo in module names or file paths

**Solution:**
```bash
# Verify source files exist
ls src/core/base/
# Should show: baseCommand.ts, BaseHandlerRegistry.ts, baseWebviewCommand.ts

# Update README.md to match actual files
# Edit tests/core/base/README.md to correct module names

# Verify all module names match source files
grep -E "\.ts" tests/core/base/README.md
```

### Issue 5: Structure Alignment Verification Fails

**Symptom:** Alignment script shows directories in src/core/ but not tests/core/

**Cause:** Directory creation incomplete or failed

**Solution:**
```bash
# Run alignment check
comm -23 <(ls -1 src/core/ | grep -v "\.ts" | sort) <(ls -1 tests/core/ | sort)

# Output shows missing directories, create them:
# If shows "base", create: mkdir -p tests/core/base && touch tests/core/base/README.md
# If shows "config", create: mkdir -p tests/core/config && touch tests/core/config/README.md
# etc.

# Re-run alignment check until empty
comm -23 <(ls -1 src/core/ | grep -v "\.ts" | sort) <(ls -1 tests/core/ | sort)
# Should output nothing (complete alignment)
```

---

## Cross-References

**Related Plan Sections:**
- overview.md: Overall test reorganization strategy
- overview.md File Reference Map: Lists missing test directories
- Step 1: Utils test migration (created initial tests/core/ structure)
- Step 6: Jest config update (integrates complete structure)
- Step 7: Documentation update (references complete test organization)

**Related Documentation:**
- src/core/base/README.md: Base class documentation
- src/core/logging/README.md: Logging system documentation
- docs/testing/README.md: Testing strategy (to be updated in Step 7)
- docs/architecture/: Architecture documentation (references core modules)

**Related Source Files:**
- src/core/base/*.ts (3 modules without tests)
- src/core/config/ConfigurationLoader.ts (module without tests)
- src/core/di/serviceLocator.ts (module without tests)
- src/core/logging/*.ts (4 modules without tests)
- src/core/vscode/StatusBarManager.ts (module without tests)

---

## Verification Commands Summary

**Quick validation checklist:**

```bash
# 1. Pre-creation validation
npm test && git status
ls -1 tests/core/ | wc -l  # Count existing directories

# 2. Post-creation validation
ls -1 tests/core/ | wc -l  # Should be 11 (6 existing + 5 new)
npm test  # Should still pass (no test files changed)

# 3. Verify directory structure
ls -R tests/core/base/  # Should show only README.md
ls -R tests/core/config/  # Should show only README.md
ls -R tests/core/di/  # Should show only README.md
ls -R tests/core/logging/  # Should show only README.md
ls -R tests/core/vscode/  # Should show only README.md

# 4. Verify alignment
comm -23 <(ls -1 src/core/ | grep -v "\.ts" | sort) <(ls -1 tests/core/ | sort)
# Should output nothing (complete alignment)

# 5. Verify no test files created
find tests/core/base tests/core/config tests/core/di tests/core/logging tests/core/vscode -name "*.test.ts" 2>/dev/null
# Should output nothing (no test files)

# 6. Verify git tracking
git status
# Should show 5 new README.md files

# 7. Verify README.md content
head -5 tests/core/base/README.md
head -5 tests/core/config/README.md
head -5 tests/core/di/README.md
head -5 tests/core/logging/README.md
head -5 tests/core/vscode/README.md
# Each should show module documentation headers
```

---

_Step 5 implementation ready for TDD execution_
_Previous Step: Step 4 - Consolidate duplicate hook tests (completed)_
_Next Step: Step 6 - Update Jest configuration for complete test structure (step-06.md)_
