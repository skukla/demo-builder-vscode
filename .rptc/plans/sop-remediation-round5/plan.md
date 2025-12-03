# SOP Remediation Round 5 - Code Patterns Compliance

**Created**: 2025-11-30
**SOP Version**: 2.1.0
**Total Violations**: 31
**Estimated Steps**: 12

---

## Overview

This plan addresses violations found by `/rptc:helper-sop-scan` against `code-patterns.md` SOP v2.1.0.

### Violation Summary

| Section | Violations | Priority |
|---------|------------|----------|
| §1 Magic Timeouts | 5 | MEDIUM |
| §4 Deep Chaining | 6 | MEDIUM |
| §11 Inline Styles | 18 | MEDIUM |
| §8 Spread Chains | 1 | LOW |
| §10 Validation Chains | 1 | LOW |

---

## Phase 1: Quick Wins (Steps 1-3)

### Step 1: Use Existing `getProjectFrontendPort()` Helper

**Files to modify**:
- `src/features/dashboard/handlers/dashboardHandlers.ts:387`
- `src/features/project-creation/handlers/executor.ts:97`
- `src/core/vscode/StatusBarManager.ts:73`

**Change**:
```typescript
// Before
const port = project.componentInstances?.['citisignal-nextjs']?.port;

// After
import { getProjectFrontendPort } from '@/types/typeGuards';
const port = getProjectFrontendPort(project);
```

**Tests**: Existing tests should pass (no behavior change)

**Acceptance Criteria**:
- [ ] All 3 files import `getProjectFrontendPort` from `@/types/typeGuards`
- [ ] No direct `componentInstances?.['citisignal-nextjs']?.port` access remains
- [ ] All existing tests pass

---

### Step 2: Add SLOW_COMMAND_THRESHOLD Constant

**Files to modify**:
- `src/core/utils/timeoutConfig.ts` - Add constant
- `src/core/logging/debugLogger.ts:208` - Use constant
- `src/core/shell/retryStrategyManager.ts:152` - Use constant
- `src/core/shell/commandSequencer.ts:79` - Use constant

**Change in timeoutConfig.ts**:
```typescript
export const TIMEOUTS = {
    // ... existing constants

    /** Threshold for slow command warnings (3 seconds) */
    SLOW_COMMAND_THRESHOLD: 3000,
} as const;
```

**Standardization Decision**: Use 3000ms (2 of 3 files already use this value)

**Tests**:
- Add test for TIMEOUTS.SLOW_COMMAND_THRESHOLD existence
- Existing tests should pass

**Acceptance Criteria**:
- [ ] `TIMEOUTS.SLOW_COMMAND_THRESHOLD` exported from timeoutConfig.ts
- [ ] All 3 files use `TIMEOUTS.SLOW_COMMAND_THRESHOLD` instead of magic numbers
- [ ] retryStrategyManager.ts threshold lowered from 5000 to 3000 for consistency
- [ ] All existing tests pass

---

### Step 3: Add Progress Duration Constants

**Files to modify**:
- `src/core/utils/timeoutConfig.ts` - Add constants
- `src/core/utils/progressUnifier.ts:540-541` - Use constants

**Change in timeoutConfig.ts**:
```typescript
export const TIMEOUTS = {
    // ... existing constants

    /** Default estimated step duration for short operations (500ms) */
    PROGRESS_ESTIMATED_DEFAULT_SHORT: 500,

    /** Maximum duration cap for immediate operations (1 second) */
    PROGRESS_MIN_DURATION_CAP: 1000,
} as const;
```

**Tests**:
- Add test for new constants existence
- Existing progressUnifier tests should pass

**Acceptance Criteria**:
- [ ] Both new constants exported from timeoutConfig.ts
- [ ] progressUnifier.ts uses constants instead of magic numbers
- [ ] All existing tests pass

---

## Phase 2: New Helpers (Steps 4-6)

### Step 4: Create `getComponentVersion()` Helper

**Files to modify**:
- `src/types/typeGuards.ts` - Add helper
- `src/features/updates/services/updateManager.ts:68` - Use helper

**New helper in typeGuards.ts**:
```typescript
/**
 * Get the installed version of a component from a project
 * @param project - The project to check
 * @param componentId - The component ID to look up
 * @returns The version string or undefined if not found
 */
export function getComponentVersion(
    project: Project | undefined | null,
    componentId: string,
): string | undefined {
    return project?.componentVersions?.[componentId]?.version;
}
```

**Tests**:
- Add unit tests for `getComponentVersion()` in typeGuards tests
- Test with valid project, undefined project, missing component

**Acceptance Criteria**:
- [ ] `getComponentVersion()` exported from typeGuards.ts
- [ ] updateManager.ts uses the helper
- [ ] Unit tests cover all edge cases
- [ ] All existing tests pass

---

### Step 5: Create `getComponentConfigPort()` Helper

