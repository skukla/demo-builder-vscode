# Step 7: Update Documentation for New Test Structure

## Step Overview

**Purpose:** Update all project documentation to reflect the reorganized test structure, ensuring developers can easily discover tests and understand the new organization. This final step documents the completed test migration (Steps 1-6) and removes outdated references to legacy test locations.

**What This Accomplishes:**
- Updates root CLAUDE.md with new test structure overview
- Updates src/CLAUDE.md to reflect current testing approach
- Creates comprehensive tests/README.md documenting structure-aligned organization
- Updates docs/README.md to include testing documentation reference
- Removes references to obsolete test paths (tests/utils/, tests/commands/handlers/, tests/webviews/)
- Documents TDD principles for empty test directories (created in Step 5)

**Files Affected:** 4 documentation files (3 updated, 1 created)

**Estimated Time:** 45-60 minutes

---

## Prerequisites

- [ ] Step 1 completed (core infrastructure tests migrated to tests/core/)
- [ ] Step 2 completed (feature handler tests migrated to tests/features/*/handlers/)
- [ ] Step 3 completed (webview component tests migrated to tests/webview-ui/)
- [ ] Step 4 completed (duplicate hook tests consolidated, tests/webviews/ removed)
- [ ] Step 5 completed (missing core test directories created with README.md placeholders)
- [ ] Step 6 completed (Jest configuration updated and verified)
- [ ] All tests passing (npm test shows no failures)
- [ ] Clean working directory (git status shows staged changes only)

---

## Test Strategy

### Approach for Documentation Updates

**Philosophy:** Documentation updates are verified by ensuring all old test path references are replaced with new structure. No tests are written (documentation-only step), but verification commands confirm completeness.

### Verification Scenarios

#### Happy Path: Documentation Updated Successfully

**Scenario 1: Find All Old Test Path References**
- [ ] **Verification:** Grep finds old test paths in documentation
  - **Given:** Documentation may reference tests/utils/, tests/commands/handlers/, tests/webviews/
  - **When:** Running `grep -r "tests/\(utils\|commands/handlers\|webviews\)" *.md docs/*.md src/CLAUDE.md`
  - **Then:** Identify all files needing updates (expect: CLAUDE.md, src/CLAUDE.md, possibly docs files)
  - **File:** Command output analysis (no test file)

**Scenario 2: Update Root CLAUDE.md Test References**
- [ ] **Verification:** Root CLAUDE.md updated with new structure
  - **Given:** CLAUDE.md line 199 mentions "Testing: Manual testing checklist (automated tests planned)"
  - **When:** Adding new "Test Organization" section documenting structure-aligned paths
  - **Then:** CLAUDE.md includes tests/core/, tests/features/, tests/webview-ui/ structure overview
  - **File:** Visual inspection of CLAUDE.md after edit

**Scenario 3: Update src/CLAUDE.md Testing Section**
- [ ] **Verification:** src/CLAUDE.md reflects new test structure
  - **Given:** src/CLAUDE.md lines 242-248 have "Testing Approach" section
  - **When:** Updating section to reference new test locations mirroring src/ structure
  - **Then:** Testing section describes structure-aligned organization with examples
  - **File:** Visual inspection of src/CLAUDE.md after edit

**Scenario 4: Create Comprehensive tests/README.md**
- [ ] **Verification:** tests/README.md created with full structure documentation
  - **Given:** No tests/README.md currently exists
  - **When:** Creating README with structure overview, discovery guide, TDD principles
  - **Then:** README documents all test directories, path aliases, discovery commands
  - **File:** Visual inspection of tests/README.md after creation

**Scenario 5: Update docs/README.md Index**
- [ ] **Verification:** docs/README.md includes testing documentation reference
  - **Given:** docs/README.md "Quick Navigation" section doesn't mention testing
  - **When:** Adding "Testing" section under "By Topic" with link to tests/README.md
  - **Then:** Developers can navigate to test documentation from docs index
  - **File:** Visual inspection of docs/README.md after edit

**Scenario 6: Verify No Old Test Path References Remain**
- [ ] **Verification:** Grep finds zero old test path references in documentation
  - **Given:** Documentation updated in previous scenarios
  - **When:** Running `grep -r "tests/\(utils\|commands/handlers\|webviews\)" *.md docs/*.md src/CLAUDE.md`
  - **Then:** No matches found (all old references replaced)
  - **File:** Command output shows empty result

#### Edge Cases: Documentation Completeness

**Edge Case 1: TDD Placeholder Directories Documented**
- [ ] **Verification:** Empty directories from Step 5 explained in tests/README.md
  - **Given:** tests/core/base/, tests/core/config/, etc. exist with only README.md
  - **When:** tests/README.md includes "TDD Placeholder Directories" section
  - **Then:** Developers understand these are reserved for future tests following TDD
  - **File:** tests/README.md section on placeholders

**Edge Case 2: Path Alias Documentation Consistent**
- [ ] **Verification:** Path aliases documented consistently across all updated files
  - **Given:** Tests use @/core/, @/features/, @/shared/ aliases
  - **When:** All documentation mentions same aliases
  - **Then:** No conflicting path alias documentation (e.g., don't mix @/ and relative paths)
  - **File:** Cross-reference all 4 updated documentation files

**Edge Case 3: Jest Configuration Referenced in Documentation**
- [ ] **Verification:** tests/README.md references jest.config.js for test discovery patterns
  - **Given:** jest.config.js defines Node vs React test separation
  - **When:** tests/README.md "Running Tests" section created
  - **Then:** Developers know how to run Node-only, React-only, or all tests
  - **File:** tests/README.md "Running Tests" section

**Edge Case 4: Migration History Preserved in Documentation**
- [ ] **Verification:** Old test locations documented as "Legacy (Removed)" in tests/README.md
  - **Given:** Developers may wonder why git history shows old test paths
  - **When:** tests/README.md includes "Migration History" section
  - **Then:** Explains tests/utils/, tests/webviews/ were migrated (reference this plan)
  - **File:** tests/README.md "Migration History" section

#### Error Conditions: Documentation Quality

**Error Condition 1: Broken Documentation Links**
- [ ] **Verification:** All internal documentation links resolve correctly
  - **Given:** Documentation references other .md files or sections
  - **When:** Clicking/following links in updated documentation
  - **Then:** All links resolve to existing files/sections (no 404s)
  - **File:** Manual link verification in each updated file

**Error Condition 2: Inconsistent Test Path Examples**
- [ ] **Verification:** Test path examples match actual file locations
  - **Given:** Documentation shows example test paths
  - **When:** Verifying examples against actual test file locations
  - **Then:** All example paths exist and are correct (e.g., tests/core/shell/pollingService.test.ts)
  - **File:** Cross-reference examples with `find tests -name "*.test.ts" | head -20`

**Error Condition 3: Outdated Test Count References**
- [ ] **Verification:** Documentation doesn't reference incorrect test counts
  - **Given:** Plan overview.md mentions "92 test files"
  - **When:** Step 4 consolidated duplicates to 91 files
  - **Then:** Documentation uses correct count (91 files) or avoids specific numbers
  - **File:** Search documentation for "92 test" and verify accuracy

---

## Implementation Details

### Phase 1: Pre-Update Analysis (Search for Old References)

**Objective:** Identify all documentation files containing references to old test structure.

**Commands to Run:**

```bash
# Search for old test path references in documentation
grep -r "tests/utils" *.md docs/*.md src/CLAUDE.md 2>/dev/null
grep -r "tests/commands/handlers" *.md docs/*.md src/CLAUDE.md 2>/dev/null
grep -r "tests/webviews" *.md docs/*.md src/CLAUDE.md 2>/dev/null

# Search for generic "test structure" or "test organization" sections
grep -ri "test.*\(structure\|organization\|location\)" *.md docs/*.md src/CLAUDE.md 2>/dev/null

# List all CLAUDE.md files in project
find . -name "CLAUDE.md" -type f | grep -v node_modules
```

**Expected Findings:**
- Root CLAUDE.md: Line 199 "Testing: Manual testing checklist"
- src/CLAUDE.md: Lines 242-248 "Testing Approach"
- Possibly docs/CLAUDE.md or other doc files

**Decision Point:** If grep finds references to old test paths in .rptc/complete/ or .rptc/plans/ directories, **DO NOT UPDATE** those files (they are historical records of completed work).

---

### Phase 2: Update Root CLAUDE.md (Technology Stack Section)

**File:** `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/CLAUDE.md`

**Location to Update:** Line 199 (Technology Stack section)

**Current Content:**
```markdown
- **Testing**: Manual testing checklist (automated tests planned)
```

**Updated Content:**
```markdown
- **Testing**: Jest with ts-jest, @testing-library/react, structure-aligned test organization (see tests/README.md)
```

**Rationale:** Reflects current testing framework and references new test structure documentation.

---

### Phase 3: Update src/CLAUDE.md (Testing Approach Section)

**File:** `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/src/CLAUDE.md`

**Location to Update:** Lines 242-248 (Testing Approach section)

**Current Content:**
```markdown
## Testing Approach

Currently manual testing with plans for:
- Unit tests for utilities
- Integration tests for commands
- Component tests for React UI
- E2E tests for critical paths
```

**Updated Content:**
```markdown
## Testing Approach

**Framework:** Jest with ts-jest (Node environment) and @testing-library/react (jsdom for React)

**Test Organization:** Tests mirror the src/ directory structure for easy discovery.

```
tests/
├── core/              # Core infrastructure tests (mirrors src/core/)
│   ├── base/          # Base classes and types (TDD placeholder)
│   ├── commands/      # Command infrastructure tests
│   ├── communication/ # Webview communication protocol tests
│   ├── config/        # Configuration management (TDD placeholder)
│   ├── di/            # Dependency injection (TDD placeholder)
│   ├── logging/       # Logging system (TDD placeholder)
│   ├── shell/         # Command execution tests (ExternalCommandManager, polling)
│   ├── state/         # State management tests (StateManager, StateCoordinator)
│   ├── utils/         # Core utility tests
│   ├── validation/    # Validation tests (security, field validation)
│   └── vscode/        # VS Code API wrapper tests (TDD placeholder)
├── features/          # Feature tests (mirrors src/features/)
│   ├── authentication/
│   │   ├── handlers/  # Authentication handler tests
│   │   └── services/  # Authentication service tests
│   ├── components/    # Component management tests
│   ├── lifecycle/     # Project lifecycle tests
│   ├── mesh/          # API Mesh deployment tests
│   └── [other features]
└── webview-ui/        # React webview tests (mirrors webview-ui/src/)
    └── shared/
        ├── components/ # Shared component tests (ui/, forms/, feedback/, navigation/)
        └── hooks/      # Shared hook tests
```

**Test Types:**
- **Unit tests:** Isolated component/function testing (majority of tests)
- **Integration tests:** Component interaction testing (tests/integration/)
- **React component tests:** UI component testing with @testing-library/react

**Running Tests:**
```bash
npm test                        # Run all tests (Node + React)
npm test -- --selectProjects node   # Node tests only
npm test -- --selectProjects react  # React tests only
npm test -- tests/core/         # Specific directory
```

**Path Aliases:** Tests use the same path aliases as source code:
- `@/core/*` - Core infrastructure
- `@/features/*` - Feature modules
- `@/shared/*` - Shared utilities
- `@/webview-ui/*` - Webview UI components

**TDD Placeholder Directories:** Some test directories (e.g., tests/core/base/, tests/core/logging/) contain only README.md files. These are reserved for future tests following TDD (tests written before implementation).

**For Complete Test Documentation:** See `tests/README.md`
```

**Rationale:** Provides comprehensive overview of current test organization, running tests, and path aliases. Replaces "plans for" language with actual implemented structure.

---

### Phase 4: Create tests/README.md (Comprehensive Test Documentation)

**File:** `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/tests/README.md`

**Full Content:**

```markdown
# Test Organization

This directory contains all automated tests for the Adobe Demo Builder VS Code extension. Tests are organized to mirror the source code structure for easy discovery and maintenance.

## Directory Structure

```
tests/
├── __mocks__/         # Shared test mocks (vscode, uuid, etc.)
├── setup/             # Test setup files (react.ts for jsdom)
├── helpers/           # Test helper utilities
├── core/              # Core infrastructure tests (mirrors src/core/)
│   ├── base/          # Base classes and types (TDD placeholder)
│   ├── commands/      # Command infrastructure tests
│   ├── communication/ # Webview communication protocol tests
│   ├── config/        # Configuration management (TDD placeholder)
│   ├── di/            # Dependency injection (TDD placeholder)
│   ├── logging/       # Logging system (TDD placeholder)
│   ├── shell/         # Command execution tests
│   ├── state/         # State management tests
│   ├── utils/         # Core utility tests
│   ├── validation/    # Validation tests
│   └── vscode/        # VS Code API wrapper tests (TDD placeholder)
├── features/          # Feature tests (mirrors src/features/)
│   ├── authentication/
│   │   ├── handlers/  # Authentication message handlers
│   │   └── services/  # Authentication services (SDK, cache, tokens)
│   ├── components/
│   │   └── services/  # Component management services
│   ├── lifecycle/
│   │   └── handlers/  # Lifecycle handlers (start, stop, etc.)
│   ├── mesh/
│   │   ├── handlers/  # Mesh deployment handlers
│   │   ├── services/  # Mesh deployment services
│   │   └── utils/     # Mesh utilities (error formatting)
│   └── prerequisites/
│       └── services/  # Prerequisites checking and installation
├── integration/       # Integration tests (cross-module testing)
│   └── prerequisites/ # Prerequisites integration tests
├── webview-ui/        # React webview tests (mirrors webview-ui/src/)
│   └── shared/
│       ├── components/ # Shared UI components
│       │   ├── ui/         # Basic UI components (Spinner, Badge, etc.)
│       │   ├── forms/      # Form components (FormField, ConfigSection)
│       │   ├── feedback/   # Feedback components (ErrorDisplay, StatusCard)
│       │   └── navigation/ # Navigation components (SearchableList, etc.)
│       └── hooks/      # React hooks (useAsyncData, etc.)
└── types/             # Type definition tests
```

## Test Types

### Unit Tests
- **Location:** `tests/core/`, `tests/features/*/services/`
- **Purpose:** Test individual functions/classes in isolation
- **Environment:** Node.js (via ts-jest)
- **Example:** `tests/core/shell/pollingService.test.ts`

### Integration Tests
- **Location:** `tests/integration/`, `tests/features/*/handlers/`
- **Purpose:** Test interactions between components
- **Environment:** Node.js (via ts-jest)
- **Example:** `tests/integration/prerequisites/prerequisitesManager.test.ts`

### React Component Tests
- **Location:** `tests/webview-ui/`
- **Purpose:** Test React components and hooks
- **Environment:** jsdom (via @testing-library/react)
- **Example:** `tests/webview-ui/shared/components/ui/Spinner.test.tsx`

## Running Tests

### All Tests
```bash
npm test
```

### By Project (Node vs React)
```bash
# Node tests only (extension backend)
npm test -- --selectProjects node

# React tests only (webview UI)
npm test -- --selectProjects react
```

### Specific Directory or File
```bash
# Run all core tests
npm test -- tests/core/

# Run specific test file
npm test -- tests/core/shell/pollingService.test.ts

# Run tests matching pattern
npm test -- --testPathPattern="authentication"
```

### With Coverage
```bash
# Full coverage report
npm test -- --coverage

# Coverage for specific directory
npm test -- tests/features/authentication/ --coverage
```

### Watch Mode (for active development)
```bash
npm test -- --watch
```

## Test Discovery

Tests are discovered using Jest's `testMatch` patterns defined in `jest.config.js`:

**Node Project (extension backend):**
- Matches: `**/tests/**/*.test.ts`
- Excludes: `**/tests/webview-ui/**/*.test.tsx` (React tests)

**React Project (webview UI):**
- Matches: `**/tests/webview-ui/**/*.test.ts` and `*.test.tsx`

## Path Aliases

Tests use the same path aliases as source code for consistent imports:

```typescript
// ✅ Good: Use path aliases for cross-module imports
import { StateManager } from '@/core/state';
import { AuthService } from '@/features/authentication/services/authenticationService';
import { HandlerContext } from '@/types/handlers';

// ❌ Avoid: Relative paths for cross-module imports
import { StateManager } from '../../../src/core/state';
```

**Available Aliases:**
- `@/core/*` → `src/core/*`
- `@/features/*` → `src/features/*`
- `@/shared/*` → `src/shared/*`
- `@/types/*` → `src/types/*`
- `@/webview-ui/*` → `webview-ui/src/*`

## TDD Placeholder Directories

Some test directories contain only `README.md` files with no test files. These are **TDD placeholders** reserved for future tests:

- `tests/core/base/` - Base classes and types (tests written when implementation created)
- `tests/core/config/` - Configuration management
- `tests/core/di/` - Dependency injection
- `tests/core/logging/` - Logging system
- `tests/core/vscode/` - VS Code API wrappers

**Why Placeholders?** Following TDD (Test-Driven Development), tests should be written **before** implementation. These directories are prepared for when those features need tests, ensuring tests are created first.

## Migration History

**Previous Structure (Removed):**
- `tests/utils/` - Legacy location for core infrastructure tests (migrated to `tests/core/`)
- `tests/commands/handlers/` - Legacy location for handlers (migrated to `tests/features/*/handlers/`)
- `tests/webviews/` - Legacy atomic design structure (migrated to `tests/webview-ui/`)

**Migration Plan:** See `.rptc/plans/reorganize-tests-to-match-code-structure/` for full migration details.

**Git History:** Tests retain their git history through `git mv` operations. Use `git log --follow [test-file]` to see full history including pre-migration commits.

## Writing New Tests

### Test File Naming
- **Pattern:** `[source-file-name].test.ts` or `.test.tsx`
- **Example:** `src/core/shell/pollingService.ts` → `tests/core/shell/pollingService.test.ts`

### Test File Location
- **Rule:** Mirror the source file's location in `src/`
- **Example:**
  - Source: `src/features/authentication/services/authenticationService.ts`
  - Test: `tests/features/authentication/services/authenticationService.test.ts`

### Test Structure (AAA Pattern)
```typescript
import { functionUnderTest } from '@/core/utils/someUtility';

describe('functionUnderTest', () => {
  it('should return expected result when given valid input', () => {
    // Arrange: Set up test data and conditions
    const input = { key: 'value' };

    // Act: Execute the code under test
    const result = functionUnderTest(input);

    // Assert: Verify the outcome
    expect(result).toEqual({ processedKey: 'processedValue' });
  });
});
```

### React Component Test Structure
```typescript
import { render, screen } from '@testing-library/react';
import { Spinner } from '@/webview-ui/shared/components/ui/Spinner';

describe('Spinner', () => {
  it('should render with loading message', () => {
    // Arrange & Act
    render(<Spinner message="Loading data..." />);

    // Assert
    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });
});
```

## Test Coverage

**Coverage Target:** 80% overall, 100% for critical paths

**Current Coverage:** Run `npm test -- --coverage` to view latest coverage report.

**Excluded from Coverage:**
- Type definition files (`*.d.ts`)
- Main extension entry point (`src/extension.ts`)
- Test files themselves

**Coverage Reports:**
- Terminal output (summary)
- `coverage/lcov-report/index.html` (detailed HTML report)

## Troubleshooting

### Test Discovery Issues

**Problem:** Jest doesn't find tests after adding new test file

**Solution:**
1. Verify file naming: `*.test.ts` or `*.test.tsx`
2. Verify location matches `testMatch` pattern in `jest.config.js`
3. Clear Jest cache: `npx jest --clearCache`
4. List discovered tests: `npm test -- --listTests`

### Import Resolution Failures

**Problem:** `Cannot find module '@/core/...'` or similar

**Solution:**
1. Verify `moduleNameMapper` in `jest.config.js` includes path alias
2. Check TypeScript paths in `tsconfig.json` match Jest config
3. Restart TypeScript server in VS Code

### React Test Errors

**Problem:** `ReferenceError: document is not defined`

**Solution:**
1. Ensure test file is in `tests/webview-ui/` (React project uses jsdom)
2. Verify `jest.config.js` React project `testMatch` includes file
3. Check test imports `@testing-library/react` correctly

## Additional Resources

- **Jest Documentation:** https://jestjs.io/docs/getting-started
- **Testing Library:** https://testing-library.com/docs/react-testing-library/intro/
- **VS Code Extension Testing:** https://code.visualstudio.com/api/working-with-extensions/testing-extension

---

**For Development Guidelines:** See `CLAUDE.md` and `src/CLAUDE.md`
**For Architecture Overview:** See `docs/architecture/overview.md`
```

**Rationale:** Provides comprehensive test documentation for developers. Includes structure overview, running tests, path aliases, TDD placeholders, migration history, and troubleshooting.

---

### Phase 5: Update docs/README.md (Add Testing Section)

**File:** `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/docs/README.md`

**Location to Update:** After line 63 (in "By Topic" section)

**Content to Add:**

```markdown

**Testing**
- Test organization → [Test README](../tests/README.md)
- Running tests → [Test README - Running Tests](../tests/README.md#running-tests)
- Writing new tests → [Test README - Writing New Tests](../tests/README.md#writing-new-tests)
- Test coverage → [Test README - Test Coverage](../tests/README.md#test-coverage)
```

**Insertion Point:** After the "Error Handling" section, before "### By Audience"

**Rationale:** Makes test documentation discoverable from main documentation index.

---

### Phase 6: Final Verification (Ensure No Old References Remain)

**Objective:** Confirm all old test path references have been replaced.

**Commands to Run:**

```bash
# Search for any remaining old test path references
grep -r "tests/utils" *.md docs/*.md src/CLAUDE.md 2>/dev/null
grep -r "tests/commands/handlers" *.md docs/*.md src/CLAUDE.md 2>/dev/null
grep -r "tests/webviews" *.md docs/*.md src/CLAUDE.md 2>/dev/null

# If any matches found, investigate and update those files
# Exclude .rptc/ directories (historical records)
```

**Expected Result:** No matches (all old references replaced)

**Decision:** If grep finds matches:
1. **In .rptc/complete/ or .rptc/plans/**: IGNORE (historical records)
2. **In CLAUDE.md, src/CLAUDE.md, docs/**: UPDATE to use new paths
3. **In README.md**: UPDATE if test structure mentioned

---

### Phase 7: Link Verification

**Objective:** Ensure all documentation links resolve correctly.

**Manual Verification Steps:**

1. **Open tests/README.md**
   - Click link to `CLAUDE.md` (should open root CLAUDE.md)
   - Click link to `src/CLAUDE.md` (should open src/CLAUDE.md)
   - Click link to `docs/architecture/overview.md` (should open overview)

2. **Open docs/README.md**
   - Click new link to `../tests/README.md` (should open tests README)
   - Verify all subsection links work (Running Tests, Writing New Tests, etc.)

3. **Open src/CLAUDE.md**
   - Verify reference to `tests/README.md` is correct

**Automated Link Check (Optional):**
```bash
# Check if referenced files exist
ls -la tests/README.md CLAUDE.md src/CLAUDE.md docs/README.md docs/architecture/overview.md

# All should exist (no "No such file" errors)
```

---

## Acceptance Criteria

### Completion Checklist

**Documentation Files Updated:**
- [ ] Root CLAUDE.md updated (Technology Stack section references new test structure)
- [ ] src/CLAUDE.md updated (Testing Approach section documents structure-aligned organization)
- [ ] tests/README.md created (comprehensive test documentation)
- [ ] docs/README.md updated (Testing section added to Quick Navigation)

**Content Quality:**
- [ ] All old test path references removed from documentation (tests/utils/, tests/commands/handlers/, tests/webviews/)
- [ ] New test structure accurately documented (tests/core/, tests/features/, tests/webview-ui/)
- [ ] Path aliases documented consistently across all files (@/core/, @/features/, etc.)
- [ ] TDD placeholder directories explained in tests/README.md
- [ ] Migration history documented in tests/README.md
- [ ] Running tests commands provided for Node, React, and combined execution

**Verification:**
- [ ] `grep -r "tests/utils" *.md docs/*.md src/CLAUDE.md` returns no matches
- [ ] `grep -r "tests/commands/handlers" *.md docs/*.md src/CLAUDE.md` returns no matches
- [ ] `grep -r "tests/webviews" *.md docs/*.md src/CLAUDE.md` returns no matches (excluding .rptc/ historical records)
- [ ] All internal documentation links resolve correctly (no broken links)
- [ ] Test path examples in documentation match actual file locations
- [ ] Documentation mentions correct test count (91 files after Step 4 consolidation)

**Quality Gates:**
- [ ] All test examples reference actual existing test files
- [ ] Documentation readable by developers unfamiliar with codebase
- [ ] No conflicting information between documentation files
- [ ] Jest configuration references accurate (jest.config.js patterns documented correctly)

---

## Dependencies

### Files This Step Depends On

**Source Files (Read-Only):**
- `jest.config.js` - Reference for testMatch patterns and project configuration
- `tests/core/` - Example test locations for documentation
- `tests/features/` - Example test locations for documentation
- `tests/webview-ui/` - Example test locations for documentation
- `.rptc/plans/reorganize-tests-to-match-code-structure/overview.md` - Migration plan reference

**Documentation Files (Modified):**
- `CLAUDE.md` - Root project instructions
- `src/CLAUDE.md` - Source code architecture documentation
- `docs/README.md` - Documentation index

**New Documentation (Created):**
- `tests/README.md` - Comprehensive test documentation

### Files This Step Affects

**Direct Impact:**
- 4 documentation files (3 updated, 1 created)

**Indirect Impact:**
- Developer onboarding (easier test discovery)
- Future test file creation (clear guidelines in tests/README.md)
- Git blame/history searches (migration history documented)

---

## Rollback Plan

### If Documentation Updates Fail

**Scenario 1: Incorrect Documentation Content**

**Problem:** Documentation contains errors (wrong paths, broken examples)

**Rollback:**
```bash
# Discard unstaged changes to documentation files
git checkout -- CLAUDE.md src/CLAUDE.md docs/README.md tests/README.md

# Or restore specific file
git checkout -- tests/README.md

# Re-attempt Phase 4 with corrected content
```

**Verification:** Re-read updated files, verify test paths match actual locations.

---

### Scenario 2: Broken Documentation Links

**Problem:** Internal links don't resolve (404 errors)

**Rollback:**
```bash
# Restore documentation to pre-update state
git checkout -- CLAUDE.md src/CLAUDE.md docs/README.md tests/README.md

# Fix link targets before re-applying updates
# Example: Fix ../tests/README.md vs ./tests/README.md path issues
```

**Verification:** Manually click all links in updated documentation.

---

### Scenario 3: Incomplete Old Reference Removal

**Problem:** Some old test path references remain in documentation

**Recovery (No Rollback Needed):**
```bash
# Find remaining old references
grep -r "tests/utils" *.md docs/*.md src/CLAUDE.md

# Update files with remaining references
# Re-run Phase 6 verification
```

**Verification:** Grep returns no matches after fixes.

---

### Scenario 4: Lost Documentation During Update

**Problem:** Accidentally deleted important content during editing

**Rollback:**
```bash
# Restore specific file from last commit
git checkout HEAD -- src/CLAUDE.md

# Or restore all documentation files
git checkout HEAD -- CLAUDE.md src/CLAUDE.md docs/README.md

# Re-apply updates more carefully
```

**Prevention:** Use Edit tool instead of Write tool for existing files to preserve content.

---

## Expected Outcome

### After Step 7 Completion

**Documentation State:**
- All 4 documentation files updated with new test structure
- Zero references to old test paths (tests/utils/, tests/commands/handlers/, tests/webviews/) in documentation
- Comprehensive tests/README.md created as single source of truth for test organization
- Developers can discover tests easily by consulting tests/README.md

**Developer Experience:**
- New developers understand test organization immediately from tests/README.md
- Test file locations obvious (mirror src/ structure)
- Running tests documented with clear examples (Node, React, combined)
- TDD placeholder directories explained (not confusing empty directories)

**Verification Commands:**
```bash
# Verify documentation files updated
ls -la CLAUDE.md src/CLAUDE.md tests/README.md docs/README.md

# Verify no old test path references remain
grep -r "tests/utils" *.md docs/*.md src/CLAUDE.md  # Should return no matches
grep -r "tests/commands/handlers" *.md docs/*.md src/CLAUDE.md  # Should return no matches
grep -r "tests/webviews" *.md docs/*.md src/CLAUDE.md  # Should return no matches

# Verify test structure documented matches reality
ls -la tests/core/ tests/features/ tests/webview-ui/  # Should match tests/README.md structure
```

---

## Notes for Implementation

### Best Practices

1. **Use Edit Tool for Existing Files:** Use Edit tool for CLAUDE.md, src/CLAUDE.md, docs/README.md to preserve surrounding content. Only use Write tool for new file (tests/README.md).

2. **Cross-Reference Examples:** When documenting test paths in tests/README.md, use `ls` to verify paths exist before including in documentation.

3. **Link Verification:** After creating tests/README.md, manually click all internal links to ensure they resolve correctly.

4. **Avoid Over-Specific Details:** Don't document exact test counts ("91 tests") unless necessary—use generic language ("all tests") to avoid documentation drift.

5. **Reference Step 5 README Files:** Check tests/core/base/README.md and similar Step 5 placeholder READMEs for TDD placeholder language consistency.

### Common Pitfalls

**Pitfall 1: Updating .rptc/ Historical Files**
- **Issue:** Grep finds old test paths in .rptc/complete/ or .rptc/plans/
- **Solution:** IGNORE those files (historical records of completed work)

**Pitfall 2: Inconsistent Path Alias Documentation**
- **Issue:** One file says `@/core/`, another says `src/core/`
- **Solution:** Always use path aliases (`@/core/`) consistently across all documentation

**Pitfall 3: Broken Relative Links**
- **Issue:** `../tests/README.md` vs `./tests/README.md` confusion
- **Solution:** Test links from documentation file's location before committing

**Pitfall 4: Outdated Test Count**
- **Issue:** Documenting "92 test files" when Step 4 reduced to 91
- **Solution:** Avoid specific numbers or verify count with `find tests -name "*.test.ts*" | wc -l`

---

## Success Metrics

**Quantitative:**
- 0 old test path references in documentation (verified by grep)
- 4 documentation files updated (3 existing, 1 new)
- 100% of internal documentation links resolve correctly

**Qualitative:**
- Developer can find test for any source file in <30 seconds using tests/README.md
- New contributors understand test organization from reading tests/README.md
- TDD placeholder directories no longer confusing (explained in documentation)

---

**Step Complete When:**
- [ ] All 4 documentation files updated
- [ ] tests/README.md created with comprehensive structure documentation
- [ ] All old test path references removed from documentation
- [ ] All internal documentation links verified working
- [ ] Grep verification commands return zero matches for old paths
- [ ] Step 7 acceptance criteria 100% complete

---

_Documentation update step created by Master Feature Planner_
_Final step in test reorganization plan (Steps 1-7)_
