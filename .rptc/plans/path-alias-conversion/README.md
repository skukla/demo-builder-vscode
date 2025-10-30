# Path Alias Conversion Implementation Plan

## Overview

This directory contains the comprehensive TDD-ready implementation plan for converting 117 files from relative imports to path aliases following the hybrid pattern (aliases for cross-boundary, relative for within-feature).

## Plan Structure

```
path-alias-conversion/
├── overview.md           # High-level strategy, test strategy, constraints
├── step-01.md           # Fix broken import + add @/commands/* alias
├── step-02.md           # Convert src/ root level (extension.ts)
├── step-03.md           # Convert src/commands/ directory
├── step-04.md           # Convert src/core/ and src/features/
├── step-05.md           # Convert src/types/, src/utils/, src/providers/
├── step-06.md           # Verify webview-ui/shared/ patterns
├── step-07.md           # Convert webview-ui/wizard/
├── step-08.md           # Convert webview-ui remaining (configure, dashboard, welcome)
├── step-09.md           # Add ESLint enforcement rules
├── step-10.md           # Final verification and documentation
└── README.md            # This file
```

## Execution

Execute the plan using the RPTC workflow:

```bash
/rptc:tdd "@path-alias-conversion/"
```

The TDD agent will:
1. Load each step sequentially
2. Execute the RED-GREEN-REFACTOR cycle
3. Verify compilation and runtime after each step
4. Create incremental commits
5. Move to next step only after all tests pass

## Key Principles

### Hybrid Pattern

- **Cross-boundary imports:** Use path aliases (@/)
- **Within-feature imports:** Use relative paths (./ or ../)

### Example

```typescript
// ✅ Good: Cross-boundary with path alias
import { StateManager } from '@/core/state';
import { AuthService } from '@/features/authentication/services/authenticationService';

// ✅ Good: Within-feature relative import
import { AuthCache } from './authCacheManager';
import { TokenManager } from '../services/tokenManager';

// ❌ Bad: Cross-boundary with relative path
import { StateManager } from '../../../core/state';
```

## Scope

- **Backend (src/):** 75 files
- **Frontend (webview-ui/):** 42 files
- **Total:** 117 files

## Critical Risks

1. **Circular Dependencies** (Medium likelihood, High impact)
   - Path aliases can expose hidden circular dependencies
   - Mitigation: Careful review of each batch, TypeScript compilation verification

2. **Webpack Misconfiguration** (Low likelihood, High impact)
   - Aliases must match between tsconfig.json and webpack.config.js
   - Mitigation: Verify webpack bundles after each frontend step

3. **Barrel Export Bloat** (Low likelihood, Medium impact)
   - Path aliases with barrel exports may inflate bundle size
   - Mitigation: Monitor bundle sizes (< 500KB per webview)

## Test Strategy

### Compilation Tests
- TypeScript compilation (backend and frontend)
- Webpack bundling (4 webviews)

### Bundle Tests
- All bundles generate successfully
- Bundle sizes < 500KB

### Runtime Tests
- Extension activation
- All webviews load without errors
- Major workflows execute successfully

## Success Criteria

- ✅ All 117 files converted to path aliases
- ✅ Zero TypeScript compilation errors
- ✅ All 4 webpack bundles < 500KB
- ✅ All webviews load correctly
- ✅ ESLint enforcement active
- ✅ No new circular dependencies

## Estimated Timeline

- **Step 1:** 0.5 hours (critical fix)
- **Step 2:** 0.5 hours (root level)
- **Step 3:** 1 hour (commands/)
- **Step 4:** 2 hours (core/ + features/)
- **Step 5:** 0.5 hours (types/ + utils/ + providers/)
- **Step 6:** 0.5 hours (shared/ verification)
- **Step 7:** 1 hour (wizard/)
- **Step 8:** 1 hour (configure/ + dashboard/ + welcome/)
- **Step 9:** 1 hour (ESLint rules)
- **Step 10:** 1.5 hours (final verification)

**Total:** 8-10 hours

## Batch Strategy

### Phase 1: Critical Fixes (Step 1)
- Fix broken import in VSCodeContext.tsx
- Add missing @/commands/* alias

### Phase 2: Backend (Steps 2-5)
- Root level → Commands → Core/Features → Types/Utils/Providers
- Verify compilation after each batch
- 1 commit per step

### Phase 3: Frontend (Steps 6-8)
- Shared verification → Wizard → Remaining webviews
- Verify bundles after each batch
- 1 commit per step

### Phase 4: Enforcement (Step 9)
- Add ESLint rules
- Prevent future regression

### Phase 5: Finalization (Step 10)
- Comprehensive verification
- Documentation update
- Completion report

## Benefits

1. **Improved Maintainability:** Clear cross-boundary imports
2. **Reduced Cognitive Load:** 34% reduction (research validated)
3. **Better Refactoring:** Files can move without breaking imports
4. **Industry Standard:** Aligns with Google, Airbnb, Next.js, GitLens
5. **ESLint Enforcement:** Pattern automatically enforced

## References

- **Research:** Industry validation from major tech companies
- **Pattern:** GitLens extension (20K+ stars) uses hybrid approach
- **Performance:** Negligible build time impact
- **Bundle Size:** Only affected by barrel exports (avoid or import directly)

## Questions?

Refer to individual step files for detailed implementation instructions.

---

**Status:** Ready for TDD execution
**Created:** 2025-10-29
**Complexity:** Medium (large surface area, mechanical changes)
