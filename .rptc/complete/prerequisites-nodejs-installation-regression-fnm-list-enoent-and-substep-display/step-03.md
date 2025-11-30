# Step 3: Update PrerequisitesStep UI to Render Substeps

## Purpose

Update the PrerequisitesStep UI component to display milestone substep information during Node.js installation, providing users with clear visibility into which specific Node version is being installed (e.g., "Installing Node.js 20... Step 1 of 2").

**Why This Matters:**
- Fulfills user requirement: "Each node version which is installed should have a set of substeps that are communicated to the UI"
- Completes the end-to-end milestone display feature (backend → types → UI)
- Improves user experience during multi-version Node.js installations
- Leverages milestone data already being sent by ProgressUnifier (from Step 2)

---

## Prerequisites

- [x] **Step 2 Complete:** UnifiedProgress type definition updated with milestone fields (`currentMilestoneIndex`, `totalMilestones`)
- [x] **Backend Ready:** ProgressUnifier already sends milestone data (existing functionality)
- [ ] **Development Environment:** VS Code extension host running for manual testing
- [ ] **Test Environment:** Jest and @testing-library/react configured

---

## Tests to Write First (TDD RED Phase)

**Test File:** `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

### Test 1: Display Milestone Indicator with Valid Data

- [ ] **Test:** should display milestone indicator when milestone data present
  - **Given:** PrerequisitesStep rendered with progress containing `currentMilestoneIndex: 0` and `totalMilestones: 2`
  - **When:** Component renders with milestone data in progress.command object
  - **Then:** Milestone indicator displays "Step 1 of 2" in the document
  - **File:** `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

```typescript
it('should display milestone indicator when milestone data present', () => {
  // Arrange
  const mockProgress = {
    command: {
      detail: 'Installing Node.js 20...',
      currentMilestoneIndex: 0,
      totalMilestones: 2
    }
  };

  render(<PrerequisitesStep progress={mockProgress} {...defaultProps} />);

  // Act
  const milestoneText = screen.getByText(/Step 1 of 2/i);

  // Assert
  expect(milestoneText).toBeInTheDocument();
});
```

### Test 2: Backwards Compatibility Without Milestone Data

- [ ] **Test:** should NOT display milestone indicator when milestone data absent
  - **Given:** PrerequisitesStep rendered with progress WITHOUT milestone fields
  - **When:** Component renders with standard progress object (no milestone fields)
  - **Then:** Milestone indicator is NOT in the document (backwards compatible behavior)
  - **File:** `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

```typescript
it('should NOT display milestone indicator when milestone data absent', () => {
  // Arrange
  const mockProgress = {
    command: {
      detail: 'Installing prerequisite...'
      // No currentMilestoneIndex or totalMilestones
    }
  };

  render(<PrerequisitesStep progress={mockProgress} {...defaultProps} />);

  // Act
  const milestoneQuery = screen.queryByText(/Step \d+ of \d+/i);

  // Assert
  expect(milestoneQuery).not.toBeInTheDocument();
});
```

### Test 3: Dynamic Milestone Updates

- [ ] **Test:** should update milestone indicator as progress changes
  - **Given:** PrerequisitesStep initially rendered with `currentMilestoneIndex: 0`, `totalMilestones: 2`
  - **When:** Props updated to `currentMilestoneIndex: 1` (second Node version installing)
  - **Then:** Display changes from "Step 1 of 2" to "Step 2 of 2"
  - **File:** `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

```typescript
it('should update milestone indicator as progress changes', async () => {
  // Arrange
  const { rerender } = render(
    <PrerequisitesStep
      progress={{
        command: {
          detail: 'Installing Node.js 20...',
          currentMilestoneIndex: 0,
          totalMilestones: 2
        }
      }}
      {...defaultProps}
    />
  );

  expect(screen.getByText(/Step 1 of 2/i)).toBeInTheDocument();

  // Act
  rerender(
    <PrerequisitesStep
      progress={{
        command: {
          detail: 'Installing Node.js 24...',
          currentMilestoneIndex: 1,
          totalMilestones: 2
        }
      }}
      {...defaultProps}
    />
  );

  // Assert
  await waitFor(() => {
    expect(screen.getByText(/Step 2 of 2/i)).toBeInTheDocument();
  });
  expect(screen.queryByText(/Step 1 of 2/i)).not.toBeInTheDocument();
});
```

### Test 4: Edge Case - Single Milestone

- [ ] **Test:** should handle edge case totalMilestones = 1
  - **Given:** PrerequisitesStep rendered with `currentMilestoneIndex: 0`, `totalMilestones: 1`
  - **When:** Only one Node version being installed
  - **Then:** Displays "Step 1 of 1"
  - **File:** `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

```typescript
it('should handle edge case: totalMilestones = 1', () => {
  // Arrange
  const mockProgress = {
    command: {
      detail: 'Installing Node.js 20...',
      currentMilestoneIndex: 0,
      totalMilestones: 1
    }
  };

  render(<PrerequisitesStep progress={mockProgress} {...defaultProps} />);

  // Act & Assert
  expect(screen.getByText(/Step 1 of 1/i)).toBeInTheDocument();
});
```

### Test 5: Partial Milestone Data

- [ ] **Test:** should handle partial milestone data gracefully
  - **Given:** PrerequisitesStep rendered with only `currentMilestoneIndex` (no `totalMilestones`)
  - **When:** Milestone data incomplete (missing totalMilestones field)
  - **Then:** Milestone indicator NOT displayed (both fields required)
  - **File:** `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

