# Step 1: Webpack + Config Setup

## Purpose

Configure webpack and TypeScript build system to support feature-based UI architecture. This foundational step enables all subsequent feature migrations by establishing the new build structure, path aliases, and code splitting optimization.

**What This Step Accomplishes:**
- Webpack entry points reconfigured from `webview-ui/src/` to `src/features/*/ui/`
- Code splitting configured to extract shared React/Spectrum dependencies
- TypeScript path aliases updated for `@/features` imports
- Jest config updated for colocated test files
- Build verification ensures all configurations work correctly

**Criticality:** HIGH - All subsequent steps depend on this configuration working correctly.

---

## Prerequisites

**External Dependencies:**
- `webpack-bundle-analyzer@^4.10.1` must be installed

**Completed Steps:**
- None (first step in migration)

**Knowledge Requirements:**
- Understanding of webpack entry points and output configuration
- Familiarity with webpack SplitChunksPlugin for code splitting
- TypeScript path mapping (`paths` in tsconfig.json)
- Jest moduleNameMapper configuration

---

## Tests to Write First

### Test Scenario 1: Webpack Configuration Validation

**Given:** Updated webpack.config.js with feature-based entry points
**When:** Running `npm run build`
**Then:**
- All 4 bundles generate successfully (wizard-bundle.js, welcome-bundle.js, dashboard-bundle.js, configure-bundle.js)
- Bundles output to `dist/webview/` directory
- No build errors or warnings

**Test Type:** Integration test
**Coverage Target:** 100% (build must succeed)

### Test Scenario 2: Code Splitting Verification

**Given:** SplitChunksPlugin configured to extract vendors
**When:** Running webpack-bundle-analyzer
**Then:**
- `vendors.js` bundle exists containing React, ReactDOM, @adobe/react-spectrum
- Individual feature bundles are smaller than current sizes
- No duplicate React code across bundles

**Test Type:** Integration test
**Coverage Target:** N/A (visual verification via analyzer)

### Test Scenario 3: TypeScript Path Alias Resolution

**Given:** tsconfig.json updated with `@/features` path mapping
**When:** TypeScript compiler runs (`npx tsc --noEmit`)
**Then:**
- No import resolution errors
- `@/features/welcome/ui/*` imports resolve correctly
- `@/core/ui/*` imports resolve correctly

**Test Type:** Integration test
**Coverage Target:** 100% (no compilation errors)

### Test Scenario 4: Jest Module Resolution

**Given:** jest.config.js updated with moduleNameMapper for `@/features`
**When:** Running `npm test` (even if no tests exist yet)
**Then:**
- Jest starts without module resolution errors
- Test discovery works for colocated test files
- No warnings about unresolved imports

**Test Type:** Integration test
**Coverage Target:** 100% (Jest starts successfully)

### Test Scenario 5: Build Performance Baseline

**Given:** Updated webpack configuration
**When:** Running `npm run build` and measuring time
**Then:**
- Build time recorded as baseline
- Build time is within acceptable range (<10% slower than current)
- Incremental rebuild time measured for development

**Test Type:** Performance test
**Coverage Target:** Baseline measurement only

---

## Edge Cases to Test

**Edge Case 1: Missing Entry Point File**
- **Scenario:** Entry point references non-existent file
- **Expected:** Webpack build fails with clear error message
- **Test:** Temporarily reference missing file, verify error handling

**Edge Case 2: Circular Dependency Between Features**
- **Scenario:** Two features import from each other
- **Expected:** Webpack detects circular dependency, shows warning
- **Test:** Create test circular import, verify detection

**Edge Case 3: Webpack Dev Server Hot Reload**
- **Scenario:** Change file while webpack-dev-server running
- **Expected:** Hot reload works, bundles rebuild successfully
- **Test:** Start dev server, modify file, verify rebuild

---

## Error Conditions to Test

**Error Condition 1: Invalid Webpack Config**
- **Trigger:** Syntax error in webpack.config.js
- **Expected Behavior:** Clear error message on `npm run build`
- **Test:** Introduce syntax error, verify error clarity

**Error Condition 2: Missing TypeScript Path Mapping**
- **Trigger:** Import uses `@/features` but path not mapped
- **Expected Behavior:** TypeScript compilation error
- **Test:** Remove path mapping, verify compiler catches it

**Error Condition 3: Jest Can't Find Tests**
- **Trigger:** testMatch pattern doesn't cover colocated tests
- **Expected Behavior:** No tests found warning
- **Test:** Add test file outside pattern, verify detection fails

---

## Files to Create/Modify

### Modified Files

#### 1. `webpack.config.js` (PRIMARY CHANGE)

**Current State:**
```javascript
entry: {
  wizard: './webview-ui/src/wizard/index.tsx',
  welcome: './webview-ui/src/welcome/index.tsx',
  dashboard: './webview-ui/src/dashboard/index.tsx',
  configure: './webview-ui/src/configure/index.tsx'
}
```

