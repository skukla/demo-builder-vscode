# Step 4: UI + Handlers + DI + Cache Tests (25 files)

> **Phase:** 4 - Core Infrastructure
> **Step:** 4 of 5
> **Focus:** UI components, hooks, handlers, dependency injection, caching

## Overview

**Purpose:** Audit all UI, handlers, DI, and cache module tests to ensure they accurately reflect current React component patterns, hook implementations, handler registry, and caching strategies.

**Estimated Time:** 2-3 hours

**Prerequisites:**
- [ ] Step 3 (Validation + Utils) complete
- [ ] All current tests pass
- [ ] Access to src/core/ui/, src/core/handlers/, src/core/di/, src/core/cache/ for reference

---

## Source Files for Reference

### UI Module

```
src/core/ui/
├── components/
│   ├── WebviewApp.tsx         # Root webview app component
│   ├── ErrorBoundary.tsx      # React error boundary
│   ├── layout/
│   │   ├── PageLayout.tsx     # Page layout wrapper
│   │   ├── PageHeader.tsx     # Page header component
│   │   ├── PageFooter.tsx     # Page footer component
│   │   └── CenteredFeedbackContainer.tsx
│   ├── feedback/
│   │   └── SuccessStateDisplay.tsx
│   ├── navigation/
│   │   └── BackButton.tsx
│   └── ui/
│       └── Modal.tsx
├── hooks/
│   ├── useAsyncOperation.ts   # Async operation hook
│   ├── useCanProceed.ts       # Wizard progression hook
│   ├── useFocusOnMount.ts     # Focus management hook
│   ├── useTimerCleanup.ts     # Timer cleanup hook
│   ├── useVerificationMessage.ts
│   └── usePollingWithTimeout.ts
├── styles/
│   ├── layerDeclarations.ts   # CSS layer declarations
│   ├── reset.ts               # CSS reset utilities
│   └── tokens.ts              # Design tokens
└── utils/
    ├── WebviewClient.ts       # Webview client utility
    └── frontendTimeouts.ts    # Frontend timeout constants
```

### Handlers Module

```
src/core/handlers/
├── HandlerRegistry.ts         # Message handler registration
├── errorHandling.ts           # Error handling utilities
├── projectCommandHelper.ts    # Project command helpers
└── index.ts                   # Public exports
```

### DI Module

```
src/core/di/
└── diPatterns.ts              # DI patterns and utilities
```

### Cache Module

```
src/core/cache/
└── AbstractCacheManager.ts    # Base cache manager class
```

---

## Test Files to Audit

### UI Component Tests (9 files)

#### 1. WebviewApp.test.tsx

**File:** `tests/core/ui/components/WebviewApp.test.tsx`

**Audit Checklist:**
- [ ] Component props match current implementation
- [ ] Provider wrapping verified (if any)
- [ ] Rendering behavior verified
- [ ] React Testing Library patterns used correctly

#### 2. ErrorBoundary.test.tsx

**File:** `tests/core/ui/components/ErrorBoundary.test.tsx`

**Audit Checklist:**
- [ ] Error catching behavior verified
- [ ] Fallback UI rendering verified
- [ ] Error logging behavior verified
- [ ] componentDidCatch patterns tested

#### 3. Modal.test.tsx

**File:** `tests/core/ui/components/ui/Modal.test.tsx`

**Audit Checklist:**
- [ ] Modal props match current implementation
- [ ] Open/close behavior verified
- [ ] Focus trap behavior verified
- [ ] Spectrum Modal integration verified

#### 4. PageLayout.test.tsx

**File:** `tests/core/ui/components/layout/PageLayout.test.tsx`

**Audit Checklist:**
- [ ] Layout props match current
- [ ] Children rendering verified
- [ ] CSS class application verified

#### 5. PageHeader.test.tsx

**File:** `tests/core/ui/components/layout/PageHeader.test.tsx`

**Audit Checklist:**
- [ ] Header props match current
- [ ] Title rendering verified
- [ ] Action button slots verified

#### 6. PageFooter.test.tsx

**File:** `tests/core/ui/components/layout/PageFooter.test.tsx`

**Audit Checklist:**
- [ ] Footer props match current
- [ ] Button rendering verified
- [ ] Layout structure verified

#### 7. CenteredFeedbackContainer.test.tsx

**File:** `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`

**Audit Checklist:**
- [ ] Container props match current
- [ ] Centering behavior verified
- [ ] Children rendering verified

#### 8. SuccessStateDisplay.test.tsx

**File:** `tests/core/ui/components/feedback/SuccessStateDisplay.test.tsx`

**Audit Checklist:**
- [ ] Success display props match current
- [ ] Icon rendering verified
- [ ] Message display verified

#### 9. BackButton.test.tsx

**File:** `tests/core/ui/components/navigation/BackButton.test.tsx`