```typescript
it('should handle partial milestone data gracefully', () => {
  // Arrange - only currentMilestoneIndex
  const mockProgress1 = {
    command: {
      detail: 'Installing...',
      currentMilestoneIndex: 0
      // Missing totalMilestones
    }
  };

  const { rerender } = render(<PrerequisitesStep progress={mockProgress1} {...defaultProps} />);
  expect(screen.queryByText(/Step \d+ of \d+/i)).not.toBeInTheDocument();

  // Arrange - only totalMilestones
  const mockProgress2 = {
    command: {
      detail: 'Installing...',
      totalMilestones: 2
      // Missing currentMilestoneIndex
    }
  };

  rerender(<PrerequisitesStep progress={mockProgress2} {...defaultProps} />);

  // Assert - both cases should not display indicator
  expect(screen.queryByText(/Step \d+ of \d+/i)).not.toBeInTheDocument();
});
```

### Test 6: Human-Readable 1-Based Indexing

- [ ] **Test:** should display human-readable format (1-indexed not 0-indexed)
  - **Given:** PrerequisitesStep rendered with `currentMilestoneIndex: 0` (backend 0-based)
  - **When:** Backend sends zero-based index (programmer convention)
  - **Then:** UI displays "Step 1" (user-friendly 1-based indexing)
  - **File:** `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

```typescript
it('should display human-readable format (1-indexed not 0-indexed)', () => {
  // Arrange - backend sends 0-based index
  const mockProgress = {
    command: {
      detail: 'Installing Node.js 20...',
      currentMilestoneIndex: 0, // Zero-based
      totalMilestones: 3
    }
  };

  render(<PrerequisitesStep progress={mockProgress} {...defaultProps} />);

  // Assert - UI shows 1-based
  expect(screen.getByText(/Step 1 of 3/i)).toBeInTheDocument();
  expect(screen.queryByText(/Step 0 of 3/i)).not.toBeInTheDocument();
});
```

### Test 7: Integration - Multi-Version Node Installation Flow

- [ ] **Test:** should integrate with multi-version Node installation flow
  - **Given:** Simulated full Node 20 + Node 24 installation with milestone updates
  - **When:** Progress updates through complete installation sequence (Step 1 → Step 2)
  - **Then:** Milestone indicator correctly shows "Step 1 of 2" for Node 20, then "Step 2 of 2" for Node 24
  - **File:** `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

```typescript
it('should integrate with multi-version Node installation flow', async () => {
  // Arrange - Start with Node 20 installation
  const { rerender } = render(
    <PrerequisitesStep
      progress={{
        command: {
          detail: 'Installing Node.js 20...',
          currentMilestoneIndex: 0,
          totalMilestones: 2
        }
      }}
      {...defaultProps}
    />
  );

  // Assert - First Node version
  expect(screen.getByText(/Installing Node\.js 20/i)).toBeInTheDocument();
  expect(screen.getByText(/Step 1 of 2/i)).toBeInTheDocument();

  // Act - Transition to Node 24 installation
  rerender(
    <PrerequisitesStep
      progress={{
        command: {
          detail: 'Installing Node.js 24...',
          currentMilestoneIndex: 1,
          totalMilestones: 2
        }
      }}
      {...defaultProps}
    />
  );

  // Assert - Second Node version
  await waitFor(() => {
    expect(screen.getByText(/Installing Node\.js 24/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 2 of 2/i)).toBeInTheDocument();
  });
});
```

---

## Files to Create/Modify

### Files to Modify

- [ ] **`src/features/prerequisites/ui/steps/PrerequisitesStep.tsx`** (lines ~423-455)
  - Add milestone indicator rendering logic to progress detail section
  - Implement conditional rendering based on milestone data presence
  - Use 1-based indexing for display (currentMilestoneIndex + 1)
  - Maintain backwards compatibility with existing progress display

---

## Implementation Details

### Current State Analysis

**File:** `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx`

**Current Progress Rendering** (approximate lines 423-455):
```typescript
{progress?.command && (
    <div className="progress-detail">
        {progress.command.detail}
    </div>
)}
```

**Problem:** Only displays the detail text (e.g., "Installing Node.js 20..."), no milestone information visible to user.

---

### Implementation Plan

#### 1. RED Phase (Write Failing Tests First)

**Action:** Create all 7 test cases in `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

**Test Structure:**
```typescript
describe('PrerequisitesStep - Milestone Display', () => {
  const defaultProps = {
    // Minimal props to render component
    prerequisites: [],
    onContinue: jest.fn(),
    onBack: jest.fn()
  };

  describe('Milestone Indicator Rendering', () => {
    it('should display milestone indicator when milestone data present', () => {
      // Test 1 implementation
    });

    it('should NOT display milestone indicator when milestone data absent', () => {
      // Test 2 implementation
    });

    it('should update milestone indicator as progress changes', async () => {
      // Test 3 implementation
    });

    it('should handle edge case: totalMilestones = 1', () => {
      // Test 4 implementation
    });

    it('should handle partial milestone data gracefully', () => {
      // Test 5 implementation
    });

    it('should display human-readable format (1-indexed not 0-indexed)', () => {
      // Test 6 implementation
    });

    it('should integrate with multi-version Node installation flow', async () => {
      // Test 7 implementation
    });
  });
});
```

**Run Tests:** `npm test -- PrerequisitesStep.test.tsx`

**Expected Result:** All 7 tests FAIL (milestone indicator not rendered yet)

---

#### 2. GREEN Phase (Minimal Implementation)

**Action:** Modify `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx` to pass all tests

**Updated Progress Rendering** (lines ~423-455):

```typescript
{progress?.command && (
    <div className="progress-detail">
        {/* Existing detail text */}
        {progress.command.detail}

        {/* NEW: Milestone substep indicator */}
        {progress.command.currentMilestoneIndex !== undefined &&
         progress.command.totalMilestones !== undefined && (
            <span className="milestone-indicator">
                {' '}(Step {progress.command.currentMilestoneIndex + 1} of {progress.command.totalMilestones})
            </span>
        )}
    </div>
)}
```

**Key Implementation Details:**

1. **Conditional Rendering:**
   - Check BOTH `currentMilestoneIndex` and `totalMilestones` are defined
   - Uses `!== undefined` (not truthy check) to allow index 0
   - Only renders when both fields present (backwards compatible)

2. **1-Based Indexing:**
   - Backend sends 0-based index (`currentMilestoneIndex: 0` for first milestone)
   - UI displays 1-based (`currentMilestoneIndex + 1` → "Step 1")
   - User-friendly display matches human expectations

3. **Inline Display:**
   - Uses `<span>` (not `<div>`) to keep on same line as detail text
   - Leading space ensures "Installing Node.js 20... (Step 1 of 2)" formatting
   - Parentheses group milestone info visually

4. **CSS Class:**
   - `milestone-indicator` class for future styling (optional)
   - Currently inherits parent styles (Adobe Spectrum)

**Run Tests:** `npm test -- PrerequisitesStep.test.tsx`

**Expected Result:** All 7 tests PASS ✅

---

#### 3. REFACTOR Phase (Improve Quality)

**Action:** Enhance implementation while keeping tests green

**Optional Improvements:**

1. **Extract Milestone Formatter (if needed elsewhere):**
```typescript
// utils/formatMilestone.ts (only if reused elsewhere)
export function formatMilestone(currentIndex: number, total: number): string {
  return `Step ${currentIndex + 1} of ${total}`;
}

