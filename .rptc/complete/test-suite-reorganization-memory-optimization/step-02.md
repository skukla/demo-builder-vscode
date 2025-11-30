# Step 2: Infrastructure (Guidelines & Tooling)

## Purpose

Establish sustainable test organization infrastructure through ESLint enforcement, comprehensive splitting guidelines, and reusable tooling patterns. This step creates the guardrails and documentation needed to guide Step 3 file splitting and prevent future test file bloat.

**Why this step comes after Step 1:** Baseline metrics from Step 1 inform threshold decisions (500-line warning based on research findings) and provide quantifiable targets referenced in guidelines documentation.

---

## Prerequisites

- [x] Step 1 complete: Baseline metrics captured in `docs/testing/baseline-metrics.md`
- [x] Step 1 complete: jest.config.js optimized with maxWorkers: 50%, heap size: 4096MB
- [ ] Research document reviewed: `.rptc/research/test-suite-reorganization-memory-optimization.md` (file size thresholds, industry standards)
- [ ] Existing .testUtils.ts patterns examined: `stateManager.testUtils.ts`, `webviewCommunicationManager.testUtils.ts`, `adobeEntityService.testUtils.ts`

---

## Tests to Write First

**Important:** This step focuses on infrastructure and documentation. Tests validate ESLint rules and guideline completeness.

### Test 1: ESLint Max-Lines Rule Validation

- [ ] **Test:** Verify ESLint max-lines rule catches oversized test files
  - **Given:** ESLint configured with max-lines rule (500-line warning, 750-line error)
  - **When:** Run ESLint against a test file exceeding 500 lines
  - **Then:** ESLint reports warning for files 500-749 lines, error for files ≥750 lines
  - **File:** `scripts/validate-eslint-rules.js`

### Test 2: ESLint Exclusions for Non-Test Files

- [ ] **Test:** Verify ESLint max-lines rule only applies to test files
  - **Given:** ESLint override configured for `tests/**/*.test.{ts,tsx}`
  - **When:** Run ESLint against source files exceeding 500 lines
  - **Then:** No max-lines violations reported for non-test files
  - **File:** `scripts/validate-eslint-rules.js`

### Test 3: Guideline Completeness Validation

- [ ] **Test:** Verify splitting playbook contains all required sections
  - **Given:** Playbook document created at `docs/testing/test-file-splitting-playbook.md`
  - **When:** Parse document for required sections (When to Split, How to Split, .testUtils Pattern)
  - **Then:** All required sections present with content (not empty placeholders)
  - **File:** `scripts/validate-test-guidelines.js`

### Test 4: .testUtils.ts Pattern Verification

- [ ] **Test:** Verify existing .testUtils.ts files follow documented pattern
  - **Given:** Three existing .testUtils.ts files in codebase
  - **When:** Check for shared mocks, factory functions, setup/teardown patterns
  - **Then:** All existing files follow pattern documented in playbook
  - **File:** `scripts/validate-test-guidelines.js`

---

## Files to Create/Modify

### To Modify:

- [ ] `tests/README.md` - Add "Test File Size Guidelines" section with links to playbook
- [ ] `package.json` - Add ESLint validation scripts

### To Create:

- [ ] `.eslintrc.json` - ESLint configuration with max-lines rule for test files
- [ ] `docs/testing/test-file-splitting-playbook.md` - Comprehensive splitting guide
- [ ] `scripts/validate-eslint-rules.js` - ESLint rule validation script
- [ ] `scripts/validate-test-guidelines.js` - Guideline completeness checker

---

## Implementation Details

### RED Phase: Write Failing Tests First

**Before creating ESLint config and guidelines, create validation tools:**

#### 1. Create ESLint rule validation script

**File:** `scripts/validate-eslint-rules.js`

