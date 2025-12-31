# SOP Violations Remediation Plan

**Created:** 2025-12-31
**Revised:** 2025-12-31 (Conservative scope to avoid re-over-engineering)
**Status:** Ready for Review
**Trigger:** SOP scan revealed 34 violations after over-engineering remediation

---

## Executive Summary

The SOP scan identified 34 violations across the codebase. After review, we're taking a **conservative approach** to avoid re-introducing the over-engineering patterns we just removed.

**Guiding Principles:**
1. **Only fix what's clearly broken** - Not everything flagged needs fixing
2. **No new abstraction layers** - Extract code, don't abstract it
3. **Use established patterns** - Apply TIMEOUTS constants we just created
4. **Defer speculative work** - Wait for actual pain before "improving"

---

## Revised Scope

| Original Phase | Action | Rationale |
|----------------|--------|-----------|
| 1. Magic Timeouts | **Keep** | Uses TIMEOUTS pattern we established |
| 2. God Files | **Reduce** | Only fix if >500 lines with clear separation |
| 3. DI Consistency | **Keep** | Simplification, not abstraction |
| 4. Complex Expressions | **Keep** | Named functions, not layers |
| 5. Component Extraction | **Keep** | With strict criteria (2+ usages OR >100 lines) |
| 6. Missing Facades | **Keep** | Standard barrel exports |
| 7. Inline Styles | **Keep** | Move to CSS classes (per PM preference) |
| 8. Validation Chains | **Defer** | Readable as-is, not causing issues |

**Reduced violation count:** 34 → ~25 actionable items

---

## Phase 1: Magic Timeout Constants (HIGH)

**Violations:** 3 files with magic timeout numbers
**Effort:** ~30 minutes
**Risk:** Low

### Files to Fix

1. **`src/core/ui/components/TimelineNav.tsx`**
   - Issue: Uses hardcoded delay values
   - Fix: Import `FRONTEND_TIMEOUTS` from `@/core/ui/utils/frontendTimeouts`

2. **`src/features/eds/ui/steps/DaLiveSetupStep.tsx:30`**
   - Issue: `setTimeout(..., 2000)` magic number
   - Fix: Use `FRONTEND_TIMEOUTS.ANIMATION_SETTLE` or appropriate semantic constant

3. **Documentation files** (README.md) - These are examples, not violations

### Implementation Pattern

```typescript
// ❌ Before (magic number)
setTimeout(() => setStep('next'), 2000);

// ✅ After (semantic constant)
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
setTimeout(() => setStep('next'), FRONTEND_TIMEOUTS.ANIMATION_SETTLE);
```

### Acceptance Criteria
- [ ] No raw numeric timeouts in UI components
- [ ] All timeouts use `FRONTEND_TIMEOUTS.*` or `TIMEOUTS.*` constants
- [ ] Constants have clear semantic names

---

## Phase 2: God File Review (HIGH) - CONSERVATIVE

**Original:** 8 files flagged over 300-line threshold
**Revised:** Only address files >500 lines with clearly separable concerns

### Conservative Assessment

| File | Lines | Action | Rationale |
|------|-------|--------|-----------|
| ConfigureScreen.tsx | 712 | **Review** | Only if hooks can be cleanly extracted |
| executor.ts | 637 | **Skip** | Already refactored in over-engineering work |
| dashboardHandlers.ts | 553 | **Skip** | Handler logic is cohesive, splitting adds fragmentation |
| authenticationHandlers.ts | 435 | **Skip** | Under 500 threshold |
| edsDaLiveAuthHandlers.ts | 424 | **Skip** | Under 500 threshold |
| lifecycleHandlers.ts | 407 | **Skip** | Under 500 threshold |
| TimelineNav.tsx | 376 | **Skip** | Under 500 threshold |
| edsGitHubHandlers.ts | 339 | **Skip** | Under 500 threshold |

### ConfigureScreen.tsx (712 lines) - Conditional Fix

**Only proceed if:**
1. File has clearly separable hook logic (state management vs rendering)
2. Extracted hook would be 100+ lines (worth the file overhead)
3. No new abstractions needed (no base classes, interfaces, factories)

