# Testing Guide - Project-Specific SOP

**Version**: 1.0.0
**Last Updated**: 2025-01-13
**Priority**: Project-specific (overrides plugin default)

---

## Project-Specific Overrides

This project uses **optimized test execution** to achieve 5-10 second feedback loops during TDD. The strategies below are specific to this codebase's Jest configuration.

### Test Execution Performance Requirements

**RPTC TDD workflows MUST use optimized test commands to maintain rapid iteration:**

| Phase | Command | Time | Rationale |
|-------|---------|------|-----------|
| **TDD Implementation** | `npm run test:watch` | 5-10s | Instant feedback during RED-GREEN-REFACTOR |
| **Pre-Commit Validation** | `npm run test:changed` | 30s-2min | Only test affected files |
| **Quality Gate Validation** | `npm run test:fast` | 3-5min | Quick full validation |
| **Final CI Validation** | `npm test` | 2-3min (cached) | Full pretest + lint + tests |

**❌ NEVER use `npm test` during active TDD implementation** - 10+ minute feedback loops violate TDD principles.

---

## Optimized Test Workflow for TDD Phase

### 1. Setting Up TDD Environment

**Before starting TDD implementation:**

```bash
# Terminal 1: Auto-compile TypeScript
npm run watch

# Terminal 2: Watch mode for tests you're implementing
npm run test:watch -- tests/features/your-feature
```

**Benefits:**
- Changes compile automatically in Terminal 1
- Tests auto-run in Terminal 2 when files change
- 5-10 second feedback loop per iteration
- RED → GREEN → REFACTOR cycle is instantaneous

### 2. TDD RED Phase (Write Failing Tests First)

**Watch Mode Workflow:**

1. Write a failing test in your test file
2. Save the file
3. Watch Terminal 2 for test failure (RED) - appears in ~5-10 seconds
4. Verify the test fails for the right reason

**Alternative (Single File Mode):**

```bash
# Run tests once for this file
npm run test:file -- tests/features/your-feature/yourService.test.ts
```

### 3. TDD GREEN Phase (Make Tests Pass)

**Implementation Workflow:**

1. Write minimal code to make the test pass
2. Save the implementation file
3. Watch Terminal 2 for test success (GREEN) - appears in ~5-10 seconds
4. If tests still fail, iterate immediately (no waiting!)

**Watch Mode Commands:**
- **`a`** - Run all tests (if you filtered)
- **`f`** - Run only failed tests
- **`p`** - Filter by file path pattern
- **`t`** - Filter by test name pattern
- **`q`** - Quit watch mode

### 4. TDD REFACTOR Phase (Clean Up Code)

**Refactor with Confidence:**

1. Improve code structure/readability
2. Save the file
3. Watch Terminal 2 - tests re-run automatically
4. If tests stay GREEN, refactor is safe
5. If tests go RED, you broke something - fix it immediately

**The 5-10 second feedback ensures you catch regressions instantly.**

### 5. Quality Gate Validation (Before Master Efficiency/Security Agents)

**After completing all steps for a feature:**

```bash
# Quick full validation (3-5 min)
npm run test:fast
```

**Only run this AFTER all TDD cycles complete** - not during active development.

---

## Test Command Reference

### Development Commands (Use During TDD)

```bash
# ⭐ BEST: Watch mode (5-10s iterations)
npm run test:watch -- tests/features/your-feature

# Single file (5-10s)
npm run test:file -- tests/path/to/file.test.ts

# Changed files only (30s-2min)
npm run test:changed
```

### Validation Commands (Use Before Commit)

```bash
# Fast full validation (3-5 min) - NO compile/lint
npm run test:fast

# Fast validation by type
npm run test:unit           # Node tests only (2-3 min)
npm run test:ui             # React tests only (30s-1min)
npm run test:integration    # Integration tests only
```

### CI Commands (Use for Final Validation)

```bash
# Full pretest + lint + all tests
npm test                    # First run: 10-15 min
                           # Cached runs: 2-3 min
```

---

## RPTC TDD Integration

### When `/rptc:tdd` Agent Implements Steps

**The agent MUST follow this workflow:**

1. **Start watch mode** before writing any tests:
   ```bash
   npm run test:watch -- tests/features/feature-name
   ```

2. **RED Phase**: Write failing tests first
   - Tests should fail in watch mode within 5-10 seconds
   - Agent confirms RED state before proceeding

3. **GREEN Phase**: Implement minimal code
   - Tests should pass in watch mode within 5-10 seconds
   - Agent confirms GREEN state before proceeding

4. **REFACTOR Phase**: Clean up code
   - Tests stay GREEN during refactoring
   - If tests go RED, agent fixes immediately

5. **Validation**: After all steps complete:
   ```bash
   npm run test:fast
   ```

**❌ ANTI-PATTERN**: Agent running `npm test` during TDD implementation
**✅ CORRECT**: Agent using `test:watch` or `test:file` for instant feedback

### Integration with Master Efficiency Agent

**After TDD steps complete and tests pass:**

1. Agent runs `npm run test:fast` for baseline
2. Master Efficiency Agent refactors code
3. Agent runs `npm run test:fast` again to verify refactoring
4. If tests fail, efficiency changes are rolled back

**Watch mode stays active** to catch regressions during efficiency review.

