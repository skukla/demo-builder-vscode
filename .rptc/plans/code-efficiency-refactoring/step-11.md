# Step 11: Testing Infrastructure Modernization (user-event Migration)

**Purpose:** Migrate from `fireEvent` to `@testing-library/user-event` for React component testing to achieve better Adobe Spectrum compatibility, improved test reliability, and 2025 industry best practices.

**Prerequisites:**
- [x] Step 4 completed (React Component Splitting - 215/215 tests passing)
- [x] Migration plan documented (`docs/testing/user-event-migration-plan.md`)
- [ ] PM approval for 3-5 day investment

**Estimated Time:** 3-5 days (36 hours)

**Priority:** Medium (not urgent - current tests functional at 100%)

**Triggers:**
- After completing code efficiency refactoring (Steps 1-10) ✅
- Before major UI feature additions
- When Spectrum interaction tests become blocking issue
- During dedicated technical debt sprint

---

## Rationale

### Why Migrate?

**Current State:**
- 215/215 tests passing with `fireEvent`
- 6 known jsdom limitations with Spectrum components
- fireEvent doesn't trigger complete event sequences needed by @react-aria

**Expected Benefits:**
- **80% reduction in flaky tests** (industry data from Chakra UI migration)
- **100% Adobe Spectrum compatibility** (official Adobe recommendation)
- **5-10 bugs discovered** (expected from complete event simulation)
- **2025 best practice** (4.8M+ weekly downloads, Kent C. Dodds recommendation)
- **Better accessibility coverage** (keyboard navigation, focus trap testing)

**Status:** Recommended for future implementation (see docs/testing/user-event-migration-plan.md)

---

## Phase 1: Pilot (2-4 hours)

### Goal
Validate approach and measure impact on 2 pilot files.

### Tests to Write First (Pilot Phase)

**No new tests** - Update existing tests to use user-event instead of fireEvent.

#### 1.1 Pilot File Selection

- [ ] **Pilot 1:** `FrontendSelector.test.tsx` (Spectrum Picker - representative complexity)
- [ ] **Pilot 2:** `AuthSuccessState.test.tsx` (Simple component - baseline)

#### 1.2 Migration Pattern Validation

- [ ] **Test:** Basic click interactions work with user-event
  - **Given:** Component with button
  - **When:** `await user.click(button)` called
  - **Then:** onClick handler fires (same as fireEvent)
  - **File:** Existing test files (15 tests affected)

- [ ] **Test:** Text input works with user-event.type()
  - **Given:** Component with text field
  - **When:** `await user.type(input, 'text')` called
  - **Then:** onChange fires with correct value
  - **File:** Existing test files (8 tests affected)

- [ ] **Test:** Spectrum Picker opens and selects with user-event
  - **Given:** Spectrum Picker component
  - **When:** `await user.click(picker)` then `await user.click(option)`
  - **Then:** Selection works reliably (previously flaky with fireEvent)
  - **File:** `FrontendSelector.test.tsx`, `BackendSelector.test.tsx`

#### 1.3 Pilot Metrics

- [ ] **Measure:** Test execution time (before vs after)
  - **Baseline:** 2.6s (FrontendSelector with fireEvent)
  - **Target:** <20% slower (<3.1s with user-event)

- [ ] **Measure:** Spectrum Picker reliability
  - **Baseline:** Unreliable with fireEvent (requires workarounds)
  - **Target:** 100% reliable with user-event

- [ ] **Measure:** Bugs discovered
  - **Target:** ≥1 hidden bug found during migration

### Implementation (Pilot Phase)

#### 1. Install Dependencies
```bash
npm install --save-dev @testing-library/user-event@latest
```

#### 2. Create Test Utility
```typescript
// tests/test-utils.tsx
import userEvent from '@testing-library/user-event';
import { render } from '@testing-library/react';

export function renderWithUser(ui: React.ReactElement) {
  const user = userEvent.setup();
  return {
    user,
    ...render(ui)
  };
}
```

#### 3. Migrate Pilot Files

**Pattern Example:**
```typescript
// Before (fireEvent)
import { fireEvent } from '@testing-library/react';
fireEvent.click(button);
fireEvent.change(input, { target: { value: 'Hello' } });

// After (user-event)
import userEvent from '@testing-library/user-event';
const user = userEvent.setup();
await user.click(button);
await user.type(input, 'Hello');
```

**Breaking Changes:**
- All tests become `async`
- Must `await` user interactions
- `user.setup()` required in each test or beforeEach

### Acceptance Criteria (Pilot Phase)