**Files to modify**:
- `src/types/typeGuards.ts` - Add helper
- `src/features/project-creation/handlers/executor.ts:99` - Use helper

**New helper in typeGuards.ts**:
```typescript
/**
 * Get the PORT configuration for a component
 * @param componentConfigs - The component configs object
 * @param componentId - The component ID to look up
 * @returns The port number or undefined if not found
 */
export function getComponentConfigPort(
    componentConfigs: Record<string, unknown> | undefined,
    componentId: string,
): number | undefined {
    const config = componentConfigs?.[componentId] as { PORT?: number } | undefined;
    return config?.PORT;
}
```

**Tests**:
- Add unit tests for `getComponentConfigPort()`
- Test with valid config, undefined config, missing component

**Acceptance Criteria**:
- [ ] `getComponentConfigPort()` exported from typeGuards.ts
- [ ] executor.ts uses the helper
- [ ] Unit tests cover all edge cases
- [ ] All existing tests pass

---

### Step 6: Refactor Inline Object.keys in executor.ts

**Files to modify**:
- `src/features/project-creation/handlers/executor.ts:206`

**Change**:
```typescript
// Before
Object.keys(frontendDef.submodules).forEach(id => frontendSubmoduleIds.add(id));

// After - Option 1: Intermediate variable
const submoduleIds = Object.keys(frontendDef.submodules);
submoduleIds.forEach(id => frontendSubmoduleIds.add(id));

// OR After - Option 2: Set constructor (preferred - more idiomatic)
const frontendSubmoduleIds = new Set(Object.keys(frontendDef.submodules));
```

**Tests**: Existing executor tests should pass

**Acceptance Criteria**:
- [ ] No inline `Object.keys().forEach()` chain
- [ ] Behavior unchanged
- [ ] All existing tests pass

---

## Phase 3: Layout Component Refactor (Steps 7-9)

### Step 7: Refactor TwoColumnLayout.tsx Inline Styles

**Files to modify**:
- `src/core/ui/components/layout/TwoColumnLayout.tsx`

**Strategy**: Replace static inline styles with utility classes, keep dynamic styles inline.

**Container div (lines 69-77)**:
```tsx
// Before
style={{
    display: 'flex',
    height: '100%',
    width: '100%',
    flex: '1',
    minHeight: 0,
    gap: translateSpectrumToken(gap),
    alignItems: 'stretch'
}}

// After
className={cn('flex', 'h-full', 'w-full', 'flex-1', 'min-h-0', 'items-stretch', className)}
style={{ gap: translateSpectrumToken(gap) }}
```

**Left column div (lines 82-91)**:
```tsx
// Before - 7 inline properties
// After
className="flex flex-column w-full min-w-0 overflow-hidden"
style={{
    maxWidth: translateSpectrumToken(leftMaxWidth),
    padding: translateSpectrumToken(leftPadding),
}}
```

**Right column div (lines 98-109)**:
```tsx
// Before - 7 inline properties
// After
className="flex-1 flex flex-column overflow-hidden"
style={{
    padding: translateSpectrumToken(rightPadding),
    backgroundColor: rightBackgroundColor,
    borderLeft: showBorder ? '1px solid var(--spectrum-global-color-gray-300)' : undefined,
}}
```

**New utility class needed**:
```css
/* Add to custom-spectrum.css */
.items-stretch { align-items: stretch !important; }
```

**Tests**: Visual regression check (no test file exists)

**Acceptance Criteria**:
- [ ] `.items-stretch` utility class added to custom-spectrum.css
- [ ] Container div uses 6 utility classes + 1 inline style (gap)
- [ ] Left column uses 5 utility classes + 2 inline styles (maxWidth, padding)
- [ ] Right column uses 4 utility classes + 3 inline styles (padding, backgroundColor, borderLeft)
- [ ] Component renders identically (visual check)

---

### Step 8: Refactor GridLayout.tsx Inline Styles

**Files to modify**:
- `src/core/ui/components/layout/GridLayout.tsx`

**Change (lines 59-66)**:
```tsx
// Before
style={{
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: translateSpectrumToken(gap),
    maxWidth: translateSpectrumToken(maxWidth),
    padding: translateSpectrumToken(padding),
    width: '100%'
}}

// After
className={cn('grid', 'w-full', className)}
style={{
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: translateSpectrumToken(gap),
    maxWidth: translateSpectrumToken(maxWidth),
    padding: translateSpectrumToken(padding),
}}
```

**Tests**: Visual regression check

**Acceptance Criteria**:
- [ ] Uses `.grid` and `.w-full` utility classes
- [ ] Dynamic properties remain inline (gridTemplateColumns, gap, maxWidth, padding)
- [ ] Component renders identically

---

### Step 9: Refactor StatusDot.tsx Inline Styles

**Files to modify**:
- `src/core/ui/components/ui/StatusDot.tsx`