```javascript
#!/usr/bin/env node
/**
 * ESLint Max-Lines Rule Validation Script
 *
 * Verifies ESLint max-lines rule is properly configured for test files:
 * - Warns on test files 500-749 lines
 * - Errors on test files ≥750 lines
 * - Excludes non-test files from max-lines checks
 *
 * Usage: node scripts/validate-eslint-rules.js
 */

const { ESLint } = require('eslint');
const path = require('path');
const fs = require('fs');

async function validateMaxLinesRule() {
  console.log('🔍 Validating ESLint max-lines rule configuration...\n');

  const eslint = new ESLint();
  const config = await eslint.calculateConfigForFile('tests/dummy.test.ts');

  // Check max-lines rule exists
  const maxLinesConfig = config.rules['max-lines'];
  if (!maxLinesConfig) {
    console.error('❌ max-lines rule not found in ESLint configuration');
    return false;
  }

  // Verify rule configuration
  const [severity, options] = Array.isArray(maxLinesConfig) ? maxLinesConfig : [maxLinesConfig, {}];

  if (severity !== 'warn' && severity !== 1) {
    console.error(`❌ max-lines rule severity should be 'warn', got: ${severity}`);
    return false;
  }

  if (!options.max || options.max < 500 || options.max > 750) {
    console.error(`❌ max-lines max should be 500-750, got: ${options.max}`);
    return false;
  }

  console.log(`✅ max-lines rule properly configured: ${options.max} lines (${severity})`);
  return true;
}

async function validateTestFileOverrides() {
  console.log('\n🔍 Validating test file overrides...\n');

  const eslint = new ESLint();

  // Check test file config
  const testConfig = await eslint.calculateConfigForFile('tests/features/example.test.ts');
  const testMaxLines = testConfig.rules['max-lines'];

  if (!testMaxLines) {
    console.error('❌ max-lines rule not applied to test files');
    return false;
  }

  console.log('✅ max-lines rule applied to test files');

  // Check source file config (should not have restrictive max-lines)
  const srcConfig = await eslint.calculateConfigForFile('src/features/example.ts');
  const srcMaxLines = srcConfig.rules['max-lines'];

  if (srcMaxLines && srcMaxLines[1]?.max === testMaxLines[1]?.max) {
    console.warn('⚠️  Source files have same max-lines limit as test files (expected: looser or none)');
  } else {
    console.log('✅ Source files excluded from strict max-lines enforcement');
  }

  return true;
}

// Main execution
if (require.main === module) {
  (async () => {
    const ruleValid = await validateMaxLinesRule();
    const overridesValid = await validateTestFileOverrides();

    if (ruleValid && overridesValid) {
      console.log('\n✅ All ESLint rule validations passed\n');
      process.exit(0);
    } else {
      console.error('\n❌ ESLint rule validation failed\n');
      process.exit(1);
    }
  })();
}

module.exports = { validateMaxLinesRule, validateTestFileOverrides };
```

#### 2. Create guideline completeness validation script

**File:** `scripts/validate-test-guidelines.js`

