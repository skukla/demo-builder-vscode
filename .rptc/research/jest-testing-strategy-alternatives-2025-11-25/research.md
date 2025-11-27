# Research: Jest Testing Strategy & Alternatives

**Date:** 2025-11-25
**Scope:** Hybrid (Codebase + Web)
**Depth:** Standard
**Project:** Adobe Demo Builder VS Code Extension

---

## Executive Summary

Your test suite has **345 files (~2,300 tests)** with aggressive memory optimizations already in place. The research strongly suggests **Jest + SWC** as the optimal solution - providing **30-75% performance improvement** with minimal migration effort. **Bun is NOT compatible** with VS Code extension testing due to Electron dependencies.

---

## Research Questions

1. Is Jest the best option for this VS Code extension?
2. What alternatives exist (Vitest, Bun, Node.js native)?
3. Why are tests crashing and consuming too much memory?
4. Can Bun replace Node.js for building/testing?

---

## Codebase Analysis

### Current Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| Test Framework | Jest 30.2.0 + ts-jest 29.4.5 | Latest versions |
| Test Files | 345 files (~3,844 tests) | Node: 269, React: 76 |
| Heap Size | 4096MB | All test scripts |
| maxWorkers | 50% | Reduced from 75% |
| Test Timeout | 10 seconds | Fast failure |
| Cache | Enabled | `.jest-cache` directory |

> **Note (2025-11-25):** Original research contained errors. Verified counts: 345 files, ~3,844 tests, 7 files >500 lines.

### Key Configuration Files

- `jest.config.js` (102 lines) - Dual-project setup (Node + React)
- `package.json` (lines 152-162) - Test scripts with memory flags
- `tests/__mocks__/vscode.ts` (168 lines) - VS Code API mock
- `tests/setup/react.ts` (19 lines) - React testing setup

### Test Distribution

```
tests/
├── core/           (~70 files)  - Infrastructure tests
├── features/       (~150 files) - Feature module tests
├── webview-ui/     (~50 files)  - React component tests
├── integration/    (~20 files)  - Integration tests
├── __mocks__/      (3 files)    - Global mocks
└── setup/          (2 files)    - Test setup
```

### Memory Issues Identified

#### 1. Large Test Files (Primary Cause)
- **7 files exceed 500 lines** (corrected from originally claimed 41)
- Largest files:
  - `debugLogger.test.ts` (771 lines)
  - `checkHandler-refactored.test.ts` (689 lines)
  - `transientStateManager.test.ts` (646 lines)
  - `useSelectionStep.test.tsx` (619 lines)
  - `createHandler-refactored.test.ts` (617 lines)
  - `envFileWatcherService.mocked.test.ts` (609 lines)
  - `ProjectDashboardScreen.test.tsx` (520 lines)
- File splitting playbook exists: `docs/testing/test-file-splitting-playbook.md`

#### 2. Missing `workerIdleMemoryLimit`
- Not configured in current `jest.config.js`
- This setting auto-restarts workers when memory threshold reached
- One team reduced CI memory from 60GB to 5GB with this setting

#### 3. Event Listener Cleanup (Less Severe Than Initially Reported)
- 95 event listener patterns found (corrected from originally claimed 758)
- 77 cleanup patterns calling `dispose()` (81% coverage, not 3%)
- VS Code mock has proper `dispose()` method - most tests do call it

#### 4. TypeScript Transformation Overhead
- Inline tsconfig per Jest project (2 compilations)
- No `isolatedModules` flag (forces full type analysis)
- Could reduce RAM from 1465MB to 533MB with `isolatedModules: true`

---

## Web Research: Framework Comparison

### Quick Answer: Should You Switch from Jest?

| Framework | Recommendation | Why |
|-----------|---------------|-----|
| **Jest + SWC** | **RECOMMENDED** | 30-75% faster, zero code changes, 1-2 hour effort |
| **Vitest** | Caution | Slower in CI for many projects, complex vscode mocking |
| **Bun** | **NOT COMPATIBLE** | Cannot run Electron/VS Code extensions |
| **Node.js test** | Not recommended | Immature TypeScript support |

