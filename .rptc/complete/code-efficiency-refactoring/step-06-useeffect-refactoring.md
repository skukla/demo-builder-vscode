# Step 6: useEffect Refactoring - Detailed Implementation Plan

## Overview

Fix problematic useEffect patterns across React components, addressing stale closures, memory leaks, and over-complicated effects.

**Estimated Effort:** 6-10 hours
**Risk Level:** Medium-High (touching state management)
**Dependencies:** Step 5 partial (some effects move to hooks)

---

## Current State Analysis

### useEffect Inventory

| Category | Count | Status |
|----------|-------|--------|
| Well-implemented | 8 | 38% ✅ |
| Minor issues | 5 | 24% ⚠️ |
| Major issues | 8 | 38% ❌ |
| **Total** | **21** | |

### Critical Issues by Severity

#### HIGH SEVERITY (Fix First)

| File | Lines | Issue | Impact |
|------|-------|-------|--------|
| PrerequisitesStep.tsx | 128-247 | Stale closures, 120 lines | Memory leaks, missed updates |
| WizardContainer.tsx | 165-191 | Re-registers on state change | Performance, race conditions |
| ComponentSelectionStep.tsx | 103-131 | Over-complicated focus | Brittle, unreliable |
| ConfigureScreen.tsx | 319-400 | 81-line DOM traversal | Hard to maintain |

#### MEDIUM SEVERITY

| File | Lines | Issue |
|------|-------|-------|
| WelcomeStep.tsx | 38-53 | Excessive timeouts |
| ConfigureScreen.tsx | 402-452 | Expensive validation |
| WizardContainer.tsx | 220-244 | Complex multi-step focus |
| ProjectDashboardScreen.tsx | 107-118 | Wrong dependency array |

---

## Implementation Plan

### Phase 1: Fix Stale Closure Bugs (Priority: CRITICAL)

#### 1.1 PrerequisitesStep Message Handlers

**Current Problem (Lines 128-247):**
```typescript
// BAD: Re-registers on EVERY state change
useEffect(() => {
    const unsubscribe1 = webviewClient.onMessage('prerequisite-status', (data) => {
        setChecks(prev => /* uses prev */);
        // Auto-scroll logic embedded here
    });
    const unsubscribe2 = webviewClient.onMessage('prerequisite-install-complete', ...);
    // ... 3 more subscriptions

    return () => { /* cleanup all */ };
}, [checks, versionComponentMapping]); // 120 lines, re-runs on every check!
```

**Solution: Split into mount-only subscription + reactive side effects**

```typescript
// Effect 1: Register listeners ONCE at mount
useEffect(() => {
    const unsubscribeStatus = webviewClient.onMessage('prerequisite-status', (data) => {
        // Use functional update to avoid stale closure
        setChecks(prev => updateCheckStatus(prev, data));
    });

    const unsubscribeComplete = webviewClient.onMessage('prerequisites-complete', () => {
        setIsChecking(false);
    });

    const unsubscribeInstallComplete = webviewClient.onMessage('prerequisite-install-complete', (data) => {
        setInstallingIndex(null);
        setChecks(prev => updateCheckInstalled(prev, data));
    });

    return () => {
        unsubscribeStatus();
        unsubscribeComplete();
        unsubscribeInstallComplete();
    };
}, []); // Empty deps - register ONCE

// Effect 2: Auto-scroll when checks change (reactive)
useEffect(() => {
    const checkingItem = checks.find(c => c.status === 'checking');
    if (checkingItem && scrollContainerRef.current) {
        scrollToItem(checkingItem);
    }
}, [checks]);

// Effect 3: Update canProceed based on check status
useEffect(() => {
    const allRequiredPass = checks
        .filter(c => !c.isOptional)
        .every(c => c.status === 'success' || c.status === 'warning');
    setCanProceed(allRequiredPass);
}, [checks, setCanProceed]);
```