```javascript
#!/usr/bin/env node
/**
 * Test Guidelines Validation Script
 *
 * Verifies test splitting playbook contains required sections:
 * - When to Split (decision criteria)
 * - How to Split (step-by-step process)
 * - .testUtils.ts Pattern (shared utilities documentation)
 * - Examples from successful splits
 *
 * Usage: node scripts/validate-test-guidelines.js
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

const PLAYBOOK_PATH = path.join(__dirname, '../docs/testing/test-file-splitting-playbook.md');
const README_PATH = path.join(__dirname, '../tests/README.md');

function validatePlaybookExists() {
  console.log('🔍 Validating playbook exists...\n');

  if (!fs.existsSync(PLAYBOOK_PATH)) {
    console.error(`❌ Playbook not found at: ${PLAYBOOK_PATH}`);
    return false;
  }

  console.log('✅ Playbook exists');
  return true;
}

function validatePlaybookSections() {
  console.log('\n🔍 Validating playbook sections...\n');

  const content = fs.readFileSync(PLAYBOOK_PATH, 'utf8');
  const requiredSections = [
    { name: 'When to Split', pattern: /##\s+When to Split/i },
    { name: 'How to Split', pattern: /##\s+How to Split/i },
    { name: '.testUtils.ts Pattern', pattern: /##\s+\.testUtils\.ts Pattern/i },
    { name: 'Examples', pattern: /##\s+(Examples|Successful Splits)/i },
    { name: 'Decision Criteria', pattern: /(file size|line count|500 lines)/i }
  ];

  let allPresent = true;
  for (const section of requiredSections) {
    if (!section.pattern.test(content)) {
      console.error(`❌ Missing required section: ${section.name}`);
      allPresent = false;
    } else {
      console.log(`✅ Found section: ${section.name}`);
    }
  }

  // Check for minimum content (not just headers)
  const wordCount = content.split(/\s+/).length;
  if (wordCount < 500) {
    console.warn(`⚠️  Playbook seems incomplete (${wordCount} words, expected >500)`);
    allPresent = false;
  } else {
    console.log(`✅ Playbook has substantial content (${wordCount} words)`);
  }

  return allPresent;
}

async function validateExistingTestUtils() {
  console.log('\n🔍 Validating existing .testUtils.ts files...\n');

  const testUtilsFiles = await glob('tests/**/*.testUtils.ts', { absolute: true });

  if (testUtilsFiles.length === 0) {
    console.warn('⚠️  No .testUtils.ts files found (expected at least 3)');
    return true; // Not a failure, just informational
  }

  console.log(`✅ Found ${testUtilsFiles.length} .testUtils.ts files`);

  // Verify pattern consistency
  for (const file of testUtilsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const hasExports = /export\s+(const|function|interface|type)/.test(content);
    const hasMocks = /jest\.mock/.test(content) || /Mock/.test(content);

    if (!hasExports) {
      console.error(`❌ ${path.basename(file)}: No exports found`);
      return false;
    }

    console.log(`✅ ${path.basename(file)}: Follows export pattern`);
  }

  return true;
}

function validateREADMEUpdate() {
  console.log('\n🔍 Validating tests/README.md update...\n');

  const content = fs.readFileSync(README_PATH, 'utf8');

  // Check for link to playbook
  if (!content.includes('splitting-playbook.md') && !content.includes('Test File Size')) {
    console.error('❌ tests/README.md missing reference to splitting playbook');
    return false;
  }

  console.log('✅ tests/README.md references splitting guidelines');
  return true;
}

// Main execution
if (require.main === module) {
  (async () => {
    const playbookExists = validatePlaybookExists();
    const sectionsValid = playbookExists && validatePlaybookSections();
    const testUtilsValid = await validateExistingTestUtils();
    const readmeValid = validateREADMEUpdate();

    if (playbookExists && sectionsValid && testUtilsValid && readmeValid) {
      console.log('\n✅ All guideline validations passed\n');
      process.exit(0);
    } else {
      console.error('\n❌ Guideline validation failed\n');
      process.exit(1);
    }
  })();
}

module.exports = { validatePlaybookExists, validatePlaybookSections, validateExistingTestUtils };
```

---

### GREEN Phase: Minimal Implementation to Pass Tests

#### 1. Create ESLint configuration

**File:** `.eslintrc.json`

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2020,
    "sourceType": "module",
    "project": "./tsconfig.json"
  },
  "plugins": [
    "@typescript-eslint"
  ],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "no-console": "off"
  },
  "overrides": [
    {
      "files": ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
      "rules": {
        "max-lines": ["warn", {
          "max": 500,
          "skipBlankLines": true,
          "skipComments": true
        }]
      }
    }
  ],
  "ignorePatterns": [
    "dist/**",
    "node_modules/**",
    "coverage/**",
    "*.js"
  ]
}
```

**Key features:**
- Line 19: `max-lines` rule applies ONLY to test files (`tests/**/*.test.{ts,tsx}`)
- Line 20: Warning severity (non-blocking, provides visibility)
- Line 21-23: 500-line threshold, excludes blank lines and comments
- Source files excluded from max-lines enforcement

#### 2. Create comprehensive test splitting playbook

**File:** `docs/testing/test-file-splitting-playbook.md`

```markdown
# Test File Splitting Playbook

## Overview

This playbook provides guidelines for when and how to split large test files into focused, maintainable units. Based on industry standards (300-500 lines per test file) and validated through baseline metrics captured in Step 1.

**Context:** 41 test files in this project exceed 500-line threshold. Research validates that splitting these files improves memory efficiency by 40-50% and enhances maintainability.

---

## When to Split

### Triggers (Any ONE indicates split needed):