**New State:**
```javascript
entry: {
  wizard: './src/features/project-creation/ui/wizard/index.tsx',
  welcome: './src/features/welcome/ui/index.tsx',
  dashboard: './src/features/dashboard/ui/index.tsx',
  configure: './src/features/dashboard/ui/configure/index.tsx'
},
optimization: {
  splitChunks: {
    cacheGroups: {
      vendors: {
        test: /[\\/]node_modules[\\/](react|react-dom|@adobe\/react-spectrum)/,
        name: 'vendors',
        chunks: 'all',
        priority: 20
      },
      common: {
        minChunks: 2,
        name: 'common',
        chunks: 'all',
        priority: 10,
        reuseExistingChunk: true
      }
    }
  },
  runtimeChunk: 'single'
},
resolve: {
  alias: {
    '@/features': path.resolve(__dirname, 'src/features'),
    '@/shared': path.resolve(__dirname, 'src/shared'),
    '@/types': path.resolve(__dirname, 'src/types')
    // Remove @/webview-ui aliases
  }
}
```

**Changes:**
- Update all 4 entry points to new feature-based paths
- Add SplitChunksPlugin configuration for vendors + common bundles
- Add runtimeChunk configuration
- Update resolve.alias to remove webview-ui references

#### 2. `tsconfig.json` (UPDATE PATH MAPPINGS)

**Changes:**
```json
{
  "compilerOptions": {
    "paths": {
      "@/features/*": ["src/features/*"],
      "@/shared/*": ["src/shared/*"],
      "@/types/*": ["src/types/*"]
      // Remove @/webview-ui/* mappings
    }
  },
  "include": [
    "src/**/*",
    // webview-ui will be removed in later steps
  ]
}
```

**Note:** Keep webview-ui in include temporarily for backward compatibility during migration.

#### 3. `jest.config.js` (UPDATE MODULE MAPPER)

**Changes:**
```javascript
moduleNameMapper: {
  '^@/features/(.*)$': '<rootDir>/src/features/$1',
  '^@/shared/(.*)$': '<rootDir>/src/shared/$1',
  '^@/types/(.*)$': '<rootDir>/src/types/$1',
  // Keep webview-ui mappings temporarily
  '^@/webview-ui/(.*)$': '<rootDir>/webview-ui/src/$1',
  '^@/components/(.*)$': '<rootDir>/webview-ui/src/shared/components/$1',
  '^@/hooks/(.*)$': '<rootDir>/webview-ui/src/shared/hooks/$1'
},
testMatch: [
  '**/tests/**/*.test.ts?(x)',
  '**/src/**/*.test.ts?(x)',  // Add pattern for colocated tests
  '**/__tests__/**/*.ts?(x)'
]
```

#### 4. `package.json` (ADD WEBPACK-BUNDLE-ANALYZER)

**Changes:**
```json
{
  "devDependencies": {
    "webpack-bundle-analyzer": "^4.10.1"
  },
  "scripts": {
    "analyze": "webpack-bundle-analyzer dist/webview/stats.json"
  }
}
```

**Action:** Run `npm install webpack-bundle-analyzer --save-dev`

#### 5. DELETE `tsconfig.webview.json`

**Rationale:** Consolidate to single tsconfig.json with feature paths.

**Action:**
```bash
rm tsconfig.webview.json
```

**Ensure:** webpack.config.js doesn't reference this file anymore.

### Created Files

#### 1. `.rptc/plans/migrate-to-feature-based-ui-architecture/build-baseline.json`

**Purpose:** Record build performance baseline for comparison

**Content:**
```json
{
  "timestamp": "[date]",
  "currentArchitecture": "centralized",
  "buildTimeMs": "[measured]",
  "bundleSizes": {
    "wizard-bundle.js": "[size]",
    "welcome-bundle.js": "[size]",
    "dashboard-bundle.js": "[size]",
    "configure-bundle.js": "[size]"
  }
}
```

---

## Implementation Guidance

### Implementation Order

