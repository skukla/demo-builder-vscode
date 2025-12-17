# Step 3: Refactor Loading States to Use CenteredFeedbackContainer

## Summary

Update 12+ occurrences across 6 files to use the new `CenteredFeedbackContainer` component instead of inline `<Flex direction="column" justifyContent="center" alignItems="center" height="350px">` patterns. This is the largest refactor step in the extraction plan.

**Pattern Being Replaced:**
```tsx
// Current duplicated pattern (12+ occurrences)
<Flex direction="column" justifyContent="center" alignItems="center" height="350px">
    <LoadingDisplay ... />
</Flex>
```

**Replacement:**
```tsx
// Standardized component
<CenteredFeedbackContainer>
    <LoadingDisplay ... />
</CenteredFeedbackContainer>
```

**Scope:** This step is purely mechanical refactoring - no behavior changes, only import updates and component swaps.

---

## Prerequisites

- [x] Step 1 completed (ProjectStatusUtils extracted)
- [x] Step 2 completed (CenteredFeedbackContainer created)
- [ ] CenteredFeedbackContainer tests passing
- [ ] CenteredFeedbackContainer exported from barrel file

---

## Tests to Write First

**Note:** This step involves refactoring existing code. The primary test strategy is to ensure existing tests continue to pass after each file change. No new tests are required unless existing test coverage is insufficient.

### Pre-Refactor Verification

- [ ] **Test: Run all existing tests before starting**
  - **Given:** Current codebase with inline Flex patterns
  - **When:** Run `npm test`
  - **Then:** All tests pass (baseline established)
  - **Command:** `npm run test:fast` or `npm test`

### Per-File Verification Strategy

For each file modified, verify:

- [ ] **Test: Existing component tests still pass after refactor**
  - **Given:** File refactored to use CenteredFeedbackContainer
  - **When:** Run tests for that feature area
  - **Then:** All tests pass without modification
  - **Pattern:** `npm test -- tests/features/[feature-name]/`

### Files with Existing Tests

| File | Related Test Location | Command |
|------|----------------------|---------|
| SelectionStepContent.tsx | tests/features/authentication/ | `npm test -- tests/features/authentication/` |
| AuthLoadingState.tsx | tests/features/authentication/ | `npm test -- tests/features/authentication/` |
| ProjectCreationStep.tsx | tests/features/project-creation/ | `npm test -- tests/features/project-creation/` |
| ComponentConfigStep.tsx | tests/features/components/ | `npm test -- tests/features/components/` |
| ApiMeshStep.tsx | tests/features/mesh/ | `npm test -- tests/features/mesh/` |
| MeshStatusDisplay.tsx | tests/features/mesh/ | `npm test -- tests/features/mesh/` |

---

## Files to Modify

### Category A: Simple Replacements (8 occurrences)

These are straightforward 1:1 replacements where the Flex wraps simple content.

#### File 1: AuthLoadingState.tsx

- [ ] `src/features/authentication/ui/steps/components/AuthLoadingState.tsx`
  - **Line 13:** Replace Flex wrapper with CenteredFeedbackContainer
  - **Type:** Simple LoadingDisplay wrapper
  - **Import to add:** `import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';`
  - **Import to remove:** `Flex` from '@adobe/react-spectrum' (entire component replaced)

**Current (line 13):**
```tsx
<Flex direction="column" justifyContent="center" alignItems="center" height="350px">
    <LoadingDisplay
        size="L"
        message={message}
        subMessage={subMessage}
        helperText={helperText}
    />
</Flex>
```

**After:**
```tsx
<CenteredFeedbackContainer>
    <LoadingDisplay
        size="L"
        message={message}
        subMessage={subMessage}
        helperText={helperText}
    />
</CenteredFeedbackContainer>
```

#### File 2: SelectionStepContent.tsx

- [ ] `src/features/authentication/ui/components/SelectionStepContent.tsx`
  - **Line 128:** Replace Flex wrapper with CenteredFeedbackContainer
  - **Type:** Simple LoadingDisplay wrapper
  - **Import to add:** `import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';`
  - **Import to keep:** `Flex` still used elsewhere in file (line 12)