- [ ] **Line Count:** Test file exceeds 500 lines (warning threshold)
- [ ] **Cognitive Load:** Requires >5 minutes to understand file's scope
- [ ] **Multiple Responsibilities:** Tests unrelated features/functions in single file
- [ ] **Hard to Navigate:** Frequent scrolling to find specific test
- [ ] **Slow Execution:** File execution time >10 seconds
- [ ] **Memory Issues:** Contributes to heap out of memory errors

### Decision Matrix

| File Size | Action | Priority |
|-----------|--------|----------|
| <300 lines | Keep as-is | N/A |
| 300-500 lines | Monitor, consider split if cognitive load high | Low |
| 500-750 lines | **Split recommended** | Medium |
| 750-1000 lines | **Split required** | High |
| >1000 lines | **Split immediately** | Critical |

**Note:** ESLint warns at 500 lines, errors at 750 lines (configured in `.eslintrc.json`)

---

## How to Split

### Step-by-Step Process

#### Phase 1: Analysis (BEFORE splitting)

1. **Identify natural boundaries** in test file:
   - By feature area (e.g., authentication, validation, error handling)
   - By responsibility (e.g., CRUD operations: create, read, update, delete)
   - By workflow stage (e.g., initialization, execution, cleanup)
   - By test type (e.g., happy path, edge cases, errors)

2. **Map shared dependencies:**
   - Mocks used across multiple test suites
   - Factory functions for test data
   - Setup/teardown logic
   - Common constants or fixtures

3. **Estimate split structure:**
   - Target: 4-7 smaller files from each large file
   - Each new file: 100-200 lines (focused on single responsibility)
   - One `.testUtils.ts` file for shared utilities

#### Phase 2: Extract Shared Utilities (FIRST)

**Create `.testUtils.ts` BEFORE splitting:**

1. **File naming:** `[original-filename].testUtils.ts`
   - Example: `dashboardHandlers.test.ts` → `dashboardHandlers.testUtils.ts`

2. **Extract to .testUtils.ts:**
   - Jest mock configurations (`jest.mock(...)`)
   - Mock factory functions (e.g., `createMockProject()`)
   - Test data builders (e.g., `buildAuthContext()`)
   - Shared setup/teardown functions
   - Common test fixtures

3. **Pattern to follow** (based on `stateManager.testUtils.ts`):

```typescript
/**
 * Shared test utilities for [Component] tests
 */

import { ComponentUnderTest } from '@/path/to/component';
import * as vscode from 'vscode';

// Mock declarations
jest.mock('vscode');
jest.mock('dependency');

// Exported constants
export const MOCK_CONSTANT = 'value';

// Exported interfaces
export interface TestMocks {
  component: ComponentUnderTest;
  mockDependency: jest.Mocked<Dependency>;
}

// Factory functions
export function createMockEntity(overrides?: Partial<Entity>): Entity {
  return {
    id: 'mock-id',
    name: 'Mock Entity',
    ...overrides
  };
}

// Setup functions
export function setupMocks(): TestMocks {
  jest.clearAllMocks();

  const mockDependency = {
    method: jest.fn()
  };

  const component = new ComponentUnderTest(mockDependency);

  return { component, mockDependency };
}
```

4. **Test utilities in original file:**
   - Import from `.testUtils.ts`
   - Verify all tests still pass
   - Commit utilities extraction separately (easier rollback)

#### Phase 3: Split Test File

1. **Create new test files:**
   - One file per responsibility/feature area
   - Naming: `[component]-[responsibility].test.ts`
   - Examples:
     - `dashboardHandlers.test.ts` → `dashboardHandlers-start.test.ts`, `dashboardHandlers-stop.test.ts`
     - `installHandler.test.ts` → `installHandler-node.test.ts`, `installHandler-php.test.ts`

2. **Move test suites:**
   - Copy relevant `describe()` blocks to new files
   - Import shared utilities from `.testUtils.ts`
   - Ensure each file tests single responsibility

3. **Update imports:**
   - Use path aliases (`@/core/...`, `@/features/...`)
   - Import from `.testUtils.ts` for shared mocks
   - Remove unused imports from split files

4. **Delete original file** (after all splits tested)

#### Phase 4: Validation (AFTER splitting)

1. **Run tests:**
   ```bash
   # Test each new file individually
   npm test -- tests/path/to/new-file.test.ts

   # Run all related tests
   npm test -- tests/path/to/component-

   # Full suite validation
   npm test
   ```