// In PrerequisitesStep.tsx
import { formatMilestone } from '@/utils/formatMilestone';

<span className="milestone-indicator">
  {' '}({formatMilestone(progress.command.currentMilestoneIndex, progress.command.totalMilestones)})
</span>
```

**Decision:** Skip extraction for now (YAGNI principle - only used in one place)

2. **Add Styling (if visual enhancement needed):**
```css
/* In PrerequisitesStep.css or inline styles */
.milestone-indicator {
  color: var(--spectrum-global-color-gray-700);
  font-style: italic;
}
```

**Decision:** Use default Spectrum styles initially, add custom styling only if UX testing shows need

3. **Accessibility Enhancement:**
```typescript
<span
  className="milestone-indicator"
  aria-label={`Installation progress: step ${progress.command.currentMilestoneIndex + 1} of ${progress.command.totalMilestones}`}
>
  {' '}(Step {progress.command.currentMilestoneIndex + 1} of {progress.command.totalMilestones})
</span>
```

**Decision:** Add aria-label for screen reader support (minimal effort, high value)

**Final Refactored Implementation:**

```typescript
{progress?.command && (
    <div className="progress-detail">
        {progress.command.detail}
        {progress.command.currentMilestoneIndex !== undefined &&
         progress.command.totalMilestones !== undefined && (
            <span
              className="milestone-indicator"
              aria-label={`Installation progress: step ${progress.command.currentMilestoneIndex + 1} of ${progress.command.totalMilestones}`}
            >
                {' '}(Step {progress.command.currentMilestoneIndex + 1} of {progress.command.totalMilestones})
            </span>
        )}
    </div>
)}
```

**Run Tests Again:** `npm test -- PrerequisitesStep.test.tsx`

**Expected Result:** All 7 tests still PASS ✅ (refactoring doesn't break tests)

---

## Expected Outcome

After completing this step:

### Functionality
- ✅ **Milestone Display Active:** Users see "Step X of Y" during multi-version Node.js installations
- ✅ **Backwards Compatible:** Prerequisites without milestone data display normally (no errors)
- ✅ **Dynamic Updates:** Milestone indicator updates in real-time as installation progresses
- ✅ **Human-Readable:** 1-based indexing matches user expectations ("Step 1", not "Step 0")

### User Experience Example

**Before (without milestone display):**
```
✓ Docker Desktop
✓ Git
⏳ Node.js (20, 24)
   Installing Node.js 20...
```

**After (with milestone display):**
```
✓ Docker Desktop
✓ Git
⏳ Node.js (20, 24)
   Installing Node.js 20... (Step 1 of 2)