**Check first:**
```bash
# See if useConfigureFields hook already exists
ls -la src/features/dashboard/ui/configure/hooks/
```

**If hook exists and is complete:** Mark as done, no further action.
**If hook is incomplete:** Extract remaining state logic only.

### What We Will NOT Do

```typescript
// ❌ NO new base classes
class BaseConfigureSection { ... }

// ❌ NO factories
const createFieldRenderer = (type) => { ... }

// ❌ NO interfaces for single implementations
interface IConfigureState { ... }

// ❌ NO splitting just because "it's big"
// 500 lines of cohesive logic > 5 files of 100 lines each
```

### Acceptance Criteria
- [ ] Only ConfigureScreen.tsx reviewed (others skipped)
- [ ] No new abstraction patterns introduced
- [ ] If no clean extraction exists, leave file as-is
- [ ] All tests still pass

---

## Phase 3: DI Consistency (HIGH)

**Violation:** 30+ files using `new Logger()` or `getLogger()` instead of context injection
**Effort:** ~2 hours
**Risk:** Low-Medium (systematic find/replace)

### Current State Analysis

Files using direct instantiation:
- `src/features/authentication/services/*` (19 files)
- `src/features/eds/services/*` (10 files)
- `src/features/mesh/services/*` (1 file)

### Strategy: Pragmatic Consistency

**Option A: Full context injection** (more work, highest consistency)
- Pass logger via constructor/context everywhere
- Requires updating all call sites

**Option B: Singleton getter** (less work, acceptable consistency)
- Use `getLogger()` consistently everywhere
- Already works, just standardize

**Recommendation: Option B** - Use `getLogger()` as the standard pattern for services.

### Implementation Steps

1. **Define standard pattern:**
   ```typescript
   // ✅ Standard service pattern
   import { getLogger } from '@/core/logging';

   const logger = getLogger();

   export function myServiceFunction(): void {
       logger.info('Operation started');
   }
   ```

2. **Update files using `new Logger()`:**
   - Replace `new Logger('name')` with `getLogger()`
   - Logger name inferred from file/function context

3. **Handler context remains unchanged:**
   ```typescript
   // Handlers still use context.logger (correct pattern)
   export const handleAction = async (context: HandlerContext) => {
       context.logger.info('Handling action');
   };
   ```

### Acceptance Criteria
- [ ] No `new Logger()` in services (use `getLogger()`)
- [ ] Handlers use `context.logger` consistently
- [ ] Logger naming is consistent

---

## Phase 4: Complex Expression Extraction (MEDIUM)

**Violations:** 5 files with complex inline expressions
**Effort:** ~1-2 hours
**Risk:** Low

### Pattern: Inline → Named Helper

```typescript
// ❌ Complex inline (cognitive load)
const isEditable = project?.status !== 'running' &&
                   project?.mesh?.status !== 'deploying' &&
                   !isLoading && userHasPermission;

// ✅ Named predicate (self-documenting)
const isEditable = canEditProject(project, isLoading, userHasPermission);

// In helpers file:
export function canEditProject(
    project: Project | undefined,
    isLoading: boolean,
    userHasPermission: boolean
): boolean {
    if (!project) return false;
    if (project.status === 'running') return false;
    if (project.mesh?.status === 'deploying') return false;
    if (isLoading) return false;
    return userHasPermission;
}
```

### Files to Review

Scan for patterns matching:
- Ternary chains (`a ? b : c ? d : e`)
- Long boolean expressions (3+ conditions)
- Complex object constructions inline

### Acceptance Criteria
- [ ] No nested ternaries
- [ ] Boolean expressions with 3+ conditions extracted to predicates
- [ ] Complex object constructions use builder helpers

---

## Phase 5: Component Extraction (MEDIUM)

**Violations:** 6 components flagged for extraction opportunities
**Effort:** ~2 hours
**Risk:** Medium (must apply strict criteria)

### Strict Extraction Criteria

Only extract a component if ONE of these is true:
1. **Actual duplication** - Same pattern used in 2+ places
2. **Size threshold** - Component section is >100 lines with clear boundary
3. **Testing benefit** - Extraction would make unit testing significantly easier

**Do NOT extract if:**
- It "looks like it could be reused someday"
- It's just "cleaner" to separate
- You're creating a component with only 1 usage