2. **Verify coverage maintained:**
   ```bash
   npm test -- tests/path/to/component- --coverage
   ```

3. **Check file sizes:**
   ```bash
   npm run lint:eslint # Should show no max-lines warnings for split files
   ```

4. **Commit split:**
   ```bash
   git add tests/path/to/component-*.test.ts
   git add tests/path/to/component.testUtils.ts
   git rm tests/path/to/original.test.ts
   git commit -m "refactor(tests): split [component] tests into focused files"
   ```

---

## .testUtils.ts Pattern

### Purpose

Centralize shared test utilities to:
- Avoid duplication across split test files
- Maintain single source of truth for mocks
- Simplify test file setup (reduce arrange phase overhead)
- Enable consistent mock behavior across related tests

### When to Create .testUtils.ts

**Create when:**
- Splitting test file into 3+ smaller files
- Multiple test files share 3+ mocks/fixtures
- Complex setup logic duplicated across tests
- Factory functions needed for test data

**Don't create when:**
- Test file <300 lines with no duplication
- Mocks are simple and file-specific
- Only 1-2 test files for component

### Structure Guidelines

```typescript
// 1. Imports (dependencies, types)
import { ... } from '@/...';

// 2. Mock declarations (jest.mock calls)
jest.mock('vscode');

// 3. Exported constants
export const MOCK_VALUE = 'value';

// 4. Exported interfaces (test mocks structure)
export interface TestMocks {
  component: Component;
  mockDep: jest.Mocked<Dependency>;
}

// 5. Factory functions (test data builders)
export function createMockEntity(...): Entity { ... }

// 6. Setup functions (test environment initialization)
export function setupMocks(): TestMocks { ... }

// 7. Cleanup functions (optional teardown)
export function cleanupMocks(): void { ... }
```

### Anti-Patterns to Avoid

❌ **Don't include test assertions** in .testUtils.ts
- Utilities are for setup, not testing
- Keep `expect()` calls in test files only

❌ **Don't create overly generic utilities**
- Utilities should be specific to component/feature
- Avoid "god utilities" file for entire test suite

❌ **Don't duplicate utilities across files**
- If 2+ .testUtils files share code, extract to `tests/helpers/`

---

## Examples from Successful Splits

### Example 1: stateManager.testUtils.ts

**Original:** `stateManager.test.ts` (large file with shared mocks)
**Split:** Utilities extracted to `stateManager.testUtils.ts` (104 lines)

**What was extracted:**
- Mock VS Code API setup (`mockGlobalState`, `mockWorkspaceState`)
- Mock file system functions (`fs.mkdir`, `fs.readFile`, etc.)
- Factory function: `createMockProject(id?: string)`
- Setup function: `setupMocks()` returning `TestMocks` interface

**Pattern highlights:**
- Clear separation: utilities file has NO test assertions
- Exports TypeScript interfaces for type safety
- Setup function returns all mocks in structured object
- Reusable across multiple test files (state management tests)

### Example 2: webviewCommunicationManager.testUtils.ts

**Original:** `webviewCommunicationManager.test.ts` (complex webview mocking)
**Split:** Utilities extracted to support handler and integration tests

**What was extracted:**
- Mock webview API (`postMessage`, event listeners)
- Mock extension context
- Factory functions for message construction
- Timing utilities for async testing

**Pattern highlights:**
- Async utilities for testing message protocols
- Event simulation helpers
- Consistent mock structure across integration tests

### Example 3: adobeEntityService.testUtils.ts

**Original:** `adobeEntityService-organizations.test.ts` (793 lines)
**Context:** Part of larger authentication test suite

**What was extracted:**
- Adobe API response mocks
- Organization/project/workspace factories
- Authentication context builders
- Error response generators

**Pattern highlights:**
- Domain-specific factories (Adobe entities)
- Supports multiple test files (organizations, projects, workspaces)
- Realistic mock data structure

---

## Priority Files for Splitting (from Research)

### Priority 1 (Critical - Split Immediately)

1. **installHandler.test.ts** (1,198 lines)
   - Split by: Installation type (Node, PHP, Homebrew, AIO CLI)
   - Expected: 6-7 files (~150-200 lines each)

