# Step 1: Fix Barrel Exports and Structural Issues

## Objective

Fix incorrect barrel export paths and structural issues (circular definitions, duplicate exports, missing modules) to resolve **21 errors** across multiple files.

## Errors Addressed

### Barrel Export Errors (15 errors):
- `webview-ui/src/shared/components/index.ts(24-29)` - 6 errors: Cannot find modules './CompactOption', './ComponentCard', etc.
- `webview-ui/src/shared/components/index.ts(32)` - 1 error: Cannot find module './debug'
- `webview-ui/src/shared/components/ui/index.ts(31, 34, 37, 40, 43, 46, 49, 52)` - 8 errors: Missing type exports

### Structural Errors (6 errors):
- `webview-ui/src/shared/types/index.ts(5-9)` - 5 errors: Circular definitions for ComponentInstance, AdobeConfig, CommerceConfig, Project, ProjectTemplate
- `webview-ui/src/shared/index.ts(18)` - 1 error: Duplicate WizardStep export (already exported from './contexts')

## Root Cause Analysis

### 1. Incorrect Barrel Export Paths
In `webview-ui/src/shared/components/index.ts`, lines 24-29 try to import components from the wrong location:

```typescript
// ❌ WRONG: These files don't exist at this level
export { CompactOption } from './CompactOption';
export { ComponentCard } from './ComponentCard';
export { ConfigurationSummary } from './ConfigurationSummary';
export { DependencyItem } from './DependencyItem';
export { SelectionSummary } from './SelectionSummary';
export { Tip } from './Tip';
```

**Reality**: These components exist in `./ui/` subdirectory and are already exported via `export * from './ui'` on line 9.

### 2. Non-Existent Debug Module
Line 32 exports from `'./debug'` which doesn't exist (no `debug/` directory or `debug.tsx` file).

### 3. Circular Type Definitions
`webview-ui/src/shared/types/index.ts` imports types from `@/types` and re-exports them:

```typescript
import type {
    ComponentInstance,
    AdobeConfig,
    CommerceConfig,
    Project,
    ProjectTemplate
} from '@/types';

// Later...
export type { ComponentInstance, AdobeConfig, CommerceConfig, Project, ProjectTemplate };
```

**Problem**: `@/types` likely imports from `@/webview-ui/shared/types`, creating a circular dependency.

### 4. Duplicate WizardStep Export
`webview-ui/src/shared/index.ts` line 18 exports all from `'./contexts'`, but line 21 tries to export from `'./utils'` which also exports WizardStep, causing a conflict.

## Implementation

### File 1: `webview-ui/src/shared/components/index.ts`

**Action**: Remove duplicate/incorrect exports (lines 24-32 are redundant or wrong)

```typescript
// BEFORE (lines 23-33):
// Feature-Specific Components
export { CompactOption } from './CompactOption';
export { ComponentCard } from './ComponentCard';
export { ConfigurationSummary } from './ConfigurationSummary';
export { DependencyItem } from './DependencyItem';
export { SelectionSummary } from './SelectionSummary';
export { Tip } from './Tip';

// Debug Components
export * from './debug';

// Webview root component
export { WebviewApp, type WebviewAppProps } from './WebviewApp';

// AFTER:
// Note: Feature-specific UI components are already exported via 'export * from ./ui' above
// Webview root component
export { WebviewApp, type WebviewAppProps } from './WebviewApp';
```

**Rationale**: Components are already exported through the `./ui` barrel export on line 9. The duplicate exports on lines 24-29 reference wrong paths. The `./debug` module doesn't exist.

### File 2: `webview-ui/src/shared/types/index.ts`

**Action**: Remove circular re-export, import directly where needed

```typescript
// BEFORE (lines 3-10):
// Import shared types from extension
import type {
    ComponentInstance,
    AdobeConfig,
    CommerceConfig,
    Project,
    ProjectTemplate
} from '@/types';

// ... later (line 95) ...
// Re-export shared types for convenience
export type { ComponentInstance, AdobeConfig, CommerceConfig, Project, ProjectTemplate };

// AFTER:
// Remove both the import and the re-export
// Files that need these types should import directly from @/types
```

**Rationale**: These types are defined in the backend (`src/types/`) and should be imported directly by files that need them. The circular re-export creates confusion and TypeScript errors.

**Note**: This may require updating imports in files that currently use `@/webview-ui/shared/types` for these 5 types. We'll address those in subsequent fixes if they appear.

### File 3: `webview-ui/src/shared/index.ts`

**Action**: Remove duplicate WizardStep export or missing utils module

First, check if `./utils` module exists:

```bash
ls webview-ui/src/shared/utils/index.ts
```

**If `utils/index.ts` exists but doesn't export WizardStep:**
```typescript
// Keep line 21 as-is, the duplicate export warning will resolve
export * from './utils';
```

**If `utils/index.ts` doesn't exist:**
```typescript
// BEFORE (line 21):
export * from './utils';

// AFTER:
// Remove this line (no utils barrel export needed)
```

**Rationale**: Either the utils module doesn't exist (hence the error on line 50), or it exists but conflicts with contexts export. We'll verify and fix appropriately.

## Test Strategy

### Pre-Implementation Tests
```bash
# Baseline: Count current errors
npm run compile:webview 2>&1 | grep "error TS" | wc -l
# Expected: 181 errors
```

### Post-Implementation Tests
```bash
# Test 1: TypeScript compilation
npm run compile:webview

# Expected reduction: ~21 errors resolved (181 → ~160)
# Verify no NEW errors introduced

# Test 2: Webpack build
npm run build:webview

# Should succeed (may have remaining type errors but build should work)
```

### Manual Testing
- **Not required** - No functional changes, only fixing import/export structure
- Functional testing will be done in later steps that affect runtime code

## Acceptance Criteria

- [ ] `webview-ui/src/shared/components/index.ts` has clean exports (no duplicate/wrong paths)
- [ ] `webview-ui/src/shared/types/index.ts` has no circular type definitions
- [ ] `webview-ui/src/shared/index.ts` has no duplicate exports or references to non-existent modules
- [ ] TypeScript error count reduced by ~15-21 errors
- [ ] No NEW errors introduced
- [ ] Webpack build succeeds

## Estimated Time

**15 minutes** (simple structural fixes)

## Risk Level

**Low** - These are pure structural fixes with no runtime impact. The components are already accessible through other export paths.

## Dependencies

None - This is the first step and unblocks subsequent type fixes.

## Notes

- These errors were masked during development because webpack was still able to resolve modules through other paths
- The circular type definitions may have been working due to TypeScript's declaration merging, but are architecturally incorrect
- After this fix, some files may show new errors if they were relying on the circular re-exports - we'll address those in Step 2
