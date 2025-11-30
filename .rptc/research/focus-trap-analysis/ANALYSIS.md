# Focus Trap Implementation Analysis

**Date**: 2025-01-16
**Status**: Analysis Complete → Implementing Fixes

## Executive Summary

Found **3 focus trap implementations** across the application with **5 critical issues** and **inconsistent approaches**. Standardization required.

---

## Current Implementations

### 1. `useFocusTrap` Hook (Shared)
**Location**: `src/core/ui/hooks/useFocusTrap.ts`
**Used By**:
- `WelcomeScreen.tsx` (with `autoFocus: true`)
- `ProjectDashboardScreen.tsx` (with `autoFocus: false`)

**Implementation**: Custom polling-based focus trap

**Issues**:
- ❌ **Polling every 16ms** for ref attachment (inefficient)
- ❌ **No focus containment** (focus can escape container)
- ❌ **Inefficient DOM queries** on every Tab keypress
- ❌ **Silent failures** with zero focusable elements
- ⚠️ **Redundant autoFocus** in WelcomeScreen

---

### 2. Manual Implementation in WizardContainer
**Location**: `src/features/project-creation/ui/wizard/WizardContainer.tsx` (lines 379-410)

**Implementation**: Global `document` event listener

**Code**:
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      const focusableElements = document.querySelectorAll(FOCUSABLE_ELEMENTS_SELECTOR);
      // ... manual focus cycling
      e.preventDefault(); // ← ALWAYS prevents default
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [state.currentStep]);
```

**Issues**:
- ❌ **Global document listener** (not scoped to container)
- ❌ **Always prevents Tab** (even when focus outside wizard)
- ❌ **Queries entire document** instead of scoped container
- ❌ **Different selector** than hook (inconsistent)
- ✅ Cleanup on step change (good)

---

### 3. No Focus Trap
**Missing In**: Dashboard component browser, modals (if any)

---

## Critical Issues

### Issue 1: Redundant AutoFocus in WelcomeScreen ⚠️ HIGH
**Location**: `src/features/welcome/ui/WelcomeScreen.tsx`

```typescript
// Line 24-27: Hook tries to autofocus first element
const containerRef = useFocusTrap<HTMLDivElement>({
  autoFocus: true,  // ← Tries to focus first button
});

// Line 83: Button also has autoFocus
<ActionButton autoFocus>  // ← Competing autofocus
```

**Impact**: Race condition, unpredictable focus behavior

**Fix**: Remove `autoFocus` prop from ActionButton

---

### Issue 2: Inefficient Polling Pattern ⚠️ MEDIUM
**Location**: `useFocusTrap.ts` lines 66-79

```typescript
// Polls every 16ms until ref attaches
const intervalId = setInterval(() => {
  if (!containerRef.current) return;
  // ... setup
}, 16);
```

**Impact**:
- Wasteful CPU cycles
- Could miss ref attachment
- Not synchronized with React rendering

**Fix**: Use `useLayoutEffect` which runs synchronously after DOM updates

---

### Issue 3: Focus Can Escape Container ⚠️ HIGH
**Location**: `useFocusTrap.ts` lines 96-116

**Current**: Only prevents Tab/Shift+Tab at boundaries when focus **already inside**

**Missing**:
```typescript
// If focus escapes (click outside, dev tools, etc), bring it back
const handleFocusIn = (e: FocusEvent) => {
  if (!container.contains(e.target as Node)) {
    focusableElements[0]?.focus();
  }
};
document.addEventListener('focusin', handleFocusIn, true);
```

**Impact**: WCAG 2.1 AA failure (focus can escape modal/wizard)

---

### Issue 4: WizardContainer Global Listener ⚠️ CRITICAL
**Location**: `WizardContainer.tsx` lines 379-410

```typescript
// Listens to ENTIRE document
document.addEventListener('keydown', handleKeyDown);