**Current (line 128):**
```tsx
<Flex direction="column" justifyContent="center" alignItems="center" height="350px">
    <LoadingDisplay
        size="L"
        message={labels.loadingMessage}
        subMessage={labels.loadingSubMessage}
        helperText="This could take up to 30 seconds"
    />
</Flex>
```

**After:**
```tsx
<CenteredFeedbackContainer>
    <LoadingDisplay
        size="L"
        message={labels.loadingMessage}
        subMessage={labels.loadingSubMessage}
        helperText="This could take up to 30 seconds"
    />
</CenteredFeedbackContainer>
```

#### File 3: ComponentConfigStep.tsx (2 occurrences)

- [ ] `src/features/components/ui/steps/ComponentConfigStep.tsx`
  - **Line 49:** Error state - simple Text wrapper
  - **Line 59:** Loading state - simple LoadingDisplay wrapper
  - **Import to add:** `import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';`
  - **Import to keep:** `Flex` still used at line 95

**Current (line 49):**
```tsx
<Flex direction="column" justifyContent="center" alignItems="center" height="350px">
    <Text UNSAFE_className="text-red-700">
        {loadError}
    </Text>
</Flex>
```

**After (line 49):**
```tsx
<CenteredFeedbackContainer>
    <Text UNSAFE_className="text-red-700">
        {loadError}
    </Text>
</CenteredFeedbackContainer>
```

**Current (line 59):**
```tsx
<Flex direction="column" justifyContent="center" alignItems="center" height="350px">
    <LoadingDisplay
        size="L"
        message="Loading component configurations..."
    />
</Flex>
```

**After (line 59):**
```tsx
<CenteredFeedbackContainer>
    <LoadingDisplay
        size="L"
        message="Loading component configurations..."
    />
</CenteredFeedbackContainer>
```

#### File 4: ApiMeshStep.tsx (1 simple occurrence)

- [ ] `src/features/mesh/ui/steps/ApiMeshStep.tsx`
  - **Line 56:** Checking state - simple LoadingDisplay wrapper
  - **Note:** Line 88 is complex (handled in Category B)
  - **Import to add:** `import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';`
  - **Import to keep:** `Flex` still used at line 88-100

**Current (line 56):**
```tsx
<Flex direction="column" justifyContent="center" alignItems="center" height="350px">
    <LoadingDisplay
        size="L"
        message={message}
        subMessage={subMessage}
        helperText={helperText}
    />
</Flex>
```

**After (line 56):**
```tsx
<CenteredFeedbackContainer>
    <LoadingDisplay
        size="L"
        message={message}
        subMessage={subMessage}
        helperText={helperText}
    />
</CenteredFeedbackContainer>
```

#### File 5: ProjectCreationStep.tsx (3 simple occurrences)

- [ ] `src/features/project-creation/ui/steps/ProjectCreationStep.tsx`
  - **Line 61:** Active creation state - simple LoadingDisplay
  - **Line 75:** Opening project transition - simple LoadingDisplay
  - **Line 123:** Initial loading state - simple LoadingDisplay
  - **Note:** Lines 82 and 101 are complex (handled in Category B)
  - **Import to add:** `import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';`
  - **Import to keep:** `Flex` still used in complex sections

**Current (line 61):**
```tsx
<Flex direction="column" justifyContent="center" alignItems="center" height="350px">
    <LoadingDisplay
        size="L"
        message={progress.currentOperation || 'Processing'}
        subMessage={progress.message}
        helperText="This could take up to 3 minutes"
    />
</Flex>
```

**After (line 61):**
```tsx
<CenteredFeedbackContainer>
    <LoadingDisplay
        size="L"
        message={progress.currentOperation || 'Processing'}
        subMessage={progress.message}
        helperText="This could take up to 3 minutes"
    />
</CenteredFeedbackContainer>
```

**Current (line 75):**
```tsx
<Flex direction="column" justifyContent="center" alignItems="center" height="350px">
    <LoadingDisplay
        size="L"
        message="Loading your projects..."
    />
</Flex>
```

**After (line 75):**
```tsx
<CenteredFeedbackContainer>
    <LoadingDisplay
        size="L"
        message="Loading your projects..."
    />
</CenteredFeedbackContainer>
```