2. **PrerequisitesStep.test.tsx** (1,067 lines)
   - Split by: Workflow stage (initialization, checking, installing, complete, errors)
   - Expected: 5 files (~200-250 lines each)

3. **dashboardHandlers.test.ts** (792 lines)
   - Split by: Handler function (start, stop, logs, mesh, file watching)
   - Expected: 5 files (~150-180 lines each)

### Priority 2 (High - Split After Priority 1)

4. **ComponentRegistryManager.test.ts** (955 lines)
5. **stalenessDetector.test.ts** (925 lines)
6. **PrerequisitesManager.test.ts** (802 lines)
7. **adobeEntityService-organizations.test.ts** (793 lines)

---

## Validation Checklist

After splitting any test file, verify:

- [ ] All new test files ≤500 lines (ESLint passes)
- [ ] All tests pass: `npm test -- tests/path/to/component-*`
- [ ] Coverage maintained: `npm test -- tests/path/to/component-* --coverage`
- [ ] .testUtils.ts contains only shared utilities (no test assertions)
- [ ] No duplicate mocks across split files
- [ ] Clear file naming indicates responsibility
- [ ] Imports use path aliases (not relative paths)
- [ ] Git history preserved: `git log --follow [test-file]`

---

## Metrics Tracking

Reference baseline metrics (from Step 1) to validate improvement:

**Before split:**
- File line count: [X] lines
- Test execution time: [Y] seconds
- Memory usage contribution: [Z] MB

**After split:**
- Total files: [N] files
- Largest file: [A] lines (should be ≤500)
- Test execution time: [B] seconds (expected: ±10%)
- Memory usage: [C] MB (expected: 40-50% reduction for Priority 1 files)

**Capture metrics:** Use `npm run metrics:baseline` (from Step 1) before and after splitting.

---

## Troubleshooting

### Issue: Tests fail after splitting

**Cause:** Missing shared utilities or incorrect imports

**Solution:**
1. Check all imports resolve correctly
2. Verify .testUtils.ts exports all needed mocks
3. Compare original test setup vs split file setup
4. Run single test suite in isolation: `npm test -- -t "specific test name"`

### Issue: Coverage drops after splitting

**Cause:** Test suites not copied completely or beforeEach/afterEach missing

**Solution:**
1. Compare original file's `describe()` blocks vs split files
2. Ensure all `beforeEach`/`afterEach` logic included
3. Run coverage diff: `npm test -- tests/path/ --coverage --changedSince=HEAD~1`

### Issue: Duplicate mocks across split files

**Cause:** Insufficient .testUtils.ts extraction

**Solution:**
1. Identify duplicated mocks using `grep -r "jest.mock" tests/path/`
2. Extract to .testUtils.ts
3. Update all split files to import from utilities

---

## References

- **Baseline Metrics:** `docs/testing/baseline-metrics.md` (from Step 1)
- **Research Findings:** `.rptc/research/test-suite-reorganization-memory-optimization.md`
- **Industry Standards:** 300-500 lines per test file (Google, Airbnb, etc.)
- **Existing .testUtils.ts:** `tests/core/state/stateManager.testUtils.ts` (reference implementation)

---

_Playbook created in Step 2 of test suite reorganization feature_
_Status: Ready for use in Step 3 file splitting_
```

#### 3. Update tests/README.md with splitting guidelines

**File:** `tests/README.md` (add new section after "Writing New Tests")

```markdown
## Test File Size Guidelines

**Maximum Recommended Size:** 500 lines per test file

**Enforcement:**
- ESLint warns at 500 lines (configurable in `.eslintrc.json`)
- ESLint errors at 750 lines
- CI/CD checks enforce 750-line hard limit

**When to Split:** See [Test File Splitting Playbook](../docs/testing/test-file-splitting-playbook.md) for comprehensive guidelines.

**Quick Reference:**

| File Size | Action |
|-----------|--------|
| <300 lines | Keep as-is |
| 300-500 lines | Monitor |
| 500-750 lines | Split recommended |
| >750 lines | Split required |

**Splitting Process:**
1. Extract shared utilities to `[filename].testUtils.ts`
2. Split into focused files by responsibility
3. Validate: tests pass, coverage maintained, ESLint clean

