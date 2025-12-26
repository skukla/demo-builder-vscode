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

### Test File Size Guidelines

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
| 500-750 lines | **Split recommended** |
| >750 lines | **Split required** |

**Why 500 lines?**
- Industry standard (Google, Airbnb, Microsoft)
- Reduces cognitive load (understandable in <5 minutes)
- Improves test isolation and focus
- Reduces memory usage during test execution (40-50% improvement measured)

**Validation Tools:**
```bash
# Check test file sizes locally
npm run validate:test-file-sizes

# Shows warnings for files >500 lines
# Exits with error for files >750 lines
```

**CI/CD Enforcement:**
- GitHub Actions workflow automatically checks test file sizes on PRs
- Workflow: `.github/workflows/test-file-size-check.yml`
- Blocks merging if files exceed 750 lines
- Exclusions can be added to `.testfilesizerc.json` (use sparingly)

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

## Mock Derivation Guidelines

### Pattern: Derive Mocks from Actual JSON

Test mocks for JSON configuration files MUST be derived from actual file structure to prevent mock drift:

1. **Primary pattern**: Use `testUtils.ts` files for shared mock data
2. **Version alignment**: When JSON structure changes (e.g., v2.0 → v3.0.0), add new versioned mocks
3. **Drift detection**: `tests/templates/type-json-alignment.test.ts` catches type/JSON misalignment
4. **Validation tests**: `tests/features/components/services/ComponentRegistryManager-mockValidation.test.ts` validates mock structure

### Example: ComponentRegistryManager.testUtils.ts

```typescript
// v2.0 structure (unified 'components' map)
export const mockRawRegistry: RawComponentRegistry = {
    version: '2.0',
    components: { frontend1: {...}, backend1: {...} }
};

// v3.0.0 structure (separate top-level sections)
export const mockRawRegistryV3: RawComponentRegistry = {
    version: '3.0.0',
    frontends: { eds: {...} },
    backends: { 'adobe-commerce-paas': {...} },
    mesh: { 'commerce-mesh': {...} }
};
```

### When to Update Mocks vs Actual Data

| Scenario | Action |
|----------|--------|
| JSON schema changes | Add new versioned mock (e.g., `mockRawRegistryV4`) |
| Tests fail after JSON update | Verify mock reflects actual structure |
| Adding new JSON field | Add field to mock AND `type-json-alignment.test.ts` |
| Breaking structure change | Keep old mock for backward compatibility tests |

### Key Files

- `tests/templates/type-json-alignment.test.ts` - Catches JSON/TypeScript type drift
- `tests/features/components/services/ComponentRegistryManager.testUtils.ts` - Versioned component mocks
- `tests/features/components/services/ComponentRegistryManager-mockValidation.test.ts` - Mock structure validation

### Why This Matters

The v3.0.0 components.json migration revealed that tests using v2.0 mock structure passed while actual runtime code failed. This pattern prevents that class of bugs by:

1. **Automated detection**: Type alignment tests catch unknown fields immediately
2. **Version clarity**: Separate mock variables for each major version
3. **Documentation**: Clear comments explaining mock derivation source

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