### Integration with Master Security Agent

**After efficiency review:**

1. Master Security Agent reviews code
2. Security fixes are implemented
3. Agent runs `npm run test:fast` to verify fixes
4. If tests fail, security fixes are adjusted

---

## Performance Optimization Features

### Jest Caching (Automatic)

- **First run**: 10-15 min (cache warming)
- **Subsequent runs**: 2-3 min (80% faster)
- **Cache location**: `.jest-cache/` (gitignored)
- **Clear cache**: `rm -rf .jest-cache` (if tests behave oddly)

### Parallel Execution (Automatic)

- Uses 75% of CPU cores by default
- 8-core machine runs ~6 tests in parallel
- Override: `npm test -- --maxWorkers=4`

### Smart Test Selection (Manual)

- `--onlyChanged`: Only tests affected by changes
- `--testPathPattern`: Filter by file path
- `--testNamePattern`: Filter by test name

---

## AI Test Anti-Patterns (Project-Specific)

### ❌ ANTI-PATTERN: Using `npm test` During TDD

```bash
# ❌ BAD: 10+ minute feedback loop
write test → save → npm test → wait 10+ min → see failure

# ✅ GOOD: 5-10 second feedback loop
write test → save → watch mode shows failure in 5-10s
```

**Why**: TDD requires rapid iteration. Waiting 10+ minutes per cycle violates the core TDD principle of immediate feedback.

### ❌ ANTI-PATTERN: Running Full Test Suite for Single Feature

```bash
# ❌ BAD: Testing everything when working on one file
npm test  # 164 test files run

# ✅ GOOD: Test only what you're working on
npm run test:watch -- tests/features/your-feature
```

**Why**: Unnecessary test execution slows development without adding value during active implementation.

### ❌ ANTI-PATTERN: No Watch Mode During Refactoring

```bash
# ❌ BAD: Manual test runs after each refactor
refactor → save → npm test → wait → repeat

# ✅ GOOD: Watch mode catches regressions instantly
refactor → save → tests auto-run in 5-10s → safe to continue
```

**Why**: Refactoring requires confidence that you haven't broken anything. Watch mode provides instant feedback.

### ❌ ANTI-PATTERN: Skipping Pre-Commit Validation

```bash
# ❌ BAD: Commit without testing changed files
git commit -m "feat: new feature"  # CI fails 10 min later

# ✅ GOOD: Test changed files before commit
npm run test:changed  # 30s-2min validation
git commit -m "feat: new feature"  # CI passes
```

**Why**: Catching failures locally (30s-2min) is faster than waiting for CI failure (10+ min).

### ❌ ANTI-PATTERN: Not Using Type-Specific Tests

```bash
# ❌ BAD: Running React tests when only working on backend
npm test  # Runs all 164 test files including UI tests

# ✅ GOOD: Run only relevant tests
npm run test:unit  # Only Node.js tests (2-3 min)
```

**Why**: React tests are slower than Node tests. Don't pay the cost if you're not changing UI code.

---

## Troubleshooting

### Watch Mode Not Detecting Changes

**Symptoms**: Tests don't re-run when you save files

**Solutions**:
1. Quit watch mode (`q`) and restart
2. Check that files are in correct directory (`tests/`)
3. Verify file naming: `*.test.ts` or `*.test.tsx`

### Tests Slow Despite Optimization

**Symptoms**: Tests take longer than expected

**Solutions**:
1. Clear Jest cache: `rm -rf .jest-cache`
2. Check parallel execution: `npm test -- --maxWorkers=4`
3. Profile slow tests: `npm test -- --verbose`

### Cache Corruption

**Symptoms**: Tests pass locally but fail in CI, or vice versa

**Solutions**:
1. Clear cache: `rm -rf .jest-cache`
2. Run fresh: `npm run test:fast`
3. If issue persists, investigate test isolation problems

---

## Quick Reference for AI Agents

### TDD Phase Commands

```bash
# Start TDD (ALWAYS use watch mode)
npm run test:watch -- tests/features/feature-name

# Validate after steps complete
npm run test:fast
```

### Pre-Commit Commands

```bash
# Changed files only
npm run test:changed

# Quick full validation
npm run test:fast
```

### CI/Final Validation

```bash
# Full suite with pretest
npm test
```

### Emergency Commands

```bash
# Clear cache if tests behave oddly
rm -rf .jest-cache

# Single file debugging
npm run test:file -- tests/path/to/file.test.ts
```

---

## Integration with Other SOPs

### Security & Performance SOP Integration

During Master Security Agent review:
- Use `npm run test:fast` (not `npm test`)
- Security fixes must not break existing tests
- New security tests added to relevant test files

### Architecture Patterns SOP Integration

When implementing new patterns:
- Write tests first (TDD)
- Use watch mode for rapid feedback
- Validate pattern with `npm run test:fast`

---

## Summary

**Golden Rule**: During active TDD, ALWAYS use `npm run test:watch` for 5-10 second feedback loops.

**Quick Reference**:
- **TDD Implementation**: `npm run test:watch` (5-10s)
- **Pre-Commit**: `npm run test:changed` (30s-2min)
- **Quality Gate**: `npm run test:fast` (3-5min)
- **Final CI**: `npm test` (2-3min cached)

**For complete documentation, see `TESTING.md` in repository root.**