**Audit Checklist:**
- [ ] BackButton props match current
- [ ] onClick handler verified
- [ ] Icon rendering verified

---

### UI Hook Tests (6 files)

#### 10. useAsyncOperation.test.tsx

**File:** `tests/core/ui/hooks/useAsyncOperation.test.tsx`

**Audit Checklist:**
- [ ] Hook API matches current implementation
- [ ] Loading state management verified
- [ ] Error state handling verified
- [ ] Success callback verified

**Key Verification Points:**
```typescript
// Verify hook return shape:
const { execute, isLoading, error, result } = useAsyncOperation(asyncFn);
```

#### 11. useCanProceed.test.tsx

**File:** `tests/core/ui/hooks/useCanProceed.test.tsx`

**Audit Checklist:**
- [ ] Hook API matches current
- [ ] Condition evaluation verified
- [ ] State dependency handling verified

#### 12. useFocusOnMount.test.tsx

**File:** `tests/core/ui/hooks/useFocusOnMount.test.tsx`

**Audit Checklist:**
- [ ] Focus behavior verified
- [ ] Ref handling verified
- [ ] Cleanup behavior verified

#### 13. useTimerCleanup.test.tsx

**File:** `tests/core/ui/hooks/useTimerCleanup.test.tsx`

**Audit Checklist:**
- [ ] Timer cleanup on unmount verified
- [ ] Multiple timer handling verified
- [ ] jest.useFakeTimers() used correctly

#### 14. useVerificationMessage.test.tsx

**File:** `tests/core/ui/hooks/useVerificationMessage.test.tsx`

**Audit Checklist:**
- [ ] Message state management verified
- [ ] Verification status handling verified

#### 15. usePollingWithTimeout.test.tsx

**File:** `tests/core/ui/hooks/usePollingWithTimeout.test.tsx`

**Audit Checklist:**
- [ ] Polling behavior verified
- [ ] Timeout handling verified
- [ ] Cleanup on unmount verified
- [ ] jest.useFakeTimers() used correctly

---

### UI Style Tests (3 files)

#### 16. layerDeclarations.test.ts

**File:** `tests/core/ui/styles/layerDeclarations.test.ts`

**Audit Checklist:**
- [ ] CSS layer declarations match current
- [ ] Layer ordering verified

#### 17. reset.test.ts

**File:** `tests/core/ui/styles/reset.test.ts`

**Audit Checklist:**
- [ ] CSS reset utilities match current
- [ ] Reset application verified

#### 18. tokens.test.ts

**File:** `tests/core/ui/styles/tokens.test.ts`

**Audit Checklist:**
- [ ] Design token values verified
- [ ] Token export structure verified

---

### UI Utils Tests (2 files)

#### 19. WebviewClient.test.ts

**File:** `tests/core/ui/utils/WebviewClient.test.ts`

**Audit Checklist:**
- [ ] WebviewClient API matches current
- [ ] Message sending verified
- [ ] Response handling verified

#### 20. frontendTimeouts.test.ts

**File:** `tests/core/ui/utils/frontendTimeouts.test.ts`

**Audit Checklist:**
- [ ] Frontend timeout constants verified
- [ ] Values reasonable for UI operations

---

### Handler Tests (3 files)

#### 21. HandlerRegistry.test.ts

**File:** `tests/core/handlers/HandlerRegistry.test.ts`

**Audit Checklist:**
- [ ] Registry API matches current
- [ ] Handler registration verified
- [ ] Handler lookup verified
- [ ] Handler execution verified

**Key Verification Points:**
```typescript
// Verify registry pattern:
registry.register('messageType', handler);
registry.handle('messageType', context, payload);
```

#### 22. errorHandling.test.ts

**File:** `tests/core/handlers/errorHandling.test.ts`

**Audit Checklist:**
- [ ] Error handling utilities match current
- [ ] Error formatting verified
- [ ] Error response shapes verified

#### 23. RegistryPatternConsistency.test.ts

**File:** `tests/core/handlers/RegistryPatternConsistency.test.ts`

**Audit Checklist:**
- [ ] Pattern consistency checks verified
- [ ] Cross-feature registry usage verified

---

### DI Tests (1 file)

#### 24. diPatterns.test.ts

**File:** `tests/core/di/diPatterns.test.ts`

**Audit Checklist:**
- [ ] DI patterns match current implementation
- [ ] Service registration verified
- [ ] Dependency resolution verified

---

### Cache Tests (1 file)

#### 25. AbstractCacheManager.test.ts

**File:** `tests/core/cache/AbstractCacheManager.test.ts`

**Audit Checklist:**
- [ ] AbstractCacheManager API matches current
- [ ] Cache get/set operations verified
- [ ] TTL behavior verified (if applicable)
- [ ] Cache invalidation verified