**Change (lines 51-58)**:
```tsx
// Before
style={{
    display: 'inline-block',
    width: size,
    height: size,
    borderRadius: '50%',
    backgroundColor: getColor(),
    flexShrink: 0
}}

// After
className="inline-block rounded-full shrink-0"
style={{
    width: size,
    height: size,
    backgroundColor: getColor(),
}}
```

**Tests**: Visual regression check

**Acceptance Criteria**:
- [ ] Uses `.inline-block`, `.rounded-full`, `.shrink-0` utility classes
- [ ] Dynamic properties remain inline (width, height, backgroundColor)
- [ ] Component renders identically

---

## Phase 4: Low Priority (Steps 10-12)

### Step 10: Extract Array Aggregation Helper (Optional - §8)

**Files to modify**:
- `src/features/dashboard/ui/configure/ConfigureScreen.tsx:305-310`
- `src/features/components/services/ComponentRegistryManager.ts:275-280` (if same pattern)

**New helper**:
```typescript
function getAllComponentDefinitions(data: ComponentsData): ComponentData[] {
    return [
        ...(data.frontends ?? []),
        ...(data.backends ?? []),
        ...(data.dependencies ?? []),
        ...(data.integrations ?? []),
        ...(data.appBuilder ?? []),
    ];
}
```

**Note**: This is a borderline violation (array aggregation vs object building). Low priority.

**Acceptance Criteria**:
- [ ] Helper function extracted
- [ ] Both files use the helper (if pattern duplicated)
- [ ] All existing tests pass

---

### Step 11: Extract Auto-Select Validation (Optional - §10)

**Files to modify**:
- `src/core/ui/hooks/useAsyncData.ts:123`

**Change**:
```typescript
// Before
if (autoSelectSingle && Array.isArray(processedData) && processedData.length === 1 && onAutoSelect) {

// After
function shouldAutoSelectSingleItem<T>(
    autoSelectSingle: boolean,
    data: T,
    onAutoSelect: ((item: unknown) => void) | undefined,
): data is T[] {
    return autoSelectSingle && Array.isArray(data) && data.length === 1 && !!onAutoSelect;
}

if (shouldAutoSelectSingleItem(autoSelectSingle, processedData, onAutoSelect)) {
```

**Note**: Low priority - single usage in utility hook, well-commented.

**Acceptance Criteria**:
- [ ] Validation logic extracted to type guard
- [ ] Existing tests pass

---

### Step 12: Final Verification

**Tasks**:
1. Run full test suite: `npm test`
2. Run type check: `npm run compile:typescript`
3. Visual spot-check of refactored layout components
4. Re-run `/rptc:helper-sop-scan` to verify all violations addressed

**Acceptance Criteria**:
- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] Visual regression check passes
- [ ] SOP scan shows 0 violations (or only acceptable borderline cases)

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `src/core/utils/timeoutConfig.ts` | Add 3 new constants |
| `src/core/logging/debugLogger.ts` | Use SLOW_COMMAND_THRESHOLD |
| `src/core/shell/retryStrategyManager.ts` | Use SLOW_COMMAND_THRESHOLD |
| `src/core/shell/commandSequencer.ts` | Use SLOW_COMMAND_THRESHOLD |
| `src/core/utils/progressUnifier.ts` | Use progress constants |
| `src/types/typeGuards.ts` | Add 2 new helpers |
| `src/features/dashboard/handlers/dashboardHandlers.ts` | Use getProjectFrontendPort |
| `src/features/project-creation/handlers/executor.ts` | Use helpers, refactor Object.keys |
| `src/core/vscode/StatusBarManager.ts` | Use getProjectFrontendPort |
| `src/features/updates/services/updateManager.ts` | Use getComponentVersion |
| `src/core/ui/styles/custom-spectrum.css` | Add .items-stretch |
| `src/core/ui/components/layout/TwoColumnLayout.tsx` | Use utility classes |
| `src/core/ui/components/layout/GridLayout.tsx` | Use utility classes |
| `src/core/ui/components/ui/StatusDot.tsx` | Use utility classes |

---

## Test Strategy

- **Steps 1-6**: Unit tests + existing test suite
- **Steps 7-9**: Visual regression (manual) + existing test suite
- **Steps 10-11**: Optional, unit tests if implemented
- **Step 12**: Full verification

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Layout visual regression | LOW | MEDIUM | Manual visual check after each layout step |
| Test failures | LOW | LOW | Run tests after each step |
| Merge conflicts | LOW | LOW | Work on feature branch |

---

## Estimated Effort

| Phase | Steps | Effort |
|-------|-------|--------|
| Phase 1: Quick Wins | 1-3 | ~30 min |
| Phase 2: New Helpers | 4-6 | ~45 min |
| Phase 3: Layout Refactor | 7-9 | ~1 hour |
| Phase 4: Low Priority | 10-12 | ~30 min (optional) |
| **Total** | 12 | ~2.5 hours |