### What We Will NOT Create

```typescript
// ❌ NO base components for single variants
abstract class BaseCard { ... }
class ProjectCard extends BaseCard { ... }

// ❌ NO generic wrappers
const withLoadingState = <T>(Component: T) => { ... }

// ❌ NO premature abstractions
interface IListItem { ... }  // with only 1 implementation
```

### What We WILL Create

```typescript
// ✅ Extract when pattern appears 2+ times
// Before: Same 30-line block in ProjectCard and TemplateCard
// After: Shared CardHeader component

// ✅ Extract when section is >100 lines
// Before: 150-line form section inline in ConfigureScreen
// After: ConfigureFormSection component

// ✅ Extract for testability
// Before: Complex render logic mixed with state
// After: Pure presentational component + container with state
```

### Review Process

For each flagged component:
1. Check if pattern exists elsewhere (grep for similar JSX)
2. Count lines of the section
3. Assess testing benefit
4. If none apply → Skip extraction

### Acceptance Criteria
- [ ] Each extraction justified by 1 of 3 criteria
- [ ] No base classes or abstract components created
- [ ] No generic wrappers or HOCs
- [ ] Extracted components are used in 2+ places OR are >100 lines

---

## Phase 6: Missing Handler Facades (MEDIUM)

**Violations:** 3 features missing proper index.ts facades
**Effort:** ~30 minutes
**Risk:** Low

### Features to Check

1. **authentication/handlers/**
   - Has: authenticationHandlers.ts, projectHandlers.ts, workspaceHandlers.ts
   - Needs: index.ts with curated exports

2. **components/handlers/**
   - Has: componentHandlers.ts
   - Needs: index.ts barrel export

3. **sidebar/handlers/**
   - Has: sidebarHandlers.ts
   - Needs: index.ts barrel export

### Implementation Pattern

```typescript
// features/[name]/handlers/index.ts
export { domainHandlers } from './domainHandlers';
export { dispatchHandler } from '@/core/handlers';

// Re-export types if needed by consumers
export type { HandlerContext, HandlerResponse } from '@/types/handlers';
```

### Acceptance Criteria
- [ ] All features have handlers/index.ts
- [ ] Index files export handler maps and dispatchHandler
- [ ] No internal helpers exported (keep private)

---

## ~~Phase 6: Handler Architecture Consistency~~ - DEFERRED

**Status:** Deferred
**Rationale:** Over-engineering remediation already converted registries to object literals. Any remaining inconsistencies are minor and don't warrant immediate action.

**Future trigger:** Only address if we encounter actual bugs or confusion from inconsistency.

---

## Phase 6: Inline Styles → CSS Classes (MEDIUM)

**Violations:** 16 files with inline styles
**Effort:** ~1-2 hours
**Risk:** Low

### Current State

Files with `style={{...}}` patterns:
- `src/core/ui/components/` - 8 files (layout, navigation, feedback)
- `src/features/eds/ui/` - 3 files
- `src/features/sidebar/ui/` - 2 files
- Other scattered files

### Existing CSS Files

The project uses plain CSS organized by concern:
```
src/core/ui/styles/
├── index.css          # Main imports
├── reset.css          # CSS reset
├── tokens.css         # Design tokens
├── vscode-theme.css   # VS Code integration
├── wizard.css         # Wizard-specific
└── custom-spectrum.css # Spectrum overrides

src/features/eds/ui/styles/
└── connect-services.css
```

### Implementation Pattern

```tsx
// ❌ Before (inline style)
<div style={{ marginTop: 16, padding: '8px 12px' }}>

// ✅ After (CSS class)
<div className="content-section">

/* In appropriate .css file */
.content-section {
    margin-top: 16px;
    padding: 8px 12px;
}
```

### Strategy

1. **Group by concern** - Add classes to existing CSS files based on component location
2. **Use semantic names** - `.content-section`, `.status-indicator`, not `.mt-16`
3. **Reuse existing tokens** - Check `tokens.css` for existing spacing/color values

### Files to Fix (Priority Order)

| File | Inline Styles | Target CSS File |
|------|---------------|-----------------|
| TimelineNav.tsx | Layout styles | wizard.css |
| PageLayout.tsx | Container styles | index.css or new layout.css |
| GridLayout.tsx | Grid styles | index.css or new layout.css |
| TwoColumnLayout.tsx | Column styles | index.css or new layout.css |
| SidebarNav.tsx | Nav styles | new sidebar.css |
| WizardProgress.tsx | Progress styles | wizard.css |
| StatusDot.tsx | Status indicator | index.css |
| LoadingOverlay.tsx | Overlay styles | index.css |

### Acceptance Criteria
- [ ] No `style={{...}}` in component files
- [ ] CSS classes have semantic names
- [ ] Styles grouped in appropriate CSS files
- [ ] No utility class explosion (`.mt-4`, `.p-2` etc.)

---

## ~~Phase 7: Validation Chains~~ - DEFERRED

**Status:** Deferred
**Rationale:** Validation chains are readable as-is and not causing issues.

**Future trigger:** Only address if validation logic becomes buggy or hard to maintain.

---

## Implementation Order

```
Single Session (~8-9 hours total):
├── Phase 1: Magic Timeouts (30 min)
├── Phase 2: God Files - ConfigureScreen review only (30 min - 1 hr)
├── Phase 3: DI Consistency (2 hrs)
├── Phase 4: Complex Expressions (1 hr)
├── Phase 5: Component Extraction - with strict criteria (2 hrs)
├── Phase 6: Missing Facades (30 min)
└── Phase 7: Inline Styles → CSS Classes (1-2 hrs)

