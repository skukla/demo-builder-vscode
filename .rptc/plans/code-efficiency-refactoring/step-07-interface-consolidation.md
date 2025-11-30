# Step 7: Interface Consolidation - Detailed Implementation Plan

## Overview

Consolidate duplicate TypeScript interfaces, establish single sources of truth, and improve type safety across the React UI layer.

**Estimated Effort:** 4-6 hours
**Risk Level:** Low (type-only changes, no runtime impact)
**Dependencies:** None (can proceed independently)

---

## Current State Analysis

### Type System Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Total Interfaces/Types | 120+ | 85-90 |
| Duplicate Interfaces | 15-20 | 0-3 |
| Duplication Rate | 18-25% | <5% |
| Type Files | Scattered | Centralized |

### High-Priority Duplications

| Duplication | Locations | Similarity |
|-------------|-----------|------------|
| Step Props Pattern | 5+ step components | 95% |
| ComponentSelection | webview.ts, components.ts | 100% |
| EnvVarDefinition | webview.ts (as ComponentEnvVar), components.ts | 95% |
| CacheEntry<T> | auth/services/types.ts, core/cache | 100% |
| Message<T> | messages.ts, WebviewClient.ts | 95% |
| Option models | FormField, ComponentSelection, etc. | 80% |

---

## Implementation Plan

### Phase 1: Create Base Step Props (Priority: CRITICAL)

**Problem:** Every wizard step defines nearly identical props:

```typescript
// Current: Repeated 5+ times
interface AdobeAuthStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
    completedSteps?: WizardStep[];
}

interface AdobeProjectStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
    completedSteps?: WizardStep[];
}
// ... repeated for ComponentSelectionStepProps, ApiMeshStepProps, etc.
```

**Solution:**

#### 1.1 Create Base Interface

**File:** `src/types/wizard.ts` (new file)

```typescript
import { WizardState, WizardStep } from './webview';

/**
 * Base props shared by all wizard step components.
 *
 * @example
 * interface MyStepProps extends BaseStepProps {
 *     // Add step-specific props here
 *     additionalData?: SomeType;
 * }
 */
export interface BaseStepProps {
    /** Current wizard state */
    state: WizardState;
    /** Function to update wizard state */
    updateState: (updates: Partial<WizardState>) => void;
    /** Function to control Next button enablement */
    setCanProceed: (canProceed: boolean) => void;
    /** List of completed steps (for navigation restrictions) */
    completedSteps?: WizardStep[];
}

/**
 * Props for steps that receive external data.
 * Used by ComponentSelectionStep, ApiMeshStep, etc.
 */
export interface DataStepProps<T = unknown> extends BaseStepProps {
    /** Data passed from parent (e.g., componentsData, meshConfig) */
    data?: T;
}
```

#### 1.2 Update Step Components

**File:** `src/features/authentication/ui/steps/AdobeAuthStep.tsx`

```typescript
// Before
interface AdobeAuthStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
}

// After
import { BaseStepProps } from '@/types/wizard';

type AdobeAuthStepProps = BaseStepProps;
// OR for steps with additional props:
interface AdobeAuthStepProps extends BaseStepProps {
    // Step-specific props only
}
```

**Files to Update:**
- `src/features/authentication/ui/steps/AdobeAuthStep.tsx`
- `src/features/authentication/ui/steps/AdobeProjectStep.tsx`
- `src/features/authentication/ui/steps/AdobeWorkspaceStep.tsx`
- `src/features/components/ui/steps/ComponentSelectionStep.tsx`
- `src/features/components/ui/steps/ComponentConfigStep.tsx`
- `src/features/mesh/ui/steps/ApiMeshStep.tsx`
- `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx`
- `src/features/project-creation/ui/steps/WelcomeStep.tsx`
- `src/features/project-creation/ui/steps/ReviewStep.tsx`

**Lines Removed:** ~45 lines of duplicate interface definitions

---

### Phase 2: Consolidate Component Types (Priority: HIGH)

**Problem:** Identical types defined in multiple files:

```typescript
// src/types/webview.ts
export interface ComponentSelection { ... }
export type ComponentConfigs = Record<string, ComponentConfig>;

// src/types/components.ts (DUPLICATE!)
export interface ComponentSelection { ... }
export type ComponentConfigs = Record<string, ComponentConfig>;
```

**Solution:**

#### 2.1 Establish Single Source of Truth

**File:** `src/types/components.ts` (keep as primary)

```typescript
/**
 * User's component selections during wizard.
 * Primary definition - exported to webview.ts for convenience.
 */
export interface ComponentSelection {
    frontend: string | null;
    backend: string | null;
    dependencies: string[];
    services: string[];
    integrations: string[];
    appBuilder: string[];
}

/**
 * Configuration values for a single component.
 * Keys are env var names, values are user-provided settings.
 */
export type ComponentConfig = Record<string, string | boolean | number | undefined>;

/**
 * Map of component IDs to their configurations.
 */
export type ComponentConfigs = Record<string, ComponentConfig>;
```

**File:** `src/types/webview.ts` (re-export)