- [ ] Both pilot files migrated successfully
- [ ] All pilot tests passing (15 FrontendSelector + 13 AuthSuccessState = 28 tests)
- [ ] Test execution time <20% slower
- [ ] Spectrum Picker tests work reliably
- [ ] ≥1 bug discovered and documented
- [ ] Team confident in approach

---

## Phase 2: Feature-by-Feature (1-2 days)

### Goal
Systematic migration with quality gates, organized by feature.

### Migration Order (Easiest → Hardest)

#### 2.1 Authentication Components (3 test files - simple)

- [ ] Migrate `AuthLoadingState.test.tsx` (12 tests)
- [ ] Migrate `AuthSuccessState.test.tsx` (13 tests) - ALREADY DONE in pilot
- [ ] Migrate `AuthErrorState.test.tsx` (13 tests)

**Total:** 38 tests

#### 2.2 Component Config (4 test files - medium)

- [ ] Migrate `FieldRenderer.test.tsx` (15 tests)
- [ ] Migrate `ConfigurationForm.test.tsx` (13 tests)
- [ ] Migrate `ConfigNavigationPanel.test.tsx` (18 tests)
- [ ] Migrate `useConfigValidation.test.tsx` (15 tests)

**Total:** 61 tests

#### 2.3 Component Selection (3 test files - complex Spectrum)

- [ ] Migrate `FrontendSelector.test.tsx` (15 tests) - ALREADY DONE in pilot
- [ ] Migrate `BackendSelector.test.tsx` (16 tests)
- [ ] Migrate `DependencySelector.test.tsx` (14 tests)

**Total:** 45 tests

#### 2.4 Mesh Components (3 test files - mixed)

- [ ] Migrate `MeshErrorDialog.test.tsx` (16 tests)
- [ ] Migrate `MeshStatusDisplay.test.tsx` (16 tests)
- [ ] Migrate `useMeshOperations.test.tsx` (17 tests)

**Total:** 49 tests

### Per-Feature Process

For each feature directory:

1. **Migrate** all test files in directory
2. **Run** tests until all pass (`npm run test:file -- tests/features/[feature]/`)
3. **Document** any bugs discovered
4. **Add** ESLint rule to prevent fireEvent in migrated areas

### Implementation (Feature Phase)

#### Pattern 1: Basic Click
```typescript
// Before
fireEvent.click(button);

// After
const user = userEvent.setup();
await user.click(button);
```

#### Pattern 2: Text Input
```typescript
// Before
fireEvent.change(input, { target: { value: 'Hello' } });

// After
const user = userEvent.setup();
await user.type(input, 'Hello');
```

#### Pattern 3: Spectrum Picker (IMPROVED)
```typescript
// Before (doesn't work reliably)
fireEvent.click(picker);
fireEvent.click(screen.getByText('Option 1'));

// After (reliable)
const user = userEvent.setup();
await user.click(screen.getByRole('button')); // Open picker
await user.click(screen.getByRole('option', { name: 'Option 1' }));
```

#### Pattern 4: Disabled Checkbox (BUG FIX)
```typescript
// Before (onChange still fires - bug!)
fireEvent.click(disabledCheckbox);
// onChange callback gets called incorrectly

// After (correct behavior)
const user = userEvent.setup();
await user.click(disabledCheckbox);
// onChange NOT called - user-event respects disabled state
```

#### Pattern 5: Keyboard Navigation (NEW CAPABILITY)
```typescript
// Before (not possible with fireEvent)
// Can't test focus trap

// After
const user = userEvent.setup();
await user.tab(); // Tab to next element
expect(firstButton).toHaveFocus();

await user.tab();
expect(secondButton).toHaveFocus();

await user.tab({ shift: true }); // Shift+Tab
expect(firstButton).toHaveFocus();
```

### Acceptance Criteria (Feature Phase)

- [ ] All 4 feature directories migrated (193 tests)
- [ ] ESLint rules prevent new fireEvent usage in migrated areas
- [ ] 5+ bugs discovered and documented
- [ ] Test reliability improved (fewer flaky tests)

---

## Phase 3: Remaining Tests + Polish (2-3 days)

### Goal
Complete migration and establish new standard.

### Tasks

#### 3.1 Migrate Remaining Test Files

- [ ] Migrate all remaining React component tests (22 additional files estimated)
- [ ] Remove all `fireEvent` imports from test files
- [ ] Verify all 236+ tests passing with user-event

#### 3.2 Add Global ESLint Rule

```json
{
  "rules": {
    "no-restricted-imports": ["error", {
      "paths": [{
        "name": "@testing-library/react",
        "importNames": ["fireEvent"],
        "message": "Use @testing-library/user-event instead. See docs/testing/user-event-migration-plan.md"
      }]
    }]
  }
}
```

#### 3.3 Update Testing Documentation