1. **Install webpack-bundle-analyzer** (`npm install`)
2. **Measure current build baseline** (run build, record times and sizes)
3. **Update tsconfig.json** (add path mappings, keep webview-ui temporarily)
4. **Update jest.config.js** (add moduleNameMapper for features, add testMatch)
5. **Verify TypeScript compilation** (`npx tsc --noEmit` - should still work)
6. **Update webpack.config.js** (change entry points, add code splitting)
7. **Run initial build** (expect failures - entry files don't exist yet)
8. **Create placeholder entry files** (temporary, minimal content to validate config)
9. **Verify build succeeds** (all bundles generate)
10. **Run webpack-bundle-analyzer** (verify vendors bundle created)
11. **Delete placeholder files** (will be created properly in subsequent steps)
12. **Commit configuration changes** (with working build)

### Placeholder Entry Files (Temporary)

Create minimal placeholder files to validate webpack config works:

**`src/features/welcome/ui/index.tsx`:**
```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';

const App = () => <div>Welcome Placeholder</div>;

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
```

Repeat similar pattern for wizard, dashboard, configure entry points.

**IMPORTANT:** These are TEMPORARY. Delete after config validated. Real migration happens in Steps 2-7.

### Verification Commands

**After each config change:**
```bash
# TypeScript compilation
npx tsc --noEmit

# Jest starts
npm test -- --passWithNoTests

# Webpack build
npm run build

# Bundle analysis
npm run analyze
```

### Rollback Strategy

If webpack config breaks:
1. Git stash changes
2. Verify old config still works
3. Re-apply changes incrementally
4. Identify breaking change
5. Fix and retry

---

## Expected Outcome

**After Step 1 Completion:**

✅ **Configuration Files Updated:**
- webpack.config.js has feature-based entry points
- tsconfig.json has @/features path mappings
- jest.config.js supports colocated tests
- webpack-bundle-analyzer installed

✅ **Build System Working:**
- `npm run build` succeeds (with placeholder files)
- Bundles generate: wizard, welcome, dashboard, configure, vendors, runtime
- TypeScript compilation works (`npx tsc --noEmit`)
- Jest starts without errors

✅ **Code Splitting Active:**
- vendors.js contains React/Spectrum (verified via analyzer)
- Individual bundles are smaller than baseline
- No duplicate dependencies across bundles

✅ **Baseline Recorded:**
- Build time measured and documented
- Bundle sizes recorded for comparison
- Ready for incremental feature migrations

**What Works:**
- Build system configured for feature-based architecture
- All config files support new structure
- Code splitting extracts shared dependencies

**What Doesn't Work Yet:**
- No real UI components (only placeholders)
- Extension commands still reference old bundle paths
- Tests don't exist yet

**Next Step:** Step 2 - Migrate Welcome Feature (simplest, validates approach)

---

## Acceptance Criteria

**Definition of Done for Step 1:**

- [x] webpack-bundle-analyzer installed and configured
- [x] webpack.config.js updated with 4 feature-based entry points
- [x] SplitChunksPlugin configured (vendors + runtime)
- [x] tsconfig.json has @/features path mappings
- [x] tsconfig.webview.json deleted (not needed - consolidated to main tsconfig)
- [x] jest.config.js updated with moduleNameMapper + testMatch (already had correct config)
- [x] `npm run build` succeeds with placeholder entry files
- [x] All 6 bundles generated (4 features + vendors + runtime)
- [x] `npx tsc --noEmit` passes with no errors
- [x] `npm test -- --passWithNoTests` runs successfully
- [x] webpack-bundle-analyzer shows vendors bundle contains React/Spectrum
- [x] Build performance baseline recorded in build-baseline.json
- [x] Bundle sizes reduced significantly (feature bundles ~4KB each, vendors 175KB)
- [x] No warnings or errors in webpack output (DefinePlugin conflict resolved)
- [ ] Git commit created: "refactor(webpack): configure feature-based UI architecture" (pending)

**Blocker Conditions (Must Fix Before Proceeding):**

- ❌ If `npm run build` fails, cannot proceed to Step 2
- ❌ If TypeScript compilation fails, path mappings broken
- ❌ If vendors bundle not created, code splitting misconfigured
- ❌ If build time >10% slower, investigate performance regression

---

## Dependencies from Other Steps

**Depends On:**
- None (foundational step)

**Enables:**
- Step 2: Migrate Welcome Feature (needs webpack config)
- Step 3: Migrate Dashboard Feature (needs webpack config)
- Step 4: Migrate Configure Feature (needs webpack config)
- Step 5: Migrate Authentication Feature (needs webpack config)
- Step 6: Migrate Components/Prerequisites/Mesh (needs webpack config)
- Step 7: Migrate Project Creation Wizard (needs webpack config)

**Critical Path:** YES - All subsequent steps blocked until this completes successfully.

---

## Notes

**Why Placeholder Files?**
- Validates webpack config works before migrating real components
- Catches configuration issues early (entry paths, aliases, splitting)
- Provides quick feedback loop (fix config bugs before complex migration)

**Why Delete Placeholders?**
- Real components migrated in Steps 2-7 with proper tests
- Placeholders have no tests, no business logic
- Clean slate for TDD approach in feature migration steps

**Code Splitting Rationale:**
- React/Spectrum (~600KB) duplicated across 4 bundles currently
- Extracting vendors reduces total download by ~1.5MB
- Common bundle extracts shared feature code (WizardContext, utilities)

**Build Performance Concerns:**
- Feature-based structure may increase initial build time
- Persistent caching (`cache: { type: 'filesystem' }`) recommended
- Watch mode rebuild time more important than cold build time

---

_Step 1 establishes the foundation. All configuration working correctly before migrating UI components._