---

## Audit Process

For each file:

1. **Read current source** in relevant src/core/ subdirectory
2. **Open test file** in corresponding tests/core/ subdirectory
3. **Verify mock setup** matches current dependencies
4. **For React tests:**
   - Use @testing-library/react patterns
   - Verify component props match current
   - Verify rendering behavior
5. **Check each test** for:
   - Correct API calls
   - Correct expected values
   - No version references (v2/v3)
6. **Run tests** after changes: `npm test -- tests/core/[subdir]/[file].test.ts`
7. **Commit** after each file passes

---

## Common Issues to Fix

### Issue 1: Outdated React Component Props

**Before:**
```typescript
render(<PageLayout title="Test" showBack={true} />);
```

**After:**
```typescript
render(<PageLayout header={<PageHeader title="Test" />} />);
```

### Issue 2: Outdated Hook API

**Before:**
```typescript
const [loading, execute] = useAsyncOperation(asyncFn);
```

**After:**
```typescript
const { execute, isLoading, error, result } = useAsyncOperation(asyncFn);
```

### Issue 3: Missing act() Wrappers

**Before:**
```typescript
const { result } = renderHook(() => useAsyncOperation(asyncFn));
result.current.execute();
```

**After:**
```typescript
const { result } = renderHook(() => useAsyncOperation(asyncFn));
await act(async () => {
  await result.current.execute();
});
```

### Issue 4: Outdated Handler Registry API

**Before:**
```typescript
registry.addHandler('type', handler);
```

**After:**
```typescript
registry.register('type', handler);
```

---

## React Testing Patterns

Ensure tests use current patterns:

### Component Testing
```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

it('should render correctly', () => {
  render(<Component prop="value" />);
  expect(screen.getByText('value')).toBeInTheDocument();
});

it('should handle click', async () => {
  const user = userEvent.setup();
  const onClick = jest.fn();
  render(<Button onClick={onClick}>Click</Button>);
  await user.click(screen.getByRole('button'));
  expect(onClick).toHaveBeenCalled();
});
```

### Hook Testing
```typescript
import { renderHook, act } from '@testing-library/react';

it('should update state', async () => {
  const { result } = renderHook(() => useMyHook());

  await act(async () => {
    result.current.doSomething();
  });

  expect(result.current.state).toBe('updated');
});
```

---

## Completion Criteria

- [ ] All 9 UI component test files audited
- [ ] All 6 UI hook test files audited
- [ ] All 3 UI style test files audited
- [ ] All 2 UI utils test files audited
- [ ] All 3 handler test files audited
- [ ] All 1 DI test file audited
- [ ] All 1 cache test file audited
- [ ] All tests pass: `npm test -- tests/core/ui/ tests/core/handlers/ tests/core/di/ tests/core/cache/`
- [ ] No TypeScript errors

---

## Files Modified (Tracking)

### UI Components

| File | Status | Notes |
|------|--------|-------|
| WebviewApp.test.tsx | [ ] | |
| ErrorBoundary.test.tsx | [ ] | |
| Modal.test.tsx | [ ] | |
| PageLayout.test.tsx | [ ] | |
| PageHeader.test.tsx | [ ] | |
| PageFooter.test.tsx | [ ] | |
| CenteredFeedbackContainer.test.tsx | [ ] | |
| SuccessStateDisplay.test.tsx | [ ] | |
| BackButton.test.tsx | [ ] | |

### UI Hooks

| File | Status | Notes |
|------|--------|-------|
| useAsyncOperation.test.tsx | [ ] | |
| useCanProceed.test.tsx | [ ] | |
| useFocusOnMount.test.tsx | [ ] | |
| useTimerCleanup.test.tsx | [ ] | |
| useVerificationMessage.test.tsx | [ ] | |
| usePollingWithTimeout.test.tsx | [ ] | |

### UI Styles

| File | Status | Notes |
|------|--------|-------|
| layerDeclarations.test.ts | [ ] | |
| reset.test.ts | [ ] | |
| tokens.test.ts | [ ] | |

### UI Utils

| File | Status | Notes |
|------|--------|-------|
| WebviewClient.test.ts | [ ] | |
| frontendTimeouts.test.ts | [ ] | |

### Handlers

| File | Status | Notes |
|------|--------|-------|
| HandlerRegistry.test.ts | [ ] | |
| errorHandling.test.ts | [ ] | |
| RegistryPatternConsistency.test.ts | [ ] | |

### DI

| File | Status | Notes |
|------|--------|-------|
| diPatterns.test.ts | [ ] | |

### Cache

| File | Status | Notes |
|------|--------|-------|
| AbstractCacheManager.test.ts | [ ] | |

---

## Next Step

After completing Step 4, proceed to:
**Step 5: VSCode + Communication + Logging + Base + Commands Tests (18 files)**