```typescript
// Re-export from components.ts for convenience
export type {
    ComponentSelection,
    ComponentConfig,
    ComponentConfigs,
} from './components';

// Keep webview-specific types here
export interface WizardState {
    // ...
    componentSelection: ComponentSelection;
    componentConfigs: ComponentConfigs;
}
```

#### 2.2 Consolidate EnvVar Types

**Current Duplication:**
```typescript
// src/types/components.ts
export interface EnvVarDefinition {
    key: string;
    label: string;
    type: 'text' | 'password' | 'url' | 'select' | 'boolean' | 'number';
    required?: boolean;
    // ... more fields
}

// src/types/webview.ts
export interface ComponentEnvVar {
    key: string;
    label: string;
    type: 'text' | 'password' | 'url' | 'select' | 'boolean';
    // ... similar fields
}
```

**Solution:**

```typescript
// src/types/components.ts - SINGLE definition
export interface EnvVarDefinition {
    key: string;
    label: string;
    type: 'text' | 'password' | 'url' | 'select' | 'boolean' | 'number';
    required?: boolean;
    default?: string | boolean | number;
    placeholder?: string;
    description?: string;
    helpText?: string;
    group?: string;
    providedBy?: string;
    usedBy?: string[];
    options?: { value: string; label: string }[];
    validation?: {
        pattern?: string;
        message?: string;
    };
}

// src/types/webview.ts - re-export with alias for backward compatibility
export { EnvVarDefinition as ComponentEnvVar } from './components';
// OR update all usages to use EnvVarDefinition directly
```

---

### Phase 3: Create Unified Option Models (Priority: MEDIUM)

**Problem:** Multiple similar option interfaces:

```typescript
// src/core/ui/components/forms/FormField.tsx
export interface FormFieldOption {
    value: string;
    label: string;
}

// src/features/components/ui/steps/ComponentSelectionStep.tsx
interface ComponentOption {
    id: string;
    name: string;
    description: string;
}

interface DependencyOption {
    id: string;
    name: string;
    required: boolean;
}
```

**Solution:**

#### 3.1 Create Option Type Hierarchy

**File:** `src/types/ui.ts` (new file)

```typescript
/**
 * Base option for select/picker components.
 */
export interface Option {
    value: string;
    label: string;
}

/**
 * Option with additional description text.
 */
export interface DescribedOption extends Option {
    description?: string;
}

/**
 * Option that can be marked as required/locked.
 */
export interface RequirableOption extends Option {
    required?: boolean;
    disabled?: boolean;
}

/**
 * Component selection option with full metadata.
 */
export interface ComponentOption {
    id: string;
    name: string;
    description: string;
}

/**
 * Dependency option that may be required.
 */
export interface DependencyOption {
    id: string;
    name: string;
    required: boolean;
}

/**
 * Convert ComponentOption to standard Option for Picker components.
 */
export function toOption(component: ComponentOption): Option {
    return {
        value: component.id,
        label: component.name,
    };
}
```

#### 3.2 Update Usages

```typescript
// FormField.tsx
import { Option } from '@/types/ui';

interface FormFieldProps {
    // ...
    options?: Option[];
}

// ComponentSelectionStep.tsx
import { ComponentOption, DependencyOption } from '@/types/ui';
// Remove local interface definitions
```

---

### Phase 4: Consolidate Cache Types (Priority: MEDIUM)

**Problem:**
```typescript
// src/features/authentication/services/types.ts
export interface CacheEntry<T> {
    data: T;
    expiry: number;
}

// src/core/cache/AbstractCacheManager.ts
interface CacheEntry<V> {
    value: V;
    expiresAt: number;
    createdAt: number;
}
```

**Solution:**

#### 4.1 Create Unified Cache Types

**File:** `src/core/cache/types.ts` (new file)

```typescript
/**
 * Standard cache entry with value and expiration.
 */
export interface CacheEntry<T = unknown> {
    /** The cached value */
    value: T;
    /** Expiration timestamp (ms since epoch) */
    expiresAt: number;
    /** Creation timestamp (ms since epoch) */
    createdAt: number;
}

/**
 * Simplified cache entry for external APIs.
 * Used when only data and expiry needed.
 */
export interface SimpleCacheEntry<T = unknown> {
    data: T;
    expiry: number;
}

/**
 * Convert between cache entry formats.
 */
export function toSimpleCacheEntry<T>(entry: CacheEntry<T>): SimpleCacheEntry<T> {
    return {
        data: entry.value,
        expiry: entry.expiresAt,
    };
}
```

#### 4.2 Update Usages

```typescript
// src/features/authentication/services/types.ts
export { SimpleCacheEntry as CacheEntry } from '@/core/cache/types';
// OR update auth service to use CacheEntry directly
```

---

### Phase 5: Consolidate Message Types (Priority: LOW)

**Problem:**
```typescript
// src/types/messages.ts
export interface Message<T = unknown> {
    type: MessageType;
    payload?: T;
    requestId?: string;
}

// src/core/ui/utils/WebviewClient.ts
interface Message<T = unknown> {
    type: string;
    payload?: T;
    requestId?: string;
}
```