**Test Strategy:**
```typescript
describe('PrerequisitesStep message handling', () => {
    it('registers message listeners only once on mount', () => {
        const { rerender } = render(<PrerequisitesStep {...props} />);
        expect(webviewClient.onMessage).toHaveBeenCalledTimes(3);

        rerender(<PrerequisitesStep {...updatedProps} />);
        // Should NOT re-register
        expect(webviewClient.onMessage).toHaveBeenCalledTimes(3);
    });

    it('unsubscribes all listeners on unmount', () => {
        const { unmount } = render(<PrerequisitesStep {...props} />);
        unmount();
        expect(mockUnsubscribe).toHaveBeenCalledTimes(3);
    });

    it('updates checks using functional update (no stale closure)', async () => {
        render(<PrerequisitesStep {...props} />);

        // Simulate rapid status updates
        act(() => {
            mockStatusCallback({ id: 'node', status: 'checking' });
            mockStatusCallback({ id: 'npm', status: 'checking' });
        });

        // Both should be reflected (no stale state)
        await waitFor(() => {
            expect(screen.getByTestId('node-status')).toHaveTextContent('checking');
            expect(screen.getByTestId('npm-status')).toHaveTextContent('checking');
        });
    });
});
```

#### 1.2 WizardContainer Feedback Listener

**Current Problem (Lines 165-191):**
```typescript
// BAD: Re-registers on every state change
useEffect(() => {
    const unsubscribe = vscode.onMessage('feedback', (message) => {
        if (state.currentStep === 'project-creation' && state.creationProgress) {
            setState(prev => ({ ...prev, creationProgress: {...} }));
        }
    });
    return unsubscribe;
}, [state.currentStep, state.creationProgress]); // Causes re-registration!
```

**Solution: Use functional update pattern**

```typescript
// Effect: Register ONCE, use functional updates
useEffect(() => {
    const unsubscribe = vscode.onMessage('feedback', (message: FeedbackMessage) => {
        setState(prev => {
            // Check conditions inside functional update
            if (prev.currentStep !== 'project-creation' || !prev.creationProgress) {
                return prev; // No change
            }
            return {
                ...prev,
                creationProgress: {
                    ...prev.creationProgress,
                    currentOperation: message.primary,
                    currentDetail: message.secondary,
                    timestamp: Date.now(),
                },
            };
        });
    });

    return unsubscribe;
}, []); // Empty deps - state accessed via functional update
```

**Test Strategy:**
```typescript
describe('WizardContainer feedback handling', () => {
    it('registers feedback listener once', () => {
        const { rerender } = render(<WizardContainer />);
        expect(mockOnMessage).toHaveBeenCalledTimes(1);

        // Trigger state change
        act(() => { /* simulate step change */ });
        rerender(<WizardContainer />);

        // Should NOT re-register
        expect(mockOnMessage).toHaveBeenCalledTimes(1);
    });

    it('updates progress only during project-creation step', async () => {
        render(<WizardContainer initialStep="welcome" />);

        act(() => {
            mockFeedbackCallback({ primary: 'Creating...', secondary: 'Step 1' });
        });

        // Should NOT update (wrong step)
        expect(screen.queryByText('Creating...')).not.toBeInTheDocument();
    });
});
```

---

### Phase 2: Simplify Focus Management (Priority: HIGH)

#### 2.1 ComponentSelectionStep Focus

**Current Problem (Lines 103-131):**
```typescript
// BAD: Over-complicated with MutationObserver + synthetic events
useEffect(() => {
    let focused = false;
    const tryFocus = () => {
        if (focused) return;
        const button = container.querySelector('button');
        if (button) {
            // This synthetic event doesn't work reliably
            button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
            button.focus();
            focused = true;
        }
    };

    const observer = new MutationObserver(tryFocus);
    observer.observe(container, { childList: true, subtree: true, attributes: true });
    tryFocus();

    const fallback = setTimeout(() => {
        tryFocus();
        observer.disconnect();
    }, TIMEOUTS.FOCUS_FALLBACK);

    return () => {
        observer.disconnect();
        clearTimeout(fallback);
    };
}, []); // 28 lines for focus!
```

**Solution: Simple RAF + timeout fallback**

```typescript
// GOOD: Simple, reliable focus management
useEffect(() => {
    const focusButton = () => {
        const button = frontendPickerRef.current?.querySelector('button');
        if (button instanceof HTMLElement) {
            button.focus();
            return true;
        }
        return false;
    };

    // Try immediate
    if (focusButton()) return;

    // Try after next frame (for async rendering)
    const frameId = requestAnimationFrame(() => {
        if (focusButton()) return;
    });

    // Final fallback
    const timerId = setTimeout(focusButton, TIMEOUTS.FOCUS_FALLBACK);

    return () => {
        cancelAnimationFrame(frameId);
        clearTimeout(timerId);
    };
}, []); // 16 lines, cleaner
```