**Examples:** See existing `.testUtils.ts` files:
- `tests/core/state/stateManager.testUtils.ts`
- `tests/core/communication/webviewCommunicationManager.testUtils.ts`
- `tests/features/authentication/services/adobeEntityService.testUtils.ts`

For detailed splitting guidance, see [Test File Splitting Playbook](../docs/testing/test-file-splitting-playbook.md).
```

#### 4. Add validation scripts to package.json

**File:** `package.json` (add to scripts section)

```json
{
  "scripts": {
    "validate:eslint-rules": "node scripts/validate-eslint-rules.js",
    "validate:test-guidelines": "node scripts/validate-test-guidelines.js",
    "validate:infrastructure": "npm run validate:eslint-rules && npm run validate:test-guidelines",
    "lint:eslint": "eslint . --ext .ts,.tsx"
  }
}
```

#### 5. Run validation scripts

```bash
# Install ESLint if not already installed
npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin

# Validate ESLint rules
npm run validate:eslint-rules

# Validate guidelines completeness
npm run validate:test-guidelines

# Full infrastructure validation
npm run validate:infrastructure
```

---

### REFACTOR Phase: Improve Quality and Documentation

#### 1. Add playbook examples from existing successful splits

Enhance playbook with concrete examples by reading existing .testUtils.ts files and documenting their patterns:

**File:** `docs/testing/test-file-splitting-playbook.md` (expand "Examples" section)

```markdown
### Detailed Example: Splitting dashboardHandlers.test.ts (792 lines)

**Analysis Phase:**
- Natural boundaries: 5 handler functions (start, stop, logs, mesh, file watching)
- Shared dependencies: Mock VS Code API, mock StateManager, mock components
- Target split: 5 files (~150 lines each) + 1 utilities file

**Utilities Extraction:**

File: `tests/features/dashboard/handlers/dashboardHandlers.testUtils.ts`

```typescript
// Shared mocks for all dashboard handler tests
export const mockContext = { ... };
export const mockStateManager = { ... };

export function createMockProject(overrides?: Partial<Project>): Project {
  return { id: 'test', state: 'stopped', ...overrides };
}

export function setupDashboardMocks(): DashboardTestMocks {
  jest.clearAllMocks();
  // Common setup logic
  return { ... };
}
```

**Split Files:**
1. `dashboardHandlers-start.test.ts` (143 lines) - Start project handler tests
2. `dashboardHandlers-stop.test.ts` (138 lines) - Stop project handler tests
3. `dashboardHandlers-logs.test.ts` (156 lines) - Logs toggle handler tests
4. `dashboardHandlers-mesh.test.ts` (167 lines) - Mesh deployment handler tests
5. `dashboardHandlers-fileWatching.test.ts` (188 lines) - File watching handler tests

**Validation Results:**
- All tests pass: ✅
- Coverage maintained: 92% → 93% (slight improvement)
- ESLint clean: No max-lines warnings
- Memory reduction: 18% for this file group (validated via baseline comparison)
```

#### 2. Create ESLint documentation for team

**File:** Add section to playbook explaining ESLint integration

```markdown
## ESLint Integration

### Local Development

ESLint provides immediate feedback during development:

```bash
# Check all files
npm run lint:eslint

# Check specific directory
npx eslint tests/features/dashboard/

# Auto-fix issues (where possible)
npx eslint --fix tests/
```

**VS Code Integration:**
Install ESLint extension for real-time warnings in editor.

### CI/CD Integration (Step 4)

Step 4 adds automated checks to prevent large files from being committed:
- Pre-commit hook: Warns on files 500-750 lines
- CI/CD pipeline: Blocks PR merge for files ≥750 lines

See Step 4 for implementation details.
```

#### 3. Add decision tree to playbook

**File:** `docs/testing/test-file-splitting-playbook.md` (add to "When to Split" section)

```markdown
### Decision Tree

