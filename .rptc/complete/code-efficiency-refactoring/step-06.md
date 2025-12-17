# Step 6: useEffect Refactoring

**Purpose**: Split large, multi-concern useEffects into focused, single-responsibility effects for improved testability and clearer dependency tracking.

**Prerequisites**:
- [ ] Step 5 completed (function extraction)

---

## Tests to Write First

### PrerequisitesStep Effect Tests

- [ ] Test: Installation complete listener cleanup
  - **Given**: PrerequisitesStep mounted with installation listener
  - **When**: Component unmounts
  - **Then**: Listener is removed, no memory leak
  - **File**: `tests/webviews/steps/PrerequisitesStep-effects.test.tsx`

- [ ] Test: Status listener re-registers on checks change
  - **Given**: PrerequisitesStep with initial checks
  - **When**: checks array updates
  - **Then**: Old listener cleaned up, new listener registered
  - **File**: `tests/webviews/steps/PrerequisitesStep-effects.test.tsx`

### ComponentConfigStep Effect Tests

- [ ] Test: Focus listener independent of scroll sync
  - **Given**: ComponentConfigStep mounted
  - **When**: Focus changes
  - **Then**: Only focus handler fires, not scroll sync
  - **File**: `tests/webviews/steps/ComponentConfigStep-effects.test.tsx`

- [ ] Test: Navigation highlighting updates on scroll
  - **Given**: ComponentConfigStep with sections
  - **When**: User scrolls to new section
  - **Then**: Navigation highlight updates independently
  - **File**: `tests/webviews/steps/ComponentConfigStep-effects.test.tsx`

### AdobeAuthStep Effect Tests

- [ ] Test: Auth check runs once on mount
  - **Given**: AdobeAuthStep component
  - **When**: Component mounts
  - **Then**: Auth check executes exactly once
  - **File**: `tests/webviews/steps/AdobeAuthStep-effects.test.tsx`

- [ ] Test: Message listener cleanup on unmount
  - **Given**: AdobeAuthStep with message listener
  - **When**: Component unmounts
  - **Then**: Listener removed from window
  - **File**: `tests/webviews/steps/AdobeAuthStep-effects.test.tsx`

### ConfigureScreen Effect Tests

- [ ] Test: Focus events independent from scroll sync
  - **Given**: ConfigureScreen mounted
  - **When**: Focus event fires
  - **Then**: Only focus handler executes
  - **File**: `tests/webviews/steps/ConfigureScreen-effects.test.tsx`

---

## Files to Modify

- [ ] `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx` - Split 119-line effect into 4 focused effects
- [ ] `src/features/components/ui/steps/ComponentConfigStep.tsx` - Separate focus from scroll sync
- [ ] `src/features/authentication/ui/steps/AdobeAuthStep.tsx` - Split auth check from message listener
- [ ] `src/features/dashboard/ui/screens/ConfigureScreen.tsx` - Split focus from scroll sync

---

## Implementation Details

### RED Phase

```typescript
// tests/webviews/steps/PrerequisitesStep-effects.test.tsx
describe('PrerequisitesStep effects', () => {
  it('cleans up installation listener on unmount', () => {
    const removeListener = jest.fn();
    jest.spyOn(window, 'addEventListener').mockImplementation(() => {});
    jest.spyOn(window, 'removeEventListener').mockImplementation(removeListener);

    const { unmount } = render(<PrerequisitesStep {...props} />);
    unmount();

    expect(removeListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('re-registers status listener when checks change', () => {
    const { rerender } = render(<PrerequisitesStep {...props} checks={[]} />);
    const initialCalls = window.addEventListener.mock.calls.length;

    rerender(<PrerequisitesStep {...props} checks={[newCheck]} />);

    expect(window.addEventListener.mock.calls.length).toBeGreaterThan(initialCalls);
  });
});
```

### GREEN Phase

**PrerequisitesStep.tsx** - Split into 4 effects:

```typescript
// Effect 1: Installation complete listener (no deps)
useEffect(() => {
  const handleInstallationComplete = (event: MessageEvent) => {
    if (event.data.type === 'installationComplete') {
      // handle installation complete
    }
  };
  window.addEventListener('message', handleInstallationComplete);
  return () => window.removeEventListener('message', handleInstallationComplete);
}, []);

// Effect 2: Check stopped listener (no deps)
useEffect(() => {
  const handleCheckStopped = (event: MessageEvent) => {
    if (event.data.type === 'checkStopped') {
      // handle check stopped
    }
  };
  window.addEventListener('message', handleCheckStopped);
  return () => window.removeEventListener('message', handleCheckStopped);
}, []);

// Effect 3: Status listener (depends on checks)
useEffect(() => {
  const handleStatus = (event: MessageEvent) => {
    if (event.data.type === 'statusUpdate') {
      // handle status with current checks
    }
  };
  window.addEventListener('message', handleStatus);
  return () => window.removeEventListener('message', handleStatus);
}, [checks]);

// Effect 4: Complete listener (no deps)
useEffect(() => {
  const handleComplete = (event: MessageEvent) => {
    if (event.data.type === 'complete') {
      // handle complete
    }
  };
  window.addEventListener('message', handleComplete);
  return () => window.removeEventListener('message', handleComplete);
}, []);
```

**ComponentConfigStep.tsx** - Separate concerns:

```typescript
// Effect 1: Focus listener setup
useEffect(() => {
  const handleFocus = () => { /* focus logic */ };
  window.addEventListener('focus', handleFocus);
  return () => window.removeEventListener('focus', handleFocus);
}, []);

// Effect 2: Scroll synchronization
useEffect(() => {
  const handleScroll = () => { /* scroll sync logic */ };
  containerRef.current?.addEventListener('scroll', handleScroll);
  return () => containerRef.current?.removeEventListener('scroll', handleScroll);
}, [containerRef]);

// Effect 3: Navigation highlighting
useEffect(() => {
  updateActiveSection(scrollPosition);
}, [scrollPosition, sections]);
```

**AdobeAuthStep.tsx** - Split auth from messages:

```typescript
// Effect 1: Initial auth check (runs once)
useEffect(() => {
  checkAuthStatus();
}, []);

// Effect 2: Message listener setup
useEffect(() => {
  const handleMessage = (event: MessageEvent) => { /* message handling */ };
  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, []);

// Effect 3: Timeout handling
useEffect(() => {
  if (isLoading) {
    const timeout = setTimeout(() => setTimedOut(true), 30000);
    return () => clearTimeout(timeout);
  }
}, [isLoading]);
```

### REFACTOR Phase

1. Ensure each effect has minimal, correct dependency array
2. Remove stale closure references
3. Add JSDoc comments explaining each effect's purpose
4. Verify cleanup functions are complete

---

## Expected Outcome

- Each useEffect handles single concern
- Dependency arrays are explicit and minimal
- Cleanup functions prevent memory leaks
- Effects re-run only when necessary
- Tests verify isolation between effects

## Acceptance Criteria

- [ ] All effect tests passing
- [ ] No React warnings about missing dependencies
- [ ] No memory leaks detected in unmount tests
- [ ] Each effect has clear single responsibility
- [ ] Coverage maintained at 80%+

**Estimated Time**: 3 hours

---

## Impact Summary

```
📊 Step 6 Impact:
├─ LOC: +50 (more explicit effect structure)
├─ CC Reduction: -8 (clearer dependency tracking)
├─ Type Safety: maintained
├─ Abstractions: 0 (same hooks, better organized)
└─ Coverage: update existing tests
```