DEFERRED (not scheduled):
└── Validation Chains - wait for pain
```

**Total Active Work:** ~8-9 hours
**Deferred:** ~1 hour of work we're NOT doing

---

## Anti-Patterns to Avoid During Remediation

1. **Don't add abstraction layers** - Extract, don't abstract
2. **Don't create base classes** for handlers or services
3. **Don't add factory patterns** for simple object creation
4. **Don't over-document** - Code should be self-explanatory
5. **Don't add configuration** where hardcoding works

---

## Verification

After each phase:

```bash
# Run tests
npm test

# Run SOP scan
/sop-scan

# Check for regressions
npm run lint
npm run compile:all
```

---

## Success Metrics

| Metric | Before | Target | Notes |
|--------|--------|--------|-------|
| Magic timeout violations | 3 | 0 | Use FRONTEND_TIMEOUTS constants |
| DI inconsistency instances | 30+ | 0 | Standardize on getLogger() |
| Missing handler facades | 3 | 0 | Add index.ts barrels |
| Complex expressions | ~5 | 0 | Extract to named predicates |
| Files over 500 lines | 2 | 1-2 | Only fix if clean extraction exists |
| Component extractions | 6 flagged | TBD | Only if meets strict criteria |
| Inline styles | 16 files | 0 | Move to CSS classes |

**Intentionally NOT targeting:**
- Files 300-500 lines (acceptable size)
- Validation chains (readable as-is)

---

## Decision Log

### Why Reduced Scope?

**Problem:** The original 34-violation plan risked re-introducing over-engineering patterns we just removed.

**Decision:** Reduce to ~15 actionable items that:
1. Use patterns we already established (TIMEOUTS)
2. Simplify without abstracting (getLogger vs DI containers)
3. Only extract when clearly beneficial

**What we're consciously leaving alone:**
- God files under 500 lines - splitting adds fragmentation
- Handler architecture - already fixed in over-engineering work
- Validation chains - readable as-is

**What we're adding back (PM decisions):**
- Inline styles → CSS classes - Consistent styling approach matters
- Component extraction - With strict criteria (2+ usages OR >100 lines OR testing benefit)

**Principle applied:** "If it ain't broke, don't fix it" > "It could be cleaner"
**Exceptions:** Inline styles violate project standards; component extraction OK with justification.

---

## Notes

- Executor.ts was refactored in over-engineering remediation - likely already acceptable
- ConfigureScreen.tsx may already have hooks extracted - verify before acting
- Authentication services remain complex (19 files) but that's a SEPARATE future effort, not part of this plan

---

_Plan created: 2025-12-31_
_Revised: 2025-12-31 (Conservative scope)_
_Ready for PM approval_