**Test Strategy:**
```typescript
describe('ComponentSelectionStep focus', () => {
    it('focuses frontend picker on mount', async () => {
        render(<ComponentSelectionStep {...props} />);

        await waitFor(() => {
            const button = screen.getByRole('button', { name: /select frontend/i });
            expect(document.activeElement).toBe(button);
        });
    });

    it('handles delayed rendering gracefully', async () => {
        // Simulate slow Spectrum component rendering
        jest.useFakeTimers();
        render(<ComponentSelectionStep {...props} />);

        jest.advanceTimersByTime(TIMEOUTS.FOCUS_FALLBACK);

        const button = screen.getByRole('button', { name: /select frontend/i });
        expect(document.activeElement).toBe(button);

        jest.useRealTimers();
    });
});
```

#### 2.2 Create Reusable useFocusOnMount Hook

**File:** `src/core/ui/hooks/useFocusOnMount.ts`

```typescript
interface UseFocusOnMountOptions {
    selector?: string;
    delay?: number;
    disabled?: boolean;
}

export function useFocusOnMount(
    ref: React.RefObject<HTMLElement>,
    options: UseFocusOnMountOptions = {}
) {
    const { selector = 'button, input, [tabindex]', delay = 0, disabled = false } = options;

    useEffect(() => {
        if (disabled || !ref.current) return;

        const focus = () => {
            const element = selector
                ? ref.current?.querySelector(selector)
                : ref.current;
            if (element instanceof HTMLElement) {
                element.focus();
                return true;
            }
            return false;
        };

        if (delay === 0 && focus()) return;

        const frameId = requestAnimationFrame(focus);
        const timerId = setTimeout(focus, delay || TIMEOUTS.FOCUS_FALLBACK);

        return () => {
            cancelAnimationFrame(frameId);
            clearTimeout(timerId);
        };
    }, [ref, selector, delay, disabled]);
}
```

---

### Phase 3: Extract Complex Effects (Priority: MEDIUM)

#### 3.1 ConfigureScreen Scroll Logic

**Current Problem (Lines 319-400):**
- 81-line effect managing focus, scroll, navigation
- Complex ref tracking (`lastFocusedSectionRef`, `fieldCountInSectionRef`)
- Multiple conditional branches

**Solution: Extract to custom hook**

**File:** `src/features/dashboard/ui/hooks/useConfigNavigation.ts`

```typescript
interface UseConfigNavigationOptions {
    sections: ConfigSection[];
    activeFieldId: string | null;
    onSectionChange?: (sectionId: string) => void;
}

interface UseConfigNavigationReturn {
    activeSectionId: string | null;
    scrollToField: (fieldId: string) => void;
    scrollToSection: (sectionId: string) => void;
}

export function useConfigNavigation(options: UseConfigNavigationOptions): UseConfigNavigationReturn {
    const { sections, activeFieldId, onSectionChange } = options;
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

    // Effect: Scroll to field when activeFieldId changes
    useEffect(() => {
        if (!activeFieldId) return;

        const fieldElement = document.getElementById(`field-${activeFieldId}`);
        fieldElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        // Find which section this field belongs to
        const section = sections.find(s =>
            s.fields.some(f => f.key === activeFieldId)
        );
        if (section && section.id !== activeSectionId) {
            setActiveSectionId(section.id);
            onSectionChange?.(section.id);
        }
    }, [activeFieldId, sections, activeSectionId, onSectionChange]);

    const scrollToField = useCallback((fieldId: string) => {
        const element = document.getElementById(`field-${fieldId}`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, []);

    const scrollToSection = useCallback((sectionId: string) => {
        const element = document.getElementById(`section-${sectionId}`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveSectionId(sectionId);
    }, []);

    return { activeSectionId, scrollToField, scrollToSection };
}
```

**Refactored ConfigureScreen:**
```typescript
// Before: 81-line useEffect
// After: Simple hook usage
const { activeSectionId, scrollToField, scrollToSection } = useConfigNavigation({
    sections: serviceGroups,
    activeFieldId,
    onSectionChange: setExpandedSection,
});
```

---

### Phase 4: Optimize Expensive Effects (Priority: MEDIUM)

#### 4.1 ConfigureScreen Validation

**Current Problem (Lines 402-452):**
```typescript
// BAD: Re-runs validation on EVERY config change
useEffect(() => {
    const errors: Record<string, string> = {};

    serviceGroups.forEach(group => {
        group.fields.forEach(field => {
            // Creates new RegExp on every run!
            const pattern = new RegExp(field.validation.pattern);
            // ... validation logic
        });
    });

    setValidationErrors(errors);
}, [componentConfigs, serviceGroups]); // Expensive!
```