// Always prevents Tab, even if focus outside wizard
if (e.key === 'Tab') {
  e.preventDefault(); // ← Breaks browser navigation
}
```

**Impact**:
- Breaks browser UI navigation (address bar, dev tools)
- Security issue (prevents escape from extension)
- Bad UX (can't Tab to VS Code sidebar)

**Fix**: Replace with scoped `useFocusTrap` hook

---

### Issue 5: Inconsistent Selectors

**Hook Selector** (`useFocusTrap.ts` line 12-17):
```typescript
'button:not([disabled]):not([tabindex="-1"]), ' +
'input:not([disabled]):not([tabindex="-1"]), ' +
// ...
'[tabindex]:not([tabindex="-1"])'
```

**WizardContainer Selector** (line 33-38):
```typescript
'button:not([disabled]):not([tabindex="-1"]), ' +
// ...
'[tabindex]:not([tabindex="-1"]):not([tabindex="0"])' // ← Excludes [tabindex="0"]
```

**Impact**: Different focus behavior in wizard vs other screens

---

## Recommended Standardization

### 1. Improve `useFocusTrap` Hook

**Changes**:
1. Replace polling with `useLayoutEffect`
2. Add focus containment (`focusin` listener)
3. Cache focusable elements, invalidate on mutation
4. Add development warnings
5. Ensure selector consistency

### 2. Migrate WizardContainer

**Before**:
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // ... manual implementation
  };
  document.addEventListener('keydown', handleKeyDown);
}, [state.currentStep]);
```

**After**:
```typescript
const containerRef = useFocusTrap<HTMLDivElement>({
  enabled: true,
  autoFocus: false  // Wizard manages its own focus
});

return <div ref={containerRef}>{/* wizard content */}</div>;
```

### 3. Fix WelcomeScreen

**Remove**: `autoFocus` prop from ActionButton (let hook handle it)

---

## Implementation Priority

### Phase 1: Critical Fixes (Immediate)
1. ✅ Remove redundant `autoFocus` in WelcomeScreen
2. ✅ Add focus containment to `useFocusTrap`
3. ✅ Fix WizardContainer global listener (migrate to hook)

### Phase 2: Performance & DX (Soon)
4. ✅ Replace polling with `useLayoutEffect`
5. ✅ Cache focusable elements
6. ✅ Add development warnings

### Phase 3: Testing (Before Merge)
7. ✅ Update `useFocusTrap.test.ts`
8. ✅ Test WizardContainer focus trap
9. ✅ Test all 3 screens (Welcome, Dashboard, Wizard)

---

## Architectural Decision

**Standardize on `useFocusTrap` hook** for all focus traps:

**Benefits**:
- ✅ Consistent behavior across app
- ✅ Single source of truth
- ✅ Easier to test
- ✅ Better accessibility (WCAG 2.1 AA compliant)
- ✅ Better performance (scoped listeners, cached queries)

**Migration Path**:
1. Improve hook (focus containment, performance)
2. Migrate WizardContainer
3. Document usage patterns
4. Add to component library docs

---

## Testing Strategy

### Unit Tests
- Focus trap activation/deactivation
- Tab cycling (forward/backward)
- Focus containment (escape prevention)
- Edge cases (0 elements, 1 element)

### Integration Tests
- Welcome screen keyboard navigation
- Wizard step-to-step focus retention
- Dashboard action focus

### Manual Testing
- Click outside container → focus returns
- Dev tools open → focus stays in container
- Browser address bar → focus stays in container

---

## WCAG 2.1 AA Compliance

**Before**: ❌ Partial compliance
- WizardContainer: Prevents browser navigation (fail)
- useFocusTrap: Focus can escape (fail)

**After**: ✅ Full compliance
- Focus trapped in modal contexts
- Escape via explicit close actions only
- Keyboard navigation predictable
- Focus visible at all times

---

**Analysis Complete**
**Next**: Implement fixes in order of priority