### Bun Compatibility Issue (Critical Finding)

**Bun cannot run VS Code extensions.** Electron fundamentally relies on Node.js APIs that Bun doesn't fully support.

From Stack Overflow:
> "Electron requires Node.js APIs that Bun's compatibility layer doesn't cover. This is a fundamental architectural limitation."

**Source:** https://stackoverflow.com/questions/77295981/how-run-electron-js-with-bun

**Bottom line:** Bun is great for standalone tools but cannot be used for VS Code extension development or testing.

### Performance Benchmarks

| Approach | Improvement | Source |
|----------|-------------|--------|
| Jest + SWC | 75% faster | Microsoft accessibility-insights-web |
| Vitest (local watch) | 10-20x faster | Vitest docs |
| Vitest (CI full suite) | 2-3x **SLOWER** | Multiple real-world reports |
| workerIdleMemoryLimit | Memory: 60GB → 5GB | Community reports |

### Real-World Case Studies

#### Microsoft accessibility-insights-web (Jest + SWC)
- **Before:** 11m54s full suite, 12s single file
- **After:** 3m full suite, 4.3s single file
- **Improvement:** 75% reduction
- **Code changes:** Zero
- **Source:** https://github.com/microsoft/accessibility-insights-web/pull/4336

#### Large React Project (2900+ tests, Jest to Vitest)
- ESM support eliminated 20+ transform rules
- Vitest caught empty snapshots Jest silently passed
- Performance varied: some tests faster, some slower
- **Source:** https://dev.to/56_kode/migration-from-jest-to-vitest-a-real-world-experience-with-2900-tests-39np

#### Angular Project (Jest to Vitest - ROLLED BACK)
- Jest: 90s (local & CI)
- Vitest: 200s (local & CI)
- CI jobs killed due to 7GB memory insufficient
- **Result:** Rolled back to Jest
- **Source:** https://sergeygultyayev.medium.com/from-jest-to-vitest-and-back-078c94dd4b65

### Vitest Migration Pitfalls

1. **CI Performance Regression** - Many teams report 2-3x slower in CI
2. **mockReset Behavior** - Different semantics than Jest
3. **No Auto-Mocking** - `__mocks__` directory not auto-loaded
4. **vscode Module** - Requires alias configuration, not direct mock
5. **Memory Issues** - Out-of-memory with coverage on large suites

---

## Gap Analysis: Current vs Best Practice

| Area | Current State | Best Practice | Gap |
|------|--------------|---------------|-----|
| Transformer | ts-jest | @swc/jest | **30-75% slower** |
| Memory limit | Not set | `workerIdleMemoryLimit: '512MB'` | **Memory leaks persist** |
| File sizes | 7 files > 500 lines | < 300 lines per file | **Minor issue** |
| Event cleanup | 77/95 patterns (81%) | Always call dispose() | **Good coverage** |
| isolatedModules | false | true | **~60% extra RAM** |

---

## Implementation Options

### Option 1: Jest + SWC (Recommended)

**Effort:** 1-2 hours
**Risk:** Low
**Impact:** 30-75% faster

```bash
npm install --save-dev @swc/core @swc/jest
```

```javascript
// jest.config.js changes
module.exports = {
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest"  // Replace ts-jest
  },
  workerIdleMemoryLimit: '512MB',    // Add this
  // ... keep everything else
}
```

**Pros:**
- Zero test code changes
- Proven at Microsoft scale
- Maintains entire Jest ecosystem
- Drop-in replacement

**Cons:**
- No type-checking during transform (add `tsc --noEmit` to CI)

### Option 2: Stay with Jest + Optimize

**Effort:** 2-4 hours
**Risk:** Low
**Impact:** 20-40% improvement

1. Add `workerIdleMemoryLimit: '512MB'` to jest.config.js
2. Add `isolatedModules: true` to ts-jest config
3. Split the 7 files over 600 lines
4. Enforce dispose() in afterEach hooks

```javascript
// jest.config.js
module.exports = {
  workerIdleMemoryLimit: '512MB',
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      isolatedModules: true,  // Add this
      tsconfig: { /* existing */ }
    }]
  }
}
```