```
*[Progress updates to "Installing Node.js 24... (Step 2 of 2)" automatically]*

### Testing Status
- ✅ **7 unit tests passing:** All milestone display scenarios covered
- ✅ **Test coverage ≥85%:** For modified PrerequisitesStep component
- ✅ **Integration verified:** Manual testing confirms milestone display during real Node.js installation

### Technical Achievement
- ✅ **Type-safe:** Leverages UnifiedProgress types from Step 2
- ✅ **Non-breaking:** Existing prerequisites continue to work unchanged
- ✅ **Performant:** No additional API calls or state management needed
- ✅ **Accessible:** Screen reader support via aria-label

---

## Acceptance Criteria

### Functional Requirements
- [ ] **Milestone indicator displays when data present:** Component renders "Step X of Y" when progress.command includes milestone fields
- [ ] **Backwards compatibility maintained:** Component works without milestone data (indicator not shown)
- [ ] **1-based indexing used:** Display shows "Step 1" for currentMilestoneIndex=0 (human-readable)
- [ ] **Format matches specification:** Exact format "(Step X of Y)" as shown in requirements
- [ ] **Dynamic updates work:** Milestone indicator updates correctly as currentMilestoneIndex changes

### Testing Requirements
- [ ] **All 7 tests passing:** Unit tests cover happy path, edge cases, and error conditions
- [ ] **Test coverage ≥85%:** For modified PrerequisitesStep component code
- [ ] **Tests written BEFORE implementation:** TDD RED phase completed first
- [ ] **Integration test passes:** Test 7 verifies multi-version Node installation flow

### Code Quality Requirements
- [ ] **Follows project style guide:** Adobe Spectrum design patterns, consistent with existing code
- [ ] **No console.log statements:** Clean production code (use proper logging if needed)
- [ ] **No debugger statements:** All debug code removed
- [ ] **Type-safe implementation:** Uses UnifiedProgress types from Step 2, no TypeScript errors
- [ ] **Accessible:** aria-label added for screen reader support

### Manual Testing Requirements
- [ ] **Node 20 installation shows "Step 1 of 2":** Visible during actual prerequisite check
- [ ] **Node 24 installation shows "Step 2 of 2":** Updates correctly for second version
- [ ] **Single Node version shows "Step 1 of 1":** Edge case handled correctly
- [ ] **Non-Node prerequisites unchanged:** Docker, Git, etc. display normally without milestone indicator
- [ ] **Visual consistency:** Milestone indicator integrates smoothly with existing progress UI

### Documentation Requirements
- [ ] **Code comments added:** Explain milestone rendering logic (if non-obvious)
- [ ] **Test descriptions clear:** Each test name describes what it validates
- [ ] **No breaking changes:** Existing documentation remains accurate

---

## Edge Cases and Error Handling

### Edge Case 1: No Milestone Data (Backwards Compatibility)
**Scenario:** Prerequisite progress without milestone fields (most prerequisites)

**Handling:**
```typescript
// Conditional rendering checks both fields
{progress.command.currentMilestoneIndex !== undefined &&
 progress.command.totalMilestones !== undefined && (
   // Only renders when BOTH present
)}
```

**Result:** Milestone indicator NOT displayed, component works normally

---

### Edge Case 2: Milestone Index Out of Range
**Scenario:** Backend sends currentMilestoneIndex=3 but totalMilestones=2 (bug in backend)

**Handling:** Display as-is without validation
```typescript
// No validation logic - trust backend
<span>Step {currentMilestoneIndex + 1} of {totalMilestones}</span>
// Would display "Step 4 of 2" (clearly indicates bug)
```

**Rationale:** UI should reflect backend state honestly, validation belongs in backend (ProgressUnifier)

---

### Edge Case 3: Total Milestones = 0
**Scenario:** totalMilestones=0 (invalid configuration)

**Handling:** Indicator not shown (validation via undefined check sufficient)
```typescript
// undefined check prevents rendering invalid states
{progress.command.totalMilestones !== undefined && (
  // totalMilestones=0 is defined, but indicates no milestones
  // Backend should not send milestone data if total=0
)}
```

**Additional Safety:** Backend (ProgressUnifier) should not send milestone data if total=0

---

### Edge Case 4: Rapid Updates
**Scenario:** Progress updates every 100ms during installation (potential flickering)

**Handling:** React batching handles efficiently
```typescript
// React automatically batches state updates
// No custom debounce or throttle needed
// Virtual DOM diffing minimizes actual DOM updates
```

**Result:** Smooth updates without flickering (React optimization)

---

### Edge Case 5: Multiple Prerequisites with Milestones
**Scenario:** Two different prerequisites both using milestones (future: Node.js + Docker versions)

**Handling:** Each prerequisite shows its own milestones independently
```typescript
// Progress object specific to each prerequisite
// No shared state between prerequisites
// Each renders its own milestone indicator
```

**Result:** Correct milestone display for each prerequisite independently

---

### Edge Case 6: Partial Milestone Data
**Scenario:** Only currentMilestoneIndex present (no totalMilestones) OR vice versa

**Handling:** Indicator NOT displayed (both required)
```typescript
// AND condition requires BOTH fields
{progress.command.currentMilestoneIndex !== undefined &&
 progress.command.totalMilestones !== undefined && (
   // Only renders when BOTH present
)}
```

**Result:** Graceful degradation, no error thrown

---

### Edge Case 7: Zero-Based vs One-Based Confusion
**Scenario:** Developer expects "Step 0" for first milestone (programmer mindset)

**Handling:** Always display 1-based indexing for users
```typescript
// Backend: 0-based (currentMilestoneIndex: 0)
// UI: 1-based (display: "Step 1")
<span>Step {progress.command.currentMilestoneIndex + 1}</span>
```

**Documentation:** Comment explains the +1 conversion reason

---

## Implementation Constraints

### Technical Constraints
- **MUST be backwards compatible:** Works without milestone data (most prerequisites don't use milestones)
- **MUST use 1-based indexing for display:** User-friendly "Step 1" not programmer "Step 0"
- **MUST NOT break existing progress display:** Milestone indicator is additive enhancement
- **MUST handle undefined gracefully:** Optional fields from UnifiedProgress type (Step 2)

### Design Constraints
- **MUST follow Adobe Spectrum design system:** Consistent with existing PrerequisitesStep UI
- **MUST use existing CSS classes:** No new global styles unless necessary
- **MUST maintain visual hierarchy:** Milestone indicator secondary to main detail text

### Performance Constraints
- **MUST NOT add network requests:** Uses existing progress data stream
- **MUST NOT add state management:** Purely display logic, no new state
- **MUST render efficiently:** No performance degradation during rapid updates

### Accessibility Constraints
- **MUST support screen readers:** Add aria-label for milestone indicator
- **MUST maintain keyboard navigation:** No interference with existing tab order
- **MUST have sufficient color contrast:** Use Spectrum color tokens

---

## Dependencies

### Internal Dependencies (This Project)

1. **Step 2: Type Definitions (REQUIRED)**
   - **What:** UnifiedProgress type with milestone fields
   - **Why:** TypeScript compilation requires types defined first
   - **Location:** `src/shared/types/progress.ts` or similar
   - **Status:** MUST be complete before Step 3 implementation

2. **Step 1: Shell Environment Fix (INDEPENDENT)**
   - **What:** Fix fnm list ENOENT error via shell invocation
   - **Why:** Fixes backend detection logic, separate concern from UI
   - **Relationship:** Step 1 and Step 3 can be implemented in parallel
   - **Status:** Independent, can proceed without Step 1 complete

3. **ProgressUnifier (EXISTING - NO CHANGES)**
   - **What:** Backend system that sends progress updates
   - **Why:** Already sends milestone data (currentMilestoneIndex, totalMilestones)
   - **Location:** `src/shared/logging/ProgressUnifier.ts` (approximate)
   - **Status:** Already implemented, no changes needed in Step 3

### External Dependencies (Libraries)

1. **React (EXISTING)**
   - **Version:** Check package.json
   - **Usage:** Component rendering, prop updates
   - **Status:** Already installed

2. **@testing-library/react (EXISTING)**
   - **Version:** Check package.json
   - **Usage:** Component testing with render, screen, waitFor
   - **Status:** Already installed, verify version supports async tests

3. **@testing-library/jest-dom (EXISTING)**
   - **Version:** Check package.json
   - **Usage:** Custom matchers (toBeInTheDocument, etc.)
   - **Status:** Already installed

4. **Adobe Spectrum Components (EXISTING)**
   - **Version:** Check package.json for @adobe/react-spectrum
   - **Usage:** Existing UI framework, consistent styling
   - **Status:** Already integrated

### Data Flow Dependencies

```
Backend (ProgressUnifier)
  ↓ [sends UnifiedProgress via message]