**Current (line 123):**
```tsx
<Flex direction="column" justifyContent="center" alignItems="center" height="350px">
    <LoadingDisplay
        size="L"
        message="Initializing"
        subMessage="Preparing to create your project..."
    />
</Flex>
```

**After (line 123):**
```tsx
<CenteredFeedbackContainer>
    <LoadingDisplay
        size="L"
        message="Initializing"
        subMessage="Preparing to create your project..."
    />
</CenteredFeedbackContainer>
```

---

### Category B: Complex Replacements (4 occurrences)

These have the outer centering Flex, but contain additional nested Flex/content structures that remain unchanged.

#### File 5: ProjectCreationStep.tsx (2 complex occurrences)

- [ ] `src/features/project-creation/ui/steps/ProjectCreationStep.tsx`
  - **Line 82:** Success state with CheckmarkCircle and nested Flex
  - **Line 101:** Error state with AlertCircle, nested Flex, and Buttons

**Current (line 82 - Success state):**
```tsx
<Flex direction="column" justifyContent="center" alignItems="center" height="350px">
    <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
        <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
        <Flex direction="column" gap="size-100" alignItems="center">
            <Text UNSAFE_className="text-xl font-medium">
                Project Created Successfully
            </Text>
            <Text UNSAFE_className="text-sm text-gray-600 text-center">
                Click below to view your projects
            </Text>
        </Flex>
    </Flex>
</Flex>
```

**After (line 82):**
```tsx
<CenteredFeedbackContainer>
    <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
        <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
        <Flex direction="column" gap="size-100" alignItems="center">
            <Text UNSAFE_className="text-xl font-medium">
                Project Created Successfully
            </Text>
            <Text UNSAFE_className="text-sm text-gray-600 text-center">
                Click below to view your projects
            </Text>
        </Flex>
    </Flex>
</CenteredFeedbackContainer>
```

**Current (line 101 - Error state):**
```tsx
<Flex direction="column" justifyContent="center" alignItems="center" height="350px">
    <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
        <AlertCircle size="L" UNSAFE_className="text-red-600" />
        <Flex direction="column" gap="size-100" alignItems="center">
            <Text UNSAFE_className="text-xl font-medium">
                {isCancelled ? 'Project Creation Cancelled' : 'Project Creation Failed'}
            </Text>
            {progress?.error && (
                <Text UNSAFE_className="text-sm text-gray-600">{progress.error}</Text>
            )}
        </Flex>

        {/* Buttons centered with error content - matches ApiMeshStep */}
        <Flex gap="size-150" marginTop="size-300">
            <Button variant="secondary" onPress={onBack}>Back</Button>
        </Flex>
    </Flex>
</Flex>
```

**After (line 101):**
```tsx
<CenteredFeedbackContainer>
    <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
        <AlertCircle size="L" UNSAFE_className="text-red-600" />
        <Flex direction="column" gap="size-100" alignItems="center">
            <Text UNSAFE_className="text-xl font-medium">
                {isCancelled ? 'Project Creation Cancelled' : 'Project Creation Failed'}
            </Text>
            {progress?.error && (
                <Text UNSAFE_className="text-sm text-gray-600">{progress.error}</Text>
            )}
        </Flex>

        {/* Buttons centered with error content - matches ApiMeshStep */}
        <Flex gap="size-150" marginTop="size-300">
            <Button variant="secondary" onPress={onBack}>Back</Button>
        </Flex>
    </Flex>
</CenteredFeedbackContainer>
```

#### File 4: ApiMeshStep.tsx (1 complex occurrence)

- [ ] `src/features/mesh/ui/steps/ApiMeshStep.tsx`
  - **Line 88:** Ready for mesh creation state with nested content

**Current (line 88):**
```tsx
<Flex direction="column" justifyContent="center" alignItems="center" height="350px">
    <Flex direction="column" gap="size-200" alignItems="center">
        <Info size="L" UNSAFE_className="text-blue-600" />
        <Flex direction="column" gap="size-100" alignItems="center">
            <Text UNSAFE_className="text-xl font-medium">Ready for Mesh Creation</Text>
            <Text UNSAFE_className="text-sm text-gray-600 text-center-max-450">
                API Mesh API is enabled. Click below to create a new mesh.
            </Text>
        </Flex>
        <Button variant="accent" marginTop="size-300" onPress={createMesh}>
            Create Mesh
        </Button>
    </Flex>
</Flex>
```

