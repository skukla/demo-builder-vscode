# Testing Guide

## Quick Reference

### Development Workflow (Fastest)

**During active development (recommended):**
```bash
# Terminal 1: Auto-compile on changes
npm run watch

# Terminal 2: Watch mode for tests you're working on
npm run test:watch -- tests/features/prerequisites

# Press 'p' in watch mode to filter tests by pattern
# Press 'a' to run all tests
# Press 'q' to quit
```

**Result**: 5-10 second feedback loop per change

### Fast Test Commands

```bash
# Skip compilation/lint, run all tests (75% CPU cores)
npm run test:fast                # ~3-5 min (vs 20 min)

# Only test files changed since last commit
npm run test:changed             # ~30s-2 min

# Test a specific file
npm run test:file -- tests/path/to/file.test.ts   # ~5-10s

# Skip pretest (compile/lint) but run all tests
npm run test:no-compile          # ~10-12 min (vs 20 min)
```

### Test by Type

```bash
# Only Node.js tests (no React/UI tests)
npm run test:unit                # ~2-3 min

# Only React/UI tests
npm run test:ui                  # ~30s-1 min

# Only integration tests
npm run test:integration         # varies
```

### Full Validation (Slowest)

```bash
# Full pretest + lint + all tests (what CI runs)
npm test                         # ~10-15 min (first run)
                                 # ~2-3 min (cached)
```

---

## Test Optimization Features

### 1. Jest Cache (Automatic)
- First run: ~10-15 min
- Subsequent runs: ~2-3 min (80% faster)
- Cache location: `.jest-cache/` (gitignored)
- Clear cache: `rm -rf .jest-cache`

### 2. Parallel Execution
- Uses 75% of CPU cores by default
- 8-core machine: ~6 tests in parallel
- Override: `npm test -- --maxWorkers=4`

### 3. Smart Test Selection
- `--onlyChanged`: Only tests affected by your changes
- `--watch`: Continuous testing with smart re-runs
- `--testPathPattern`: Filter by file path

---

## Common Scenarios

### I'm working on a single feature

```bash
# Best: Watch mode for instant feedback
npm run test:watch -- tests/features/my-feature

# Alternative: Run once
npm run test:file -- tests/features/my-feature/myService.test.ts
```

### I want to verify my changes before committing

```bash
# Test only what changed
npm run test:changed

# If all pass, optionally run full suite
npm run test:fast
```

### I need full validation (like CI)

```bash
# Full suite with pretest
npm test
```

### Tests are failing and I want to debug

```bash
# Run single file with full output
npm run test:file -- tests/path/to/failing.test.ts

# Or use watch mode for rapid iteration
npm run test:watch -- tests/path/to/failing.test.ts
```

---

## Time Savings

| Command | Time | Use Case |
|---------|------|----------|
| `npm run test:watch` | 5-10s per change | Active development |
| `npm run test:file` | 5-10s | Single file testing |
| `npm run test:changed` | 30s-2 min | Pre-commit validation |
| `npm run test:fast` | 3-5 min | Full validation without rebuild |
| `npm test` | 10-15 min first run<br>2-3 min cached | CI/final validation |

---

## Tips & Tricks

### 1. Use Watch Mode Effectively

In watch mode, you have interactive commands:
- **`p`** - Filter by file path pattern
- **`t`** - Filter by test name pattern
- **`a`** - Run all tests
- **`f`** - Run only failed tests
- **`q`** - Quit watch mode

### 2. Test-Driven Development Workflow

```bash
# Terminal 1: Watch tests
npm run test:watch -- tests/features/my-feature

# Terminal 2: Watch compilation
npm run watch

# Write test → see it fail → write code → see it pass
```

### 3. Debug Specific Test

```bash
# Add .only to focus on one test
it.only('should do something', () => {
  // ...
});

# Run in watch mode for rapid iteration
npm run test:watch -- tests/path/to/file.test.ts
```

### 4. Skip Slow Tests During Development

```bash
# Mark slow tests with .skip
it.skip('slow integration test', () => {
  // ...
});
```

### 5. Clear Jest Cache if Tests Behave Oddly

```bash
rm -rf .jest-cache
npm run test:fast
```

---

## CI/CD Integration

The standard `npm test` command is optimized for CI:
- Runs pretest (compile + lint)
- Executes all tests
- Uses caching for subsequent runs
- Provides full validation

**GitHub Actions example:**
```yaml
- name: Run tests
  run: npm test
  # First run: ~10-15 min
  # Subsequent runs with cache: ~2-3 min
```

---

## Troubleshooting

### Tests are still slow after optimization

1. **Check if cache is working:**
   ```bash
   ls -la .jest-cache
   # Should see cache files after first run
   ```

2. **Check parallel execution:**
   ```bash
   npm test -- --maxWorkers=4
   # Should see 4 tests running in parallel
   ```

3. **Profile slow tests:**
   ```bash
   npm test -- --verbose
   # Shows execution time per test
   ```

### Cache is causing issues

```bash
# Clear cache and run
rm -rf .jest-cache
npm run test:fast
```

### Watch mode isn't detecting changes

```bash
# Restart watch mode
# Press 'q' to quit, then restart
npm run test:watch
```

---

## Advanced Usage

### Run tests with coverage

```bash
npm run test:coverage
```

### Run tests matching a pattern

```bash
npm test -- --testNamePattern="should handle errors"
```

### Run tests in specific directory

```bash
npm test -- tests/features/prerequisites
```

### Debug with Node.js debugger

```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

Then attach VS Code debugger to Node process.

---

## Best Practices

1. **Use watch mode during active development** for instant feedback
2. **Run `test:changed` before committing** to catch regressions
3. **Use `test:fast` for quick full validation** without waiting for compile
4. **Let CI run full `npm test`** for final validation
5. **Keep tests fast** - slow tests discourage running them
6. **Use `.only` and `.skip` judiciously** during debugging
7. **Clear cache if behavior is unexpected** - cache corruption is rare but possible

---

## Summary

**For 99% of development:**
```bash
npm run test:watch -- tests/path/to/working-on
```

**Before committing:**
```bash
npm run test:changed
```

**When you need full validation:**
```bash
npm run test:fast
```

**What CI runs:**
```bash
npm test
```

That's it! You now have 5-10 second test iteration instead of 20 minute waits.