**Solution:**

```typescript
// src/types/messages.ts - SINGLE definition
export interface Message<T = unknown> {
    type: MessageType;
    payload?: T;
    requestId?: string;
}

// WebviewClient.ts - import from messages.ts
import type { Message } from '@/types/messages';
```

---

### Phase 6: Standardize Hook Interface Naming (Priority: LOW)

**Problem:** Inconsistent naming patterns:
- `UseSelectionStepOptions` / `UseSelectionStepResult`
- `UseAsyncDataOptions` / `UseAsyncDataReturn`
- `UseMeshOperationsProps` / `UseMeshOperationsReturn`

**Solution:** Standardize on `Options` / `Return` pattern:

```typescript
// Convention (document in CLAUDE.md)
// Hook input: Use[HookName]Options
// Hook output: Use[HookName]Return
// Component props: [ComponentName]Props

// Update all hooks to follow pattern:
export interface UseMeshOperationsOptions { ... } // was Props
export interface UseMeshOperationsReturn { ... }
```

---

## Implementation Checklist

### Phase 1: BaseStepProps
- [ ] Create `src/types/wizard.ts`
- [ ] Define `BaseStepProps` interface
- [ ] Update 9 step components to use it
- [ ] Update corresponding test files
- [ ] Verify all tests pass

### Phase 2: Component Types
- [ ] Remove duplicates from `webview.ts`
- [ ] Add re-exports from `components.ts`
- [ ] Consolidate `EnvVarDefinition` / `ComponentEnvVar`
- [ ] Update imports across codebase
- [ ] Verify all tests pass

### Phase 3: Option Models
- [ ] Create `src/types/ui.ts`
- [ ] Define option type hierarchy
- [ ] Update FormField to use `Option`
- [ ] Update ComponentSelectionStep to use types
- [ ] Verify all tests pass

### Phase 4: Cache Types
- [ ] Create `src/core/cache/types.ts`
- [ ] Define unified cache entry types
- [ ] Update auth service imports
- [ ] Update AbstractCacheManager imports
- [ ] Verify all tests pass

### Phase 5: Message Types
- [ ] Remove duplicate from WebviewClient
- [ ] Import from `@/types/messages`
- [ ] Verify type compatibility
- [ ] Verify all tests pass

### Phase 6: Hook Naming
- [ ] Rename `UseMeshOperationsProps` → `UseMeshOperationsOptions`
- [ ] Update all hook interface naming
- [ ] Document convention in CLAUDE.md
- [ ] Verify all tests pass

---

## Acceptance Criteria

- [ ] No duplicate interface definitions (0 exact duplicates)
- [ ] All step components use `BaseStepProps`
- [ ] Component types have single source of truth
- [ ] Option models follow hierarchy
- [ ] Cache types consolidated
- [ ] All 400+ tests pass
- [ ] TypeScript strict mode passes
- [ ] No new `any` types introduced

---

## File Changes Summary

### New Files
- `src/types/wizard.ts` (~30 lines)
- `src/types/ui.ts` (~60 lines)
- `src/core/cache/types.ts` (~40 lines)

### Modified Files
- `src/types/webview.ts` (remove duplicates, add re-exports)
- `src/types/components.ts` (add documentation)
- `src/types/messages.ts` (minor cleanup)
- `src/core/ui/utils/WebviewClient.ts` (import types)
- 9 step component files (use BaseStepProps)
- ~10 test files (update type imports)

### Lines Changed
- **Removed:** ~120 lines of duplicate definitions
- **Added:** ~130 lines (new files)
- **Net:** ~10 lines increase, but much cleaner organization

---

## Migration Guide

### For Step Components

```typescript
// Before
interface MyStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
    completedSteps?: WizardStep[];
    mySpecificProp: string;
}

// After
import { BaseStepProps } from '@/types/wizard';

interface MyStepProps extends BaseStepProps {
    mySpecificProp: string;
}
```

### For Option Types

```typescript
// Before
const options = [{ value: 'a', label: 'A' }];

// After
import { Option } from '@/types/ui';
const options: Option[] = [{ value: 'a', label: 'A' }];
```

### For Component Selection

```typescript
// Before (either import worked, confusing)
import { ComponentSelection } from '@/types/webview';
import { ComponentSelection } from '@/types/components';

// After (clear source, webview re-exports)
import { ComponentSelection } from '@/types/components'; // Primary
// OR
import { ComponentSelection } from '@/types/webview'; // Re-export (works)
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Import path breaks | Use find-and-replace, verify with tsc |
| Type incompatibility | Run full type check before commit |
| Test failures | Run full test suite after each phase |
| IDE confusion | Clear TypeScript cache, restart language server |

---

## Verification Commands

```bash
# Verify no TypeScript errors
npx tsc --noEmit

# Verify all tests pass
npm run test:fast

# Find remaining duplicates
grep -r "interface.*StepProps" src/features/*/ui/steps/

# Verify imports updated
grep -r "ComponentSelection" src/ --include="*.ts" --include="*.tsx" | grep "from"
```