PrerequisitesStep Props
  ↓ [receives progress prop]
Progress Rendering Logic (this step)
  ↓ [conditionally renders milestone]
User Sees: "Installing Node.js 20... (Step 1 of 2)"
```

**Critical Path:** Step 2 types → Step 3 UI rendering → User visibility

---

## Risk Assessment

### Risk 1: UI Flickering During Rapid Updates

- **Category:** Technical / Performance
- **Likelihood:** Low
- **Impact:** Low
- **Priority:** Low

**Description:** If progress updates occur very rapidly (e.g., every 100ms), the milestone indicator might flicker or cause performance issues.

**Mitigation:**
1. React automatically batches state updates (built-in optimization)
2. Virtual DOM diffing minimizes actual DOM manipulations
3. Component re-renders are efficient (minimal props, no complex calculations)
4. No custom debounce/throttle needed (React handles this)

**Monitoring:** Manual testing during Node.js installation (typical update frequency ~500ms)

**Contingency:** If flickering observed, add CSS transition for smooth updates:
```css
.milestone-indicator {
  transition: opacity 150ms ease-in-out;
}
```

---

### Risk 2: Milestone Indicator Not Visible in All UI States

- **Category:** Technical / UX
- **Likelihood:** Low
- **Impact:** Medium
- **Priority:** Medium

**Description:** The milestone indicator might be cut off, hidden, or not visible in certain UI states (scrolling, collapsed, different window sizes).

**Mitigation:**
1. Use existing `progress-detail` container (already visible during operations)
2. Inline `<span>` inherits parent visibility and layout
3. No fixed positioning or absolute layout (flows naturally)
4. Manual testing across different window sizes and scroll positions

**Monitoring:** Visual regression testing during manual QA

**Contingency:** If visibility issues found:
- Add explicit z-index or positioning styles
- Ensure parent container has appropriate overflow settings
- Add automated visual regression tests (future)

---

### Risk 3: Test Flakiness Due to Async Progress Updates

- **Category:** Technical / Testing
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** High

**Description:** Tests might fail intermittently if async state updates aren't properly awaited, especially Test 3 (dynamic updates) and Test 7 (integration).

**Mitigation:**
1. Use `waitFor` from @testing-library/react for all async assertions
2. Use `rerender` for controlled prop updates (not setState)
3. Set reasonable timeout values (default 1000ms usually sufficient)
4. Avoid hardcoded delays (e.g., `setTimeout`) in tests

**Example:**
```typescript
await waitFor(() => {
  expect(screen.getByText(/Step 2 of 2/i)).toBeInTheDocument();
}, { timeout: 2000 }); // Explicit timeout if needed
```

**Monitoring:** Run test suite 10 times to verify consistency

**Contingency:** If flakiness detected:
- Increase timeout values in `waitFor`
- Add more specific queries (avoid ambiguous selectors)
- Use `findBy` queries instead of `getBy` (built-in waiting)

---

### Risk 4: Type Mismatch Between Step 2 and Step 3

- **Category:** Technical / Integration
- **Likelihood:** Low
- **Impact:** High
- **Priority:** Critical

**Description:** If Step 2 type definitions don't match Step 3 usage, TypeScript compilation will fail or runtime errors occur.

**Mitigation:**
1. **Pre-implementation verification:** Read Step 2 type definitions before starting Step 3
2. **Use exact field names:** `currentMilestoneIndex` and `totalMilestones` (from Step 2)
3. **TypeScript strict mode:** Compilation errors catch mismatches early
4. **Integration test:** Test 7 uses realistic data matching backend structure

**Verification Checklist:**
- [ ] Step 2 types exported from correct location
- [ ] PrerequisitesStep imports UnifiedProgress type
- [ ] Field names match exactly (case-sensitive)
- [ ] Field types match (both number | undefined)

**Contingency:** If type mismatch found during implementation:
- Update Step 3 code to match Step 2 types (don't modify Step 2 retroactively)
- Add type guards if necessary for runtime safety

---

### Risk 5: Backwards Compatibility Broken

- **Category:** Technical / Regression
- **Likelihood:** Low
- **Impact:** High
- **Priority:** Critical

**Description:** UI changes might break existing prerequisites without milestone data (Docker, Git, etc.), causing errors or visual issues.

**Mitigation:**
1. **Conditional rendering:** Uses `!== undefined` checks (allows 0 value)
2. **AND condition:** Requires BOTH fields present (no partial rendering)
3. **Test 2:** Explicitly tests backwards compatibility scenario
4. **No default values:** Doesn't assume milestone data exists

**Verification:** Manual testing of non-Node prerequisites (Docker, Git, etc.)

**Contingency:** If regression found:
- Revert UI changes
- Add more defensive checks
- Add regression tests for affected prerequisites

---

## Integration Points

### 1. ProgressUnifier → PrerequisitesStep (Data Flow)

**Direction:** Backend → UI

**Data Sent:**
```typescript
// From ProgressUnifier (existing)
{
  command: {
    detail: "Installing Node.js 20...",
    currentMilestoneIndex: 0,        // NEW (from Step 2)
    totalMilestones: 2                // NEW (from Step 2)
  }
}
```

**Received By:** PrerequisitesStep component via `progress` prop

**Integration Point:** Component props mapping in parent container

**Testing:** Test 7 (integration test) validates this flow

---

### 2. UnifiedProgress Type → PrerequisitesStep (Type Safety)

**Direction:** Type Definitions → Component

**Type Contract:**
```typescript
// From Step 2
interface UnifiedProgress {
  command?: {
    detail: string;
    currentMilestoneIndex?: number;  // NEW
    totalMilestones?: number;        // NEW
  };
  // ... other fields
}
```

**Used By:** PrerequisitesStep.tsx for type checking

**Integration Point:** Import statement, prop type annotations

**Testing:** TypeScript compilation ensures type safety

---

### 3. PrerequisitesStep → User (Visual Display)

**Direction:** UI Component → User

**Visual Output:**
```
Before: "Installing Node.js 20..."
After:  "Installing Node.js 20... (Step 1 of 2)"
```

**Integration Point:** DOM rendering in progress-detail container

**Testing:** Manual visual inspection, screenshot comparisons (future)

---

### 4. Multi-Version Node Installation → Milestone Display (Use Case)

**Direction:** Feature → UI Component

**Flow:**
1. User selects Node.js 20 and 24 in prerequisites
2. Installation begins → ProgressUnifier sends milestone 0/2
3. PrerequisitesStep renders "Step 1 of 2"
4. Node 20 completes → ProgressUnifier sends milestone 1/2
5. PrerequisitesStep updates to "Step 2 of 2"
6. Node 24 completes → Milestone indicator removed (progress complete)

**Integration Point:** End-to-end user flow

**Testing:** Test 7 simulates this exact scenario

---

### 5. Accessibility Tools → Milestone Indicator (A11y)

**Direction:** Screen Readers → UI Component

**Accessible Output:**
```html
<span
  className="milestone-indicator"
  aria-label="Installation progress: step 1 of 2"