**After (line 88):**
```tsx
<CenteredFeedbackContainer>
    <Flex direction="column" gap="size-200" alignItems="center">
        <Info size="L" UNSAFE_className="text-blue-600" />
        <Flex direction="column" gap="size-100" alignItems="center">
            <Text UNSAFE_className="text-xl font-medium">Ready for Mesh Creation</Text>
            <Text UNSAFE_className="text-sm text-gray-600 text-center-max-450">
                API Mesh API is enabled. Click below to create a new mesh.
            </Text>
        </Flex>
        <Button variant="accent" marginTop="size-300" onPress={createMesh}>
            Create Mesh
        </Button>
    </Flex>
</CenteredFeedbackContainer>
```

#### File 6: MeshStatusDisplay.tsx (1 complex occurrence)

- [ ] `src/features/mesh/ui/steps/components/MeshStatusDisplay.tsx`
  - **Line 24:** Status display with nested content inside FadeTransition

**Current (line 24):**
```tsx
<FadeTransition show={true}>
    <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
        <Flex direction="column" gap="size-200" alignItems="center">
            {isError ? (
                <>
                    <AlertCircle size="L" UNSAFE_className="text-orange-600" />
                    {/* ... error content ... */}
                </>
            ) : (
                <>
                    <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
                    {/* ... success content ... */}
                </>
            )}
            {/* ... buttons ... */}
        </Flex>
    </Flex>
</FadeTransition>
```

**After (line 24):**
```tsx
<FadeTransition show={true}>
    <CenteredFeedbackContainer>
        <Flex direction="column" gap="size-200" alignItems="center">
            {isError ? (
                <>
                    <AlertCircle size="L" UNSAFE_className="text-orange-600" />
                    {/* ... error content ... */}
                </>
            ) : (
                <>
                    <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
                    {/* ... success content ... */}
                </>
            )}
            {/* ... buttons ... */}
        </Flex>
    </CenteredFeedbackContainer>
</FadeTransition>
```

---

## Implementation Details

### Recommended Refactoring Order

Execute in this order for easiest verification:

1. **AuthLoadingState.tsx** (simplest - entire component is just the wrapper)
2. **ComponentConfigStep.tsx** (2 simple occurrences)
3. **SelectionStepContent.tsx** (1 simple occurrence)
4. **ApiMeshStep.tsx** (1 simple + 1 complex)
5. **MeshStatusDisplay.tsx** (1 complex within FadeTransition)
6. **ProjectCreationStep.tsx** (3 simple + 2 complex - most changes)

### File-by-File Refactor Process

For each file, follow this process:

#### 1. AuthLoadingState.tsx

```bash
# Step 1: Verify current tests pass
npm test -- tests/features/authentication/

# Step 2: Make changes
# - Replace entire Flex wrapper with CenteredFeedbackContainer
# - Update imports (remove Flex, add CenteredFeedbackContainer)

# Step 3: Verify tests still pass
npm test -- tests/features/authentication/

# Step 4: Build verification
npm run build
```

**Import changes:**
```typescript
// Before
import React from 'react';
import { Flex } from '@adobe/react-spectrum';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';

// After
import React from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
```

#### 2. ComponentConfigStep.tsx

**Import changes (add, keep Flex):**
```typescript
// Add to imports
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
// Keep Flex - still used at line 95
```

#### 3. SelectionStepContent.tsx

**Import changes (add, keep Flex):**
```typescript
// Add to imports
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
// Keep Flex in destructured imports - still used elsewhere
```

#### 4. ApiMeshStep.tsx

**Import changes (add, keep Flex):**
```typescript
// Add to imports
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
// Keep Flex - still used in nested structures
```

#### 5. MeshStatusDisplay.tsx

**Import changes (add, keep Flex):**
```typescript
// Add to imports
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
// Keep Flex - still used in nested structures
```

#### 6. ProjectCreationStep.tsx