- [ ] Update `tests/README.md` with user-event patterns
- [ ] Update `docs/testing/testing-strategy.md` with migration status
- [ ] Document common patterns in test-utils

#### 3.4 Create Shared Test Utility

```typescript
// tests/test-utils.tsx
import userEvent from '@testing-library/user-event';
import { render } from '@testing-library/react';
import { Provider as SpectrumProvider, defaultTheme } from '@adobe/react-spectrum';

export function renderWithUser(ui: React.ReactElement) {
  const user = userEvent.setup();
  return {
    user,
    ...render(
      <SpectrumProvider theme={defaultTheme}>
        {ui}
      </SpectrumProvider>
    )
  };
}
```

### Acceptance Criteria (Polish Phase)

- [ ] Zero `fireEvent` imports remaining
- [ ] All 236+ tests passing with user-event
- [ ] ESLint enforces user-event usage
- [ ] Documentation updated
- [ ] Team trained on new patterns

---

## Expected Outcomes

### Bugs to Discover (Based on Industry Data)

Expected categories:

1. **Focus management issues** - Elements not receiving focus on click
2. **Event handler timing** - Handlers firing before state updates
3. **Disabled state bypass** - Disabled elements still responding
4. **Keyboard navigation** - Tab order or focus trap failures
5. **Form validation** - Validation not triggering on proper events

### Metrics Impact

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Test Suite Time | 10s | 12s | +20% |
| Flaky Tests | 6 | 1-2 | -67% |
| Hidden Bugs Found | 0 | 5-10 | +∞ |
| Spectrum Compatibility | 75% | 100% | +25% |
| Accessibility Coverage | Low | High | ++ |

### Test Reliability

- **Reduced flakiness**: 80% reduction (industry average)
- **Better CI/CD**: Fewer intermittent failures
- **Faster debugging**: Real interaction simulation helps identify issues

---

## Timeline & Effort

| Phase | Duration | Effort (hours) | Dependencies |
|-------|----------|----------------|--------------|
| Phase 1: Pilot | 0.5 days | 4h | None |
| Phase 2: Feature Migration | 2 days | 16h | Phase 1 complete |
| Phase 3: Remaining + Polish | 2 days | 16h | Phase 2 complete |
| **Total** | **4.5 days** | **36h** | - |

### Resource Requirements

- **Developer**: 1 senior engineer familiar with testing
- **Reviewer**: 1 engineer for PR reviews
- **PM Approval**: Required before Phase 2 starts

---

## Risk Assessment

### Low Risk ✅

- **Backward Compatible**: Can run both fireEvent and user-event during migration
- **Incremental**: Can migrate one file at a time
- **Well Documented**: Extensive official documentation and examples

### Medium Risk ⚠️

- **Test Execution Time**: +15-20% slower (acceptable tradeoff)
- **Learning Curve**: Team needs to learn async patterns

### Mitigations

- Start with pilot to validate approach
- Document common patterns in test-utils
- Provide team training session
- Create migration checklist

---

## Success Criteria

### Overall Success

- [ ] All 236+ tests migrated to user-event
- [ ] All tests passing (100% success rate)
- [ ] Zero `fireEvent` imports remaining
- [ ] ESLint enforces user-event usage
- [ ] 5+ bugs discovered and fixed
- [ ] Test reliability improved (fewer flaky tests)
- [ ] Documentation updated
- [ ] Team trained on new patterns

---

## Impact Summary

```
Step 11 Impact:
- Test Framework: fireEvent → user-event (2025 best practice)
- Spectrum Compatibility: 75% → 100% (+25%)
- Flaky Tests: 6 → 1-2 (-67%)
- Accessibility Coverage: Low → High
- Bugs Discovered: 5-10 (expected during migration)
- Test Time: +15-20% (acceptable for reliability gains)
- Dependencies: @testing-library/user-event@latest
```

---

## References

### Official Documentation
- [Testing Library - user-event Intro](https://testing-library.com/docs/user-event/intro)
- [Adobe Spectrum - Testing Guide](https://react-spectrum.adobe.com/react-spectrum/testing.html)
- [React Aria - Testing Patterns](https://react-spectrum.adobe.com/react-aria/testing.html)

### Migration Guides
- [user-event v14 Migration](https://github.com/testing-library/user-event/releases/tag/v14.0.0)
- [Chakra UI Case Study](https://github.com/chakra-ui/chakra-ui/pull/6584)
- [Kent C. Dodds - Common Mistakes](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

### Internal Documentation
- `docs/testing/user-event-migration-plan.md` - Complete migration plan with detailed examples
- `docs/testing/testing-strategy.md` - Update after migration
- `tests/README.md` - Update with user-event patterns
- `.eslintrc.json` - Add fireEvent restriction