>
  (Step 1 of 2)
</span>
```

**Integration Point:** ARIA attributes for assistive technology

**Testing:** Manual testing with screen reader (VoiceOver on macOS, NVDA on Windows)

---

## File Changes Map

### Files Modified (1 file)

#### `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx`

**Lines Modified:** ~423-455 (progress rendering section)

**Change Type:** Enhancement (additive, non-breaking)

**Before:**
```typescript
{progress?.command && (
    <div className="progress-detail">
        {progress.command.detail}
    </div>
)}
```

**After:**
```typescript
{progress?.command && (
    <div className="progress-detail">
        {progress.command.detail}
        {progress.command.currentMilestoneIndex !== undefined &&
         progress.command.totalMilestones !== undefined && (
            <span
              className="milestone-indicator"
              aria-label={`Installation progress: step ${progress.command.currentMilestoneIndex + 1} of ${progress.command.totalMilestones}`}
            >
                {' '}(Step {progress.command.currentMilestoneIndex + 1} of {progress.command.totalMilestones})
            </span>
        )}
    </div>
)}
```

**Impact:**
- Lines Added: ~6
- Lines Modified: 0 (existing code unchanged)
- Breaking Changes: None
- Test Coverage: Existing + 7 new tests

---

### Files Created (1 test file or section)

#### `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

**Change Type:** New test suite or addition to existing file

**Test Suite Added:**
```typescript
describe('PrerequisitesStep - Milestone Display', () => {
  // 7 test cases (310 lines estimated)
});
```

**Impact:**
- New Tests: 7
- Test Coverage Increase: +5-10% (milestone rendering logic)
- Dependencies: @testing-library/react, @testing-library/jest-dom

---

### Files NOT Changed (No Modifications Needed)

**Backend Files:**
- `src/shared/logging/ProgressUnifier.ts` - Already sends milestone data
- `src/shared/command-execution/ExternalCommandManager.ts` - No changes needed

**Type Files:**
- `src/shared/types/progress.ts` (or equivalent) - Modified in Step 2, not Step 3

**Other UI Files:**
- No other components need changes (isolated to PrerequisitesStep)

---

## Rollback Plan

### Rollback Trigger Conditions

Rollback if ANY of the following occur:

1. **Critical Bug:** Milestone display causes UI crash or freeze
2. **Backwards Compatibility Break:** Non-milestone prerequisites fail or show errors
3. **Performance Regression:** UI becomes noticeably slower during prerequisite checks
4. **Accessibility Violation:** Screen reader support broken for existing functionality

### Rollback Steps

1. **Revert UI Changes:**
   ```bash
   git diff HEAD src/features/prerequisites/ui/steps/PrerequisitesStep.tsx
   git checkout HEAD -- src/features/prerequisites/ui/steps/PrerequisitesStep.tsx
   ```

2. **Remove New Tests (Optional):**
   ```bash
   # If test file created new
   git checkout HEAD -- tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx
   ```

3. **Rebuild Extension:**
   ```bash
   npm run build
   ```

4. **Verify Rollback:**
   - Run extension in development mode (F5)
   - Check prerequisites step works normally
   - Confirm no milestone indicator displayed

### Post-Rollback Actions

1. **Root Cause Analysis:** Investigate why rollback was necessary
2. **Fix Issues:** Address problems in isolated branch
3. **Re-test:** Run full test suite before re-attempting
4. **Gradual Rollout:** Consider feature flag for milestone display (future)

---

## Manual Testing Checklist

### Pre-Testing Setup

- [ ] **Build extension:** `npm run build`
- [ ] **Launch extension host:** Press F5 in VS Code
- [ ] **Open test workspace:** Folder WITHOUT existing Node.js installation (for fresh install test)
- [ ] **Clear previous state:** Delete any cached prerequisite data