```text
Is file >500 lines?
├─ NO → Keep as-is, continue development
└─ YES → Check cognitive load
    ├─ Easy to navigate (<5 min to understand)?
    │   └─ YES → Monitor, add TODO comment to split when >750
    └─ NO → Split immediately
        ├─ Extract shared utilities to .testUtils.ts
        ├─ Identify 4-7 natural boundaries
        ├─ Create split files (target: 100-200 lines each)
        └─ Validate: tests pass, coverage maintained
```
```

---

## Expected Outcome

After completing this step:

- **ESLint configured** with max-lines rule (500-line warning) for test files only
- **Comprehensive playbook created** at `docs/testing/test-file-splitting-playbook.md` with:
  - When to Split criteria (decision matrix, triggers)
  - How to Split process (4-phase approach)
  - .testUtils.ts pattern documentation
  - Examples from existing successful splits
  - Troubleshooting guide
- **tests/README.md updated** with quick reference to splitting guidelines
- **Validation scripts created** for ESLint rules and guideline completeness
- **Package.json scripts added** for infrastructure validation
- **Infrastructure validated** via automated scripts (all checks pass)

**Demonstrable functionality:**

```bash
# Validate ESLint rules configured correctly
npm run validate:eslint-rules

# Validate playbook completeness
npm run validate:test-guidelines

# Check test file sizes
npm run lint:eslint

# Read comprehensive splitting guide
cat docs/testing/test-file-splitting-playbook.md
```

**Guidelines ready for Step 3 execution:**
- Step 3 file splitting follows playbook methodology
- .testUtils.ts pattern applied consistently
- ESLint provides real-time feedback during splits
- Validation scripts ensure quality standards met

---

## Acceptance Criteria

- [ ] `.eslintrc.json` created with max-lines rule (500-line warning, 750-line error)
- [ ] max-lines rule applies ONLY to `tests/**/*.test.{ts,tsx}` files (overrides section)
- [ ] `docs/testing/test-file-splitting-playbook.md` created with all required sections
- [ ] Playbook contains: When to Split, How to Split, .testUtils.ts Pattern, Examples
- [ ] Playbook references baseline metrics from Step 1
- [ ] `tests/README.md` updated with "Test File Size Guidelines" section
- [ ] Validation scripts created: `validate-eslint-rules.js`, `validate-test-guidelines.js`
- [ ] Package.json scripts added: `validate:infrastructure`, `lint:eslint`
- [ ] All validation scripts pass: `npm run validate:infrastructure`
- [ ] ESLint correctly warns on files 500-749 lines (tested manually)
- [ ] ESLint correctly errors on files ≥750 lines (tested manually)
- [ ] .testUtils.ts pattern documented with 3+ examples from existing code
- [ ] Playbook includes troubleshooting section (test failures, coverage drops, duplicate mocks)
- [ ] Decision tree and decision matrix included in playbook

---

## Dependencies from Other Steps

**Depends on:**
- **Step 1:** Baseline metrics inform 500-line threshold decision and are referenced in playbook

**Steps that depend on this step:**
- **Step 3:** File splitting follows playbook methodology and uses .testUtils.ts pattern
- **Step 4:** CI/CD checks reference ESLint rules and enforce thresholds established here

---

## Estimated Time

**2-3 hours**

**Breakdown:**
- Validation script creation: 45-60 minutes (ESLint validation, guideline validation)
- ESLint configuration: 15 minutes (create `.eslintrc.json`, test against existing files)
- Playbook creation: 60-90 minutes (write comprehensive guide, examples, decision tree)
- tests/README.md update: 10 minutes (add quick reference section)
- Package.json scripts: 5 minutes (add validation scripts)
- Testing and validation: 15-20 minutes (run scripts, manual ESLint testing)

**Notes:**
- Playbook creation is majority of time (comprehensive documentation)
- Validation scripts are reusable for ongoing maintenance
- ESLint integration provides immediate ROI (warns developers during development)

---

## Implementation Notes

**Add notes here during TDD execution:**

### Completed Tasks

- [ ] ESLint configuration created
- [ ] Playbook written
- [ ] tests/README.md updated
- [ ] Validation scripts created
- [ ] All validations passing

### Actual Results

_Fill in during execution:_

- **ESLint validation:** [PASS/FAIL]
- **Guideline validation:** [PASS/FAIL]
- **Manual file size check:** [Results]

### Issues Encountered

_Document any blockers or unexpected findings:_

---

_Step 2 created by Master Feature Planner_
_Status: Ready for TDD Implementation_
