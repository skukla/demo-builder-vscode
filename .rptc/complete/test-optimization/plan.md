# Test Execution Optimization Plan

## Current Bottlenecks (20+ minute test runs)

### 1. **PRETEST OVERHEAD** (~8-10 minutes)
```json
"pretest": "npm run compile && npm run lint"
```

**Problem**: Every `npm test` runs:
- Full TypeScript compilation (~2-3 min)
- Webpack bundling (~7-8 min)
- ESLint on all files (~1 min)

**Solution**: Skip pretest during rapid iteration

### 2. **SEQUENTIAL TEST EXECUTION** (~10-15 minutes)
- 164 test files running sequentially
- Jest defaults to `maxWorkers=50%` of CPU cores
- Node environment + React environment = double overhead

**Solution**: Parallelize more aggressively

### 3. **NO TEST CACHING**
- Jest cache not configured
- Re-runs all tests every time

**Solution**: Enable Jest cache

---

## Optimization Strategies

### Strategy 1: Fast Test Scripts (IMMEDIATE)

Add these to `package.json`:

```json
{
  "scripts": {
    "test:fast": "jest --maxWorkers=75%",
    "test:changed": "jest --onlyChanged",
    "test:file": "jest --maxWorkers=1",
    "test:no-compile": "jest"
  }
}
```

**Usage**:
- `npm run test:fast` - Skip compile/lint, use 75% CPU cores (~2-3 min)
- `npm run test:changed` - Only test files changed since last commit (~30s-1min)
- `npm run test:file -- path/to/test.ts` - Single file (~5-10s)
- `npm run test:no-compile` - Skip pretest hook (~10-12 min → ~2-3 min)

### Strategy 2: Enable Jest Caching (HIGH IMPACT)

Update `jest.config.js`:

```javascript
module.exports = {
  // ... existing config
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  // ... rest
};
```

**Impact**:
- First run: ~10-12 min
- Subsequent runs: ~2-3 min (80% faster)

### Strategy 3: Optimize Webpack for Tests (MEDIUM IMPACT)

The webpack compilation is the slowest part. Two approaches:

**A. Skip webpack in pretest** (tests don't need bundled webview code):
```json
"pretest": "npm run compile:typescript && npm run lint"
```

**B. Use webpack cache**:
```javascript
// webpack.config.js
cache: {
  type: 'filesystem',
  buildDependencies: {
    config: [__filename],
  },
}
```

### Strategy 4: Parallel Test Execution (HIGH IMPACT)

Update `jest.config.js`:

```javascript
module.exports = {
  // ... existing config
  maxWorkers: '75%', // Use 75% of CPU cores by default
  // ... rest
};
```

**Impact**: With 8 cores, runs ~6 tests in parallel vs 4

### Strategy 5: Test Splitting by Type (WORKFLOW OPTIMIZATION)

```json
{
  "scripts": {
    "test:unit": "jest --selectProjects node --testPathIgnorePatterns='integration'",
    "test:integration": "jest --testPathPattern='integration'",
    "test:ui": "jest --selectProjects react"
  }
}
```

**Usage**: Run only the tests you need

### Strategy 6: Watch Mode for Development (BEST FOR ITERATION)

```bash
npm run test:watch -- tests/path/to/feature
```

**Benefits**:
- Only runs tests related to changed files
- Keeps Jest warm (no startup overhead)
- Interactive test selection

---

## Recommended Workflow

### During Active Development:
```bash
# Terminal 1: Keep TypeScript compiling
npm run watch

# Terminal 2: Watch mode for tests you're working on
npm run test:watch -- tests/features/prerequisites
```

**Result**: ~5-10s feedback loop per change

### Before Committing:
```bash
# Run only changed tests
npm run test:changed

# If all pass, run full suite once
npm run test:fast
```

**Result**: ~2-3 min for changed tests, ~3-5 min for full suite

### CI/Full Validation:
```bash
# Full pretest + all tests
npm test
```

**Result**: ~10-12 min (acceptable for final validation)

---

## Expected Time Savings

| Scenario | Before | After | Savings |
|----------|--------|-------|---------|
| Single file test | 20 min | 10 sec | 99% |
| Changed files only | 20 min | 1-2 min | 90% |
| Full suite (fast) | 20 min | 3-5 min | 75% |
| Full suite (cached) | 20 min | 2-3 min | 85% |
| Watch mode iteration | 20 min | 5-10 sec | 99.5% |

---

## Implementation Priority

1. ✅ **IMMEDIATE** (0 min): Use `npm run test:no-compile` or add fast scripts
2. ✅ **HIGH** (2 min): Enable Jest cache in config
3. ✅ **HIGH** (2 min): Set maxWorkers to 75% in config
4. ✅ **MEDIUM** (5 min): Skip webpack in pretest
5. ✅ **WORKFLOW** (0 min): Use watch mode during development

---

## Quick Wins (No Code Changes)

**Right now, you can:**

1. Skip pretest entirely:
   ```bash
   npm run test:no-compile
   ```
   **Saves ~8-10 minutes**

2. Run only changed tests:
   ```bash
   npm test -- --onlyChanged
   ```
   **Saves 90% of test time**

3. Run single file:
   ```bash
   npm test -- tests/path/to/specific.test.ts
   ```
   **Saves 99% of test time**

4. Use watch mode:
   ```bash
   npm test -- --watch
   ```
   **5-10s per iteration**

---

## Next Steps

Want me to:
1. ✅ Add the fast test scripts to package.json
2. ✅ Update jest.config.js with cache and maxWorkers
3. ✅ Optimize the pretest script
4. ✅ Create a .jestrc or update documentation

All of these changes are non-breaking and can be implemented immediately.