### Option 3: Vitest Migration

**Effort:** 2-3 weeks
**Risk:** High
**Impact:** Uncertain

**Only consider if:**
- ESM is critical requirement
- Watch mode is primary bottleneck
- CI has 8GB+ memory available
- Willing to maintain custom vscode mock aliases

**Migration complexity:**
- Different mock factory syntax
- No auto-loading of `__mocks__` directory
- vscode module requires alias configuration
- mockReset behavior differs from Jest

```javascript
// vitest.config.ts (for vscode mocking)
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    alias: {
      vscode: resolve(__dirname, './tests/__mocks__/vscode.ts'),
    },
  },
})
```

---

## Recommended Tools

### @swc/jest
- **Purpose:** Rust-based Jest transformer
- **Adoption:** 2.1M+ weekly npm downloads
- **Why:** 30-75% faster than ts-jest, zero code changes
- **Source:** https://swc.rs/docs/usage/jest

### jest-mock-vscode
- **Purpose:** Pre-built vscode module mock
- **Why:** Reduces boilerplate, proper Uri class behavior
- **Source:** https://github.com/streetsidesoftware/jest-mock-vscode

---

## Common Pitfalls to Avoid

1. **Don't disable test isolation** (`isolate: false`) - masks real issues
2. **Don't migrate to Vitest without CI benchmarks** - local != CI performance
3. **Don't use Bun for VS Code extensions** - Electron incompatible
4. **Don't skip type-checking** - if using SWC, add separate `tsc --noEmit` step
5. **Don't ignore workerIdleMemoryLimit** - prevents memory accumulation

---

## Key Takeaways

1. **Jest is still the right choice** for VS Code extension testing
2. **Replace ts-jest with @swc/jest** for immediate 30-75% improvement
3. **Add `workerIdleMemoryLimit: '512MB'`** to prevent memory accumulation
4. **Bun is not an option** for this project (Electron dependency)
5. **Vitest migration is high-risk** with uncertain CI performance gains
6. **File splitting is minor issue** - only 7 files > 500 lines (not 41 as originally reported)
7. **Event listener cleanup is mostly done** - 81% coverage (77/95 patterns)

---

## Action Items

### Immediate (1-2 hours)
- [ ] Install @swc/core and @swc/jest
- [ ] Replace ts-jest with @swc/jest in jest.config.js
- [ ] Add `workerIdleMemoryLimit: '512MB'`
- [ ] Add `tsc --noEmit` to CI pipeline before tests

### Short-term (1 week)
- [ ] Add `isolatedModules: true` if keeping ts-jest
- [ ] Split 6 largest test files (> 600 lines) - lower priority than originally thought
- [ ] Review remaining 18 event listener patterns missing cleanup (81% already covered)

### Long-term (evaluate quarterly)
- [ ] Re-evaluate Vitest if ESM becomes critical
- [ ] Monitor Bun's Electron compatibility progress

---

## Sources

### Official Documentation
- Vitest Migration Guide: https://vitest.dev/guide/migration.html
- SWC Jest Documentation: https://swc.rs/docs/usage/jest
- Bun Test Runner: https://bun.com/docs/test
- VS Code Extension Testing: https://code.visualstudio.com/api/working-with-extensions/testing-extension

### Real-World Examples
- Microsoft PR #4336: https://github.com/microsoft/accessibility-insights-web/pull/4336
- Dev.to Migration (2900 tests): https://dev.to/56_kode/migration-from-jest-to-vitest-a-real-world-experience-with-2900-tests-39np
- Vitest Rollback: https://sergeygultyayev.medium.com/from-jest-to-vitest-and-back-078c94dd4b65

### Community Resources
- Jest Memory Optimization: https://infinitejs.com/posts/optimizing-jest-memory-usage/
- Speeding up Jest Tests: https://www.jameslmilner.com/posts/speeding-up-typescript-jest-tests/
- VS Code Jest Mocking: https://www.richardkotze.com/coding/unit-test-mock-vs-code-extension-api-jest

---

**Research Completed:** 2025-11-25
**Total Sources Consulted:** 35+
**Confidence Level:** High