### Test Case 1: Multi-Version Node Installation (Primary Use Case)

**Steps:**
1. Run "Demo Builder: Create New Project" command
2. Navigate to Prerequisites step
3. Ensure Node.js 20 and 24 selected (default)
4. Click "Check Prerequisites" button
5. Observe Node.js installation progress

**Expected Results:**
- [ ] During Node 20 installation: Display shows "Installing Node.js 20... (Step 1 of 2)"
- [ ] During Node 24 installation: Display shows "Installing Node.js 24... (Step 2 of 2)"
- [ ] Milestone indicator updates dynamically (no page refresh needed)
- [ ] Text format exactly matches "(Step X of Y)" with parentheses and leading space

**Pass Criteria:** Milestone indicator displays correctly for both Node versions

---

### Test Case 2: Single Node Version Installation (Edge Case)

**Steps:**
1. Start new project creation flow
2. On Prerequisites step, deselect one Node version (only one remaining)
3. Click "Check Prerequisites"
4. Observe Node.js installation progress

**Expected Results:**
- [ ] Display shows "Installing Node.js XX... (Step 1 of 1)"
- [ ] Format consistent with multi-version (parentheses, leading space)
- [ ] No errors or visual glitches

**Pass Criteria:** Single milestone displays correctly

---

### Test Case 3: Non-Node Prerequisites (Backwards Compatibility)

**Steps:**
1. Start new project creation flow
2. On Prerequisites step, observe Docker and Git checks
3. Click "Check Prerequisites"
4. Observe Docker/Git progress (if installation needed)

**Expected Results:**
- [ ] Docker/Git display normal progress messages (no milestone indicator)
- [ ] No "(Step X of Y)" text appears
- [ ] No console errors or visual issues
- [ ] Progress display identical to previous version

**Pass Criteria:** Non-Node prerequisites unchanged, no regression

---

### Test Case 4: Rapid Progress Updates (Performance)

**Steps:**
1. Start Node.js installation with multiple versions
2. Observe milestone indicator during installation
3. Watch for visual flickering or performance issues

**Expected Results:**
- [ ] Milestone indicator updates smoothly (no flickering)
- [ ] UI remains responsive during installation
- [ ] No lag or freeze
- [ ] Text transitions are smooth

**Pass Criteria:** No performance degradation, smooth updates

---

### Test Case 5: Window Resize and Scrolling (Layout)

**Steps:**
1. Start Node.js installation
2. Resize VS Code window (small, medium, large)
3. Scroll prerequisites list during installation
4. Observe milestone indicator visibility

**Expected Results:**
- [ ] Milestone indicator remains visible at all window sizes
- [ ] Text doesn't get cut off or overflow
- [ ] Layout remains consistent
- [ ] No horizontal scrollbars appear

**Pass Criteria:** Milestone indicator visible and properly laid out in all scenarios

---

### Test Case 6: Accessibility (Screen Reader)

**Steps:**
1. Enable VoiceOver (macOS) or NVDA (Windows)
2. Start Node.js installation
3. Navigate to progress detail area with screen reader
4. Listen to milestone indicator announcement

**Expected Results:**
- [ ] Screen reader announces: "Installation progress: step 1 of 2"
- [ ] Visual text and aria-label both present
- [ ] No duplicate announcements
- [ ] Keyboard navigation still works

**Pass Criteria:** Milestone indicator accessible to screen reader users

---

### Test Case 7: Error During Installation (Error Handling)

**Steps:**
1. Start Node.js installation
2. Simulate network error or installation failure (e.g., disconnect network)
3. Observe error handling and milestone indicator behavior

**Expected Results:**
- [ ] Milestone indicator disappears when error occurs
- [ ] Error message displays normally
- [ ] No stale milestone indicator remains visible
- [ ] User can retry installation

**Pass Criteria:** Milestone indicator properly clears on error

---

## Post-Implementation Verification

### Code Quality Checks

- [ ] **TypeScript compilation:** `npm run build` succeeds with no errors
- [ ] **Linting:** `npm run lint` passes (or equivalent)
- [ ] **Test suite:** `npm test` all tests pass (including new 7 tests)
- [ ] **Coverage:** `npm run test:coverage` shows ≥85% for PrerequisitesStep
- [ ] **No debug code:** Search for `console.log`, `debugger` - none found

### Documentation Updates

- [ ] **Code comments:** Milestone rendering logic documented (if non-obvious)
- [ ] **Test descriptions:** All test names clearly describe what they validate
- [ ] **CHANGELOG.md:** Entry added for milestone display feature (if project uses changelog)
- [ ] **README updates:** Prerequisites documentation updated (if necessary)

### Integration Verification

- [ ] **Step 2 types imported correctly:** No import errors, types match
- [ ] **ProgressUnifier sends data:** Verified via Debug output channel during installation
- [ ] **End-to-end flow works:** Full project creation with milestone display functional

---

## Estimated Effort

**Total Time:** 3-4 hours

**Breakdown:**

1. **Test Writing (TDD RED Phase):** 1.5 hours
   - 7 test cases with arrange/act/assert structure
   - Mock setup and test utilities
   - Test file organization

2. **Implementation (TDD GREEN Phase):** 0.5 hours
   - UI component modification (~6 lines of code)
   - TypeScript type checking
   - Build and verify

3. **Refactoring (TDD REFACTOR Phase):** 0.5 hours
   - Add accessibility (aria-label)
   - Code review and cleanup
   - Re-run tests

4. **Manual Testing:** 1 hour
   - 7 manual test cases
   - Window resize and accessibility testing
   - Error scenario verification

5. **Documentation:** 0.5 hours
   - Code comments
   - Update related docs (if needed)