**Solution: Use useMemo for computation, minimal effect for side effects**

```typescript
// GOOD: Memoize validation computation
const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};

    // Cache RegExp objects
    const patternCache = new Map<string, RegExp>();
    const getPattern = (pattern: string) => {
        if (!patternCache.has(pattern)) {
            patternCache.set(pattern, new RegExp(pattern));
        }
        return patternCache.get(pattern)!;
    };

    serviceGroups.forEach(group => {
        group.fields.forEach(field => {
            const value = componentConfigs[group.componentId]?.[field.key];

            if (field.required && !value) {
                errors[field.key] = `${field.label} is required`;
            } else if (field.validation?.pattern && value) {
                const pattern = getPattern(field.validation.pattern);
                if (!pattern.test(String(value))) {
                    errors[field.key] = field.validation.message || 'Invalid format';
                }
            }
        });
    });

    return errors;
}, [componentConfigs, serviceGroups]);

// Minimal effect for side effects only
useEffect(() => {
    setValidationErrors(validationErrors);
}, [validationErrors]);

// Or even better: lift validation state up and remove setValidationErrors entirely
```

---

### Phase 5: Consolidate Fragmented Effects (Priority: LOW)

#### 5.1 PrerequisitesStep Effect Consolidation

**Current:** 5 separate effects (92-305)
**After:** 4 clear, focused effects

| # | Purpose | Deps | Lines |
|---|---------|------|-------|
| 1 | Load prerequisites on mount | `[]` | 8 |
| 2 | Register message listeners | `[]` | 25 |
| 3 | Update canProceed | `[checks, setCanProceed]` | 8 |
| 4 | Auto-scroll on check progress | `[checks]` | 10 |

**Total:** 51 lines vs original 120+ lines

---

## Acceptance Criteria

### Phase 1: Stale Closure Fixes
- [ ] PrerequisitesStep listeners register only once
- [ ] WizardContainer feedback listener uses functional updates
- [ ] No memory leaks on unmount (verified with React DevTools)
- [ ] All existing tests pass

### Phase 2: Focus Management
- [ ] ComponentSelectionStep focus works reliably
- [ ] `useFocusOnMount` hook created with tests
- [ ] Focus logic reduced by 50%+ lines

### Phase 3: Complex Effect Extraction
- [ ] ConfigureScreen scroll logic extracted to hook
- [ ] ConfigureScreen reduced by 60+ lines
- [ ] New hook has 8+ unit tests

### Phase 4: Optimization
- [ ] Validation uses useMemo
- [ ] No RegExp recreation on every render
- [ ] Performance measurably improved

### Phase 5: Consolidation
- [ ] PrerequisitesStep effects consolidated
- [ ] Clear separation of concerns
- [ ] All tests pass

---

## Testing Strategy

### Effect Lifecycle Tests
```typescript
describe('effect lifecycle', () => {
    it('registers listeners on mount', () => {});
    it('does not re-register on prop changes', () => {});
    it('cleans up on unmount', () => {});
    it('handles rapid state updates without stale closure', () => {});
});
```

### Memory Leak Detection
```typescript
describe('memory management', () => {
    it('unsubscribes all listeners on unmount', () => {
        const unsubscribeMocks = [];
        mockOnMessage.mockImplementation(() => {
            const unsub = jest.fn();
            unsubscribeMocks.push(unsub);
            return unsub;
        });

        const { unmount } = render(<Component />);
        unmount();

        unsubscribeMocks.forEach(unsub => {
            expect(unsub).toHaveBeenCalled();
        });
    });
});
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking state updates | Write comprehensive tests first |
| Missing edge cases | Test rapid state changes |
| Performance regression | Profile before/after |
| Focus behavior changes | Manual QA on all wizard steps |

---

## File Changes Summary

### New Files
- `src/core/ui/hooks/useFocusOnMount.ts` (~40 lines)
- `src/features/dashboard/ui/hooks/useConfigNavigation.ts` (~80 lines)
- Corresponding test files (~200 lines)

### Modified Files
- `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx` (refactor effects)
- `src/features/project-creation/ui/wizard/WizardContainer.tsx` (fix stale closure)
- `src/features/components/ui/steps/ComponentSelectionStep.tsx` (simplify focus)
- `src/features/dashboard/ui/ConfigureScreen.tsx` (extract scroll, optimize validation)

### Lines Changed
- **Removed:** ~180 lines of complex effect code
- **Added:** ~320 lines (including tests)
- **Net:** +140 lines but much better organized and testable
