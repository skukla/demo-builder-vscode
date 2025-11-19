# Contributing to Adobe Demo Builder

Thank you for your interest in contributing to the Adobe Demo Builder VS Code extension! This document provides guidelines for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Quality Standards](#code-quality-standards)
- [Testing Guidelines](#testing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Commit Message Guidelines](#commit-message-guidelines)

## Code of Conduct

Please be respectful and professional in all interactions. We're building this together!

## Getting Started

### Prerequisites

- Node.js 18 or later
- VS Code 1.74.0 or later
- npm or yarn

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/skukla/demo-builder-vscode.git
   cd demo-builder-vscode
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the extension:**
   ```bash
   npm run compile
   ```

4. **Run tests:**
   ```bash
   npm test
   ```

5. **Launch the extension:**
   - Press `F5` in VS Code to open the Extension Development Host
   - Or: Run > Start Debugging

## Development Workflow

### Branch Strategy

- `master` - Stable production branch
- `develop` - Active development branch
- `feature/*` - New features
- `fix/*` - Bug fixes
- `refactor/*` - Code improvements

### Making Changes

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the code quality standards below

3. **Run tests** to ensure nothing broke:
   ```bash
   npm test
   ```

4. **Commit your changes** following commit message guidelines

5. **Push to your branch:**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request** on GitHub

## Code Quality Standards

### TypeScript

- **Strict mode enabled** - All TypeScript strict checks are enforced
- **No `any` types** - Use proper typing or `unknown` with type guards
- **Path aliases** - Use `@/` aliases for imports:
  ```typescript
  // ✅ Good
  import { StateManager } from '@/core/state';

  // ❌ Avoid
  import { StateManager } from '../../../src/core/state';
  ```

### Code Organization

- **Feature-based architecture** - Group related files by feature in `src/features/`
- **Mirror structure in tests** - Test files should mirror source file locations
- **Single Responsibility** - Each file/class should have one clear purpose

### Linting

All code must pass ESLint:

```bash
npm run lint
```

**Key ESLint Rules:**
- Max line length: 120 characters
- No unused variables or imports
- Consistent code formatting (use Prettier)

### Formatting

Code is automatically formatted with Prettier:

```bash
# Check formatting
npm run format:check

# Auto-format all files
npm run format
```

## Testing Guidelines

### Test-Driven Development (TDD)

We follow TDD for all new features:

1. **Write tests first** (RED phase)
2. **Implement minimal code** to pass tests (GREEN phase)
3. **Refactor** for quality (REFACTOR phase)

### Test File Size Limits

**Keep test files focused and maintainable:**

| File Size | Action Required |
|-----------|----------------|
| < 300 lines | ✅ Keep as-is |
| 300-500 lines | ⚠️ Monitor, consider splitting |
| 500-750 lines | 🟡 **Split recommended** |
| > 750 lines | 🔴 **Split required** (CI blocks) |

**Why 500 lines?**
- Industry standard (Google, Airbnb, Microsoft guidelines)
- Reduces cognitive load (understandable in < 5 minutes)
- Improves test isolation and focus
- Reduces memory usage (40-50% improvement measured)

**Validation:**
```bash
# Check test file sizes locally
npm run validate:test-file-sizes
```

**CI/CD Enforcement:**
- GitHub Actions automatically checks test file sizes on PRs
- Files > 750 lines will block PR merging
- See `docs/testing/test-file-splitting-playbook.md` for splitting guidance

### Test Coverage

- **Minimum coverage:** 80% overall
- **Critical paths:** 100% coverage required
- **Run coverage:**
  ```bash
  npm run test:coverage
  ```

### Test Structure

Follow the **AAA pattern** (Arrange, Act, Assert):

```typescript
describe('myFunction', () => {
  it('should return expected result when given valid input', () => {
    // Arrange: Set up test data
    const input = { key: 'value' };

    // Act: Execute code under test
    const result = myFunction(input);

    // Assert: Verify outcome
    expect(result).toEqual({ processedKey: 'processedValue' });
  });
});
```

### Test Location

**Rule:** Mirror the source file structure:
- Source: `src/features/authentication/services/authService.ts`
- Test: `tests/features/authentication/services/authService.test.ts`

### Running Tests

```bash
# All tests
npm test

# Specific test file
npm test -- tests/features/authentication/services/authService.test.ts

# Watch mode (for active development)
npm run test:watch

# Coverage report
npm run test:coverage
```

See `tests/README.md` for comprehensive testing documentation.

## Pull Request Process

### Before Submitting

Ensure your PR meets these requirements:

- [ ] All tests pass (`npm test`)
- [ ] Code is linted (`npm run lint`)
- [ ] Code is formatted (`npm run format`)
- [ ] Test coverage maintained or improved
- [ ] Test files are under 750 lines
- [ ] No console.log or debugger statements
- [ ] Documentation updated (if applicable)

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature causing existing functionality to not work as expected)
- [ ] Documentation update

## Testing
Describe testing performed:
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review performed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests added proving fix is effective or feature works
- [ ] All tests passing
```

### Review Process

1. **Automated checks run** - CI/CD pipeline validates:
   - All tests pass
   - Linting passes
   - Test file sizes within limits
   - Code formatted correctly

2. **Code review** - Maintainers review for:
   - Code quality and readability
   - Adherence to architecture patterns
   - Test coverage and quality
   - Documentation completeness

3. **Approval and merge** - Once approved, PR is merged to `develop`

## Commit Message Guidelines

We follow **Conventional Commits** specification:

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring (no functionality change)
- `test`: Adding or updating tests
- `docs`: Documentation changes
- `chore`: Build process, tooling, dependencies
- `perf`: Performance improvements
- `style`: Code style changes (formatting, missing semicolons, etc.)

### Examples

```
feat(authentication): add Adobe SDK integration for faster auth checks

Replaces Adobe CLI calls with Adobe SDK for 30x performance improvement.
- Adds caching layer with 5-minute TTL
- Implements async SDK initialization
- Maintains backward compatibility with existing auth flow
```

```
fix(dashboard): resolve fire-and-forget async test failures

Mocks meshVerifier module to prevent Jest environment teardown errors
during async status checking operations.

Closes #123
```

```
test(staleness): split stalenessDetector tests into focused files

Splits 925-line test file into 6 focused files:
- Edge cases (10 tests)
- File comparison (6 tests)
- Hash calculation (4 tests)
- Initialization (5 tests)
- State detection (7 tests)
- Main integration tests (30 tests)

Reduces memory usage by 45% and improves test execution time.
```

## Additional Resources

- **Project Documentation:** See `CLAUDE.md` and `src/CLAUDE.md`
- **Architecture Guide:** `docs/architecture/overview.md`
- **Testing Guide:** `tests/README.md`
- **Test Splitting Playbook:** `docs/testing/test-file-splitting-playbook.md`

## Questions?

If you have questions about contributing, please:
1. Check existing documentation in `docs/` directory
2. Review `CLAUDE.md` for development guidelines
3. Open an issue on GitHub for clarification

---

**Thank you for contributing to Adobe Demo Builder!** 🎉