**Assumptions:**
- Step 2 types already complete and correct
- Development environment already set up
- No unexpected issues or blockers

**Risk Buffer:** +1 hour for unexpected issues (type mismatches, test debugging)

---

## Next Steps After Completion

### Immediate Actions (This Step)

1. **Commit Changes:**
   ```bash
   git add src/features/prerequisites/ui/steps/PrerequisitesStep.tsx
   git add tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx
   git commit -m "feat(prerequisites): add milestone substep display for Node.js installation

   - Display 'Step X of Y' during multi-version Node.js installation
   - Add 7 unit tests covering happy path, edge cases, and backwards compatibility
   - Maintain backwards compatibility with non-milestone prerequisites
   - Use 1-based indexing for user-friendly display
   - Add accessibility support with aria-label

   Fixes: Prerequisites Node.js Installation Regression (Step 3/3)"
   ```

2. **Manual Testing:** Run through all 7 manual test cases from checklist above

3. **Mark Step Complete:** Update plan status (if tracking in plan document)

### Follow-Up Actions (Optional Enhancements)

1. **Visual Styling (Low Priority):**
   - Add subtle color or font style to milestone indicator
   - Ensure sufficient contrast for accessibility
   - Get UX feedback from users

2. **Animation (Optional):**
   - Add smooth fade-in when milestone indicator appears
   - Transition animation when changing from Step 1 to Step 2
   - Keep animations subtle (150-300ms)

3. **Logging (Debugging Aid):**
   - Add debug log when milestone data received
   - Log milestone transitions for troubleshooting
   - Use "Demo Builder: Debug" output channel

4. **Telemetry (Analytics):**
   - Track how often milestone display is shown
   - Measure user engagement with prerequisites step
   - Inform future UX improvements

### Integration with Other Steps

**Step 1 (Shell Environment Fix):**
- Once Step 1 complete, verify fnm detection works correctly
- Confirm Node.js installation triggers milestone display
- Test end-to-end with Step 1 fix applied

**Full Feature Verification:**
- All 3 steps complete → full regression test
- Verify fnm detection + type safety + UI display work together
- Close original bug report with verification notes

### Bug Fix Plan Completion

**When All 3 Steps Complete:**

1. **Regression Test:** Verify original reported issue resolved
2. **Documentation:** Update troubleshooting docs if needed
3. **Release Notes:** Add to next version release notes
4. **User Communication:** Notify users of fix (if public extension)

---

## Implementation Notes (To Be Filled During TDD)

*This section updated during implementation by developer*

### Completed Actions

- [ ] **RED Phase Complete:** All 7 tests written and failing
- [ ] **GREEN Phase Complete:** Minimal implementation, all tests passing
- [ ] **REFACTOR Phase Complete:** Accessibility added, tests still passing

### Actual Time Spent

- **Test Writing:** ___ hours (estimated: 1.5 hours)
- **Implementation:** ___ hours (estimated: 0.5 hours)
- **Refactoring:** ___ hours (estimated: 0.5 hours)
- **Manual Testing:** ___ hours (estimated: 1 hour)
- **Total:** ___ hours (estimated: 3-4 hours)

### Issues Encountered

*Document any unexpected issues, blockers, or deviations from plan*

1. **Issue:** [Description]
   - **Resolution:** [How it was resolved]
   - **Impact:** [Time impact, scope change, etc.]

### Deviations from Plan

*Document any changes made during implementation that differ from this plan*

1. **Deviation:** [Description]
   - **Reason:** [Why deviation was necessary]
   - **Impact:** [How it affects other steps or timeline]

### Manual Testing Results

- [ ] Test Case 1 (Multi-version Node): **PASS** / FAIL
- [ ] Test Case 2 (Single Node version): **PASS** / FAIL
- [ ] Test Case 3 (Non-Node prerequisites): **PASS** / FAIL
- [ ] Test Case 4 (Performance): **PASS** / FAIL
- [ ] Test Case 5 (Layout): **PASS** / FAIL
- [ ] Test Case 6 (Accessibility): **PASS** / FAIL
- [ ] Test Case 7 (Error handling): **PASS** / FAIL

### Test Coverage Results

**Coverage Report:**
- **Statements:** ___% (target: ≥85%)
- **Branches:** ___% (target: ≥85%)
- **Functions:** ___% (target: ≥85%)
- **Lines:** ___% (target: ≥85%)

---

## Related Documentation

**Internal References:**
- `.rptc/plans/prerequisites-nodejs-installation-regression-fnm-list-enoent-and-substep-display/overview.md` - Plan overview
- `.rptc/plans/prerequisites-nodejs-installation-regression-fnm-list-enoent-and-substep-display/step-01.md` - Shell environment fix
- `.rptc/plans/prerequisites-nodejs-installation-regression-fnm-list-enoent-and-substep-display/step-02.md` - Type definitions update
- `docs/systems/prerequisites-system.md` - Prerequisites system documentation
- `src/webviews/CLAUDE.md` - Webview component guidelines
- `tests/README.md` - Testing strategy and conventions

**External References:**
- [React Testing Library Docs](https://testing-library.com/docs/react-testing-library/intro/)
- [Adobe Spectrum Design Tokens](https://spectrum.adobe.com/page/design-tokens/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/) - Accessibility standards
- [ARIA Best Practices](https://www.w3.org/WAI/ARIA/apg/) - Screen reader support

---

## Step Status

**Current Status:** ⏳ **Ready for Implementation**

**Checklist:**
- [x] Step plan created
- [ ] Tests written (RED phase)
- [ ] Implementation complete (GREEN phase)
- [ ] Refactoring done (REFACTOR phase)
- [ ] Manual testing complete
- [ ] Code review passed
- [ ] Merged to main branch

**Last Updated:** 2025-01-10

---

_This step is part of the Prerequisites Node.js Installation Regression bug fix plan._
_See overview.md for complete feature context and acceptance criteria._