**Import changes (add, keep Flex):**
```typescript
// Add to imports
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
// Keep Flex - still used extensively in nested structures and footer
```

---

## Expected Outcome

After completing this step:

- [ ] 12 occurrences of inline Flex centering pattern replaced with CenteredFeedbackContainer
- [ ] All existing tests continue to pass without modification
- [ ] Build succeeds without errors
- [ ] Visual behavior identical (no UI changes)
- [ ] Reduced code duplication across 6 files
- [ ] Consistent centering pattern via single component

**Code Reduction:**
- Before: 12 instances of `<Flex direction="column" justifyContent="center" alignItems="center" height="350px">`
- After: 12 instances of `<CenteredFeedbackContainer>`
- Savings: ~15-20 lines per file (import + props)

---

## Acceptance Criteria

### Pre-Refactor

- [ ] All existing tests passing before starting
- [ ] Build succeeds before starting

### Per-File Refactor

- [ ] AuthLoadingState.tsx updated and tests passing
- [ ] ComponentConfigStep.tsx updated (2 occurrences) and tests passing
- [ ] SelectionStepContent.tsx updated and tests passing
- [ ] ApiMeshStep.tsx updated (2 occurrences) and tests passing
- [ ] MeshStatusDisplay.tsx updated and tests passing
- [ ] ProjectCreationStep.tsx updated (5 occurrences) and tests passing

### Post-Refactor

- [ ] All tests passing: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] ESLint passing: `npm run lint`
- [ ] No unused imports (Flex removed where no longer needed)
- [ ] No console.log or debugger statements added
- [ ] Visual verification: Loading states display correctly in wizard

### Code Quality

- [ ] CenteredFeedbackContainer imported from correct path in all files
- [ ] Consistent import ordering (library imports, then local imports)
- [ ] No breaking changes to component behavior
- [ ] Nested Flex structures preserved (only outer centering Flex replaced)

---

## Estimated Time

**3-4 hours total**

| Task | Time |
|------|------|
| Pre-refactor test verification | 15 min |
| AuthLoadingState.tsx | 15 min |
| ComponentConfigStep.tsx | 20 min |
| SelectionStepContent.tsx | 15 min |
| ApiMeshStep.tsx | 30 min |
| MeshStatusDisplay.tsx | 20 min |
| ProjectCreationStep.tsx | 45 min |
| Final verification and cleanup | 30 min |
| Build and lint verification | 15 min |
| Visual smoke testing | 15 min |

---

## Risk Assessment

### Risk 1: Test Failures After Refactor

- **Likelihood:** Low
- **Impact:** Medium
- **Mitigation:** Run tests after each file change, not at the end
- **Contingency:** Revert individual file if tests fail, investigate before proceeding

### Risk 2: Visual Differences

- **Likelihood:** Very Low (component uses same Flex props)
- **Impact:** Medium
- **Mitigation:** Visual smoke testing in VS Code after all changes
- **Contingency:** Adjust CenteredFeedbackContainer props if needed

### Risk 3: Import Path Errors

- **Likelihood:** Low
- **Impact:** Low (build will fail immediately)
- **Mitigation:** Verify import path exists before starting
- **Contingency:** Update barrel file exports if needed

---

## Notes

### Key Design Decision

The CenteredFeedbackContainer only replaces the OUTER centering Flex. Inner Flex structures for content layout (icons, text stacking, button groups) remain unchanged. This preserves the existing visual hierarchy while standardizing only the centering behavior.

### Files to Keep Flex Import

Files that still need `Flex` from '@adobe/react-spectrum' after refactor:

1. **SelectionStepContent.tsx** - Used in list rendering
2. **ComponentConfigStep.tsx** - Used in section content (line 95)
3. **ApiMeshStep.tsx** - Used in nested content structure
4. **MeshStatusDisplay.tsx** - Used in nested content structure
5. **ProjectCreationStep.tsx** - Used extensively in footer and nested content

### File to Remove Flex Import

1. **AuthLoadingState.tsx** - Flex no longer needed (entire component is just the wrapper)

### Reference Files

- Step 2: `step-02.md` - CenteredFeedbackContainer creation
- Component: `src/core/ui/components/layout/CenteredFeedbackContainer.tsx`
- Tests: `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`
