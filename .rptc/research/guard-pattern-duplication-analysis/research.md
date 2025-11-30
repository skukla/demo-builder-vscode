# Guard Pattern Duplication Analysis

**Research Date**: 2025-11-15
**Topic**: Is guard pattern duplication an architectural code smell or acceptable design?
**Scope**: Codebase analysis
**Depth**: Quick (5-10 min)

---

## Summary

The codebase has **2 documented instances** of a guard pattern to prevent React.StrictMode double-execution. This duplication **IS a legitimate code smell** that should be abstracted into a reusable hook, but is **acceptable for now** given the small number of instances. The pattern will become increasingly problematic as it spreads to additional components.

---

## Codebase Analysis

### Relevant Files

#### 1. WizardContainer.tsx - useRef Guard Pattern
**File**: `src/features/project-creation/ui/wizard/WizardContainer.tsx:209-222`

```typescript
// Track whether we've already requested components (prevent double-load in StrictMode)
const componentsRequestedRef = useRef(false);

// Listen for components data from extension
useEffect(() => {
    const unsubscribe = vscode.onMessage('componentsLoaded', (data: unknown) => {
        setComponentsData(data as import('@/types/components').ComponentRegistry);
    });

    // Request components when component mounts (guard prevents StrictMode double-load)
    if (!componentsRequestedRef.current) {
        componentsRequestedRef.current = true;
        vscode.postMessage('loadComponents');
    }

    return unsubscribe;
}, []);
```

**Pattern Type**: useRef guard (explicit state machine)
**Solves**: Preventing double `postMessage('loadComponents')` calls on mount

---

#### 2. useSelectionStep.ts - useState Guard Pattern
**File**: `src/features/authentication/ui/hooks/useSelectionStep.ts:165,210-215`

```typescript
// Line 165: Guard state variable
const [loadRequested, setLoadRequested] = useState(!!state[cacheKey]); // Prevent StrictMode double-load

// Lines 210-215: Usage in useEffect
useEffect(() => {
    if (autoLoad && !state[cacheKey] && !loadRequested) {
        setLoadRequested(true);
        load();
    }
}, [autoLoad, state, cacheKey, loadRequested, load]);
```

**Pattern Type**: useState guard (state-based)
**Solves**: Preventing double `load()` calls on mount when cache is empty

---

### Existing Patterns Found

Both implementations use the same fundamental pattern:
1. Create a guard variable (useRef or useState)
2. Check guard before executing async operation in useEffect
3. Set guard to prevent subsequent executions

**Common Problem**: React.StrictMode double-mounts components in development, causing side effects to execute twice

**Defensive Solutions**: Guard patterns prevent duplicate async operations (message posting, API calls)

---

### Reusable Components

**None currently** - Each guard is implemented locally within its component/hook.

---

## Comparison & Gap Analysis

### Implementation Variations

| Aspect | WizardContainer (useRef) | useSelectionStep (useState) |
|--------|--------------------------|----------------------------|
| **Guard Type** | useRef + mutation | useState with guard clause |
| **State Persistence** | Permanent flag (current) | Derived from cache state |
| **Dependency Risk** | Lower (no dependencies) | Higher (state, cacheKey, load in deps) |
| **Clarity** | Very explicit "requested" | Indirect (guard checks cacheKey) |
| **Flexibility** | Fixed timing (mount only) | Reactive (responds to state changes) |

**Key Difference**:
- **WizardContainer**: "Only request once per mount"
- **useSelectionStep**: "Only request once if cache empty and not yet requested"

The **useSelectionStep** version is more sophisticated (handles cache state), while **WizardContainer** is simpler (no conditions).

---

## Why This IS a Code Smell (But Understandable)

### Red Flags

1. **Defensive Pattern**: Both implementations are defensive against React.StrictMode's double-mount behavior
2. **Duplication**: Same problem solved twice in slightly different ways
3. **Mutation Semantics**: useRef version directly mutates state in effects (violates effect purity concepts)
4. **Spreading Predictably**: More instances will appear as more features need async initialization

### Why It Emerged

- React.StrictMode double-mounts are hard to debug in VSCode extensions
- There's no official React hook for this pattern (React team recommends avoiding it)
- Both solutions are pragmatic responses to a real problem

---

## Architectural Assessment

### Current State (2 instances)
- ✅ **Acceptable duplication** - Each component has unique context
- ✅ **No immediate refactoring needed** - Local solutions work fine

### At 3-4 instances (coming soon)
- ⚠️ **Code smell appears** - Pattern becomes obvious
- ⚠️ **Maintenance risk increases** - Changes to pattern require updates in multiple places
- 🔧 **Should refactor** - Create `useStrictModeSafeEffect` hook

### At 5+ instances
- 🔴 **Architectural issue** - Systematic duplication indicates missing abstraction
- 🔧 **Refactoring required** - Extract to shared hook immediately

---

## Refactoring Options

### Option 1: Document Pattern (Recommended Now)

**Pros**:
- Low effort (documentation only)
- Makes pattern discoverable for future developers
- Provides guidance without premature abstraction

**Cons**:
- Doesn't prevent continued duplication
- Each new instance requires manual implementation

**When to Use**: Current state (2 instances)

---

### Option 2: Create Reusable Hook (Recommended at 3+ instances)

**Proposed Implementation**:

```typescript
// hooks/useStrictModeSafeEffect.ts
export function useStrictModeSafeEffect(
  effect: EffectCallback,
  condition: boolean = true,
  deps?: DependencyList
): void {
  const executedRef = useRef(false);

  useEffect(() => {
    if (!executedRef.current && condition) {
      executedRef.current = true;
      return effect();
    }
  }, [condition, ...(deps || [])]);
}

// Usage in components:
useStrictModeSafeEffect(
  () => {
    vscode.postMessage('loadComponents');
  },
  true,  // condition to run
  []     // dependencies
);
```

**Pros**:
- Eliminates duplication
- Single source of truth for pattern
- Easier to maintain and test

**Cons**:
- Additional indirection (harder to debug)
- Parameterization complexity (condition vs dependencies)
- May not fit all use cases (WizardContainer vs useSelectionStep have different needs)

**When to Use**: When 3rd instance appears

---

### Option 3: Keep Local Duplication (Current State)

**Pros**:
- Simple and explicit
- No abstraction overhead
- Each implementation can be optimized for its context

**Cons**:
- Manual synchronization of pattern changes
- Risk of divergence over time
- Harder to discover pattern for new developers

**When to Use**: Small codebases (<3 instances)

---

## Decision Tree: When to Abstract

```
Current State: 2 instances
↓
Question 1: Are they solving IDENTICAL problems?
├─ No (different constraints) → Keep local ✅
└─ Yes → Question 2

Question 2: Will 3rd instance appear within 2 sprints?
├─ No → Keep local, revisit in 6 months ✅
└─ Yes → Create hook NOW (prevent accumulation)

Question 3: Is the pattern clear from docs?
├─ Yes → Acceptable as-is
└─ No → Document the pattern first ✅
```

---

## Common Pitfalls

1. **Premature Abstraction**: Creating a reusable hook too early can force awkward parameterization
2. **Over-Engineering**: The problem is React.StrictMode-specific (dev mode only), not a production concern
3. **Ignoring Context**: WizardContainer and useSelectionStep have different constraints - a single abstraction may not fit both
4. **Documentation Gap**: Without docs, developers will create their own variations, leading to more duplication

---

## Recommendations

### Immediate Actions (Now)

1. ✅ **Document the pattern** in `/docs/development/ui-patterns.md`:
   - Add section: "React.StrictMode Double-Execution Guards"
   - Document both patterns (useRef vs useState)
   - Explain when to use each approach
   - Reference this research

2. ✅ **Update comments** in both files to reference the documentation

3. ✅ **Monitor closely** - Track new instances in future PRs

### Future Actions (At 3rd Instance)

1. 🔧 **Create `useStrictModeSafeEffect` hook** if instances are similar enough
2. 🔧 **Refactor existing instances** to use the hook
3. 🔧 **Add tests** for the reusable hook
4. 📋 **Update documentation** to reference the hook

### Why Not Refactor Now

- Only 2 instances (duplication threshold is 3+)
- Each has slightly different constraints
- Clear comments make pattern maintainable
- Project is in active refactoring (feature-based architecture migration)
- Costs of abstraction outweigh benefits at this scale

---

## Documentation Template (Proposed)

Add to `/docs/development/ui-patterns.md`:

```markdown
## React.StrictMode Double-Execution Guards

### Problem
React.StrictMode double-mounts components in development, causing async operations to execute twice on mount. This is intentional (helps catch side effects), but requires defensive programming.

### Current Pattern (2 instances)

**Pattern 1: Simple useRef Guard** (WizardContainer.tsx:209)
- Use when: Single one-time operation on mount
- Guard prevents postMessage from firing twice
- Example: Loading component registry

**Pattern 2: useState + Cache Guard** (useSelectionStep.ts:165,210-215)
- Use when: Operation only needed if cache is empty
- Guard checks both cache state and request flag
- Example: Loading projects/workspaces

### When to Abstract
- Appears in 3+ components → Create `useStrictModeSafeEffect` hook
- Before then → Document pattern and reference it in comments

### Why Not Abstracted Yet
- Only 2 instances (duplication threshold is 3+)
- Each has slightly different constraints
- Clear comments make pattern maintainable

### References
- Research: `.rptc/research/guard-pattern-duplication-analysis/research.md`
- React Docs: [StrictMode](https://react.dev/reference/react/StrictMode)
```

---

## Key Takeaways

1. ✅ **Acceptable duplication for now** - 2 instances is below the threshold for abstraction
2. ⚠️ **Monitor closely** - Pattern will likely spread as more selection steps are added
3. 🔴 **Would be a code smell at 5+ instances** - Systematic duplication indicates missing abstraction
4. 📋 **Document the pattern immediately** - Prevent divergent implementations
5. ⏰ **Refactor at 3rd instance** - Create reusable hook before pattern becomes endemic
6. 🧪 **No action required now** - Current duplication is maintainable and well-commented

---

## Conclusion

The guard pattern duplication is **not currently a code smell**, but **will become one** if allowed to spread unchecked. The recommended approach is to:

1. Document the pattern now (low cost, high value)
2. Monitor for new instances in future PRs
3. Refactor into a reusable hook when the 3rd instance appears

This balances pragmatism (avoid premature abstraction) with maintainability (prevent endemic duplication).

---

**Research conducted by**: Claude Code (RPTC Research Agent)
**Methodology**: Codebase exploration with Haiku agent
**Files analyzed**: All React components and hooks in `src/` directory
