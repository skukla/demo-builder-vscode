# Step 3: Component Selection Wiring

## Status

- [ ] Tests Written (RED)
- [ ] Implementation Complete (GREEN)
- [ ] Refactored (REFACTOR)

---

## Purpose

Wire the brand + stack selections from the Welcome step to the rest of the wizard:

1. **Derive component selection** from stack (frontend, backend, dependencies)
2. **Apply config defaults** from brand (store codes, etc.)
3. **Enable/disable wizard steps** based on stack requirements (EDS needs GitHub/DA.live steps)
4. **Pass content source** to EDS services based on brand

---

## Prerequisites

- [ ] Step 1 complete (brands.json, stacks.json)
- [ ] Step 2 complete (BrandSelector, StackSelector in WelcomeStep)

---

## Files to Modify

1. **`src/features/project-creation/ui/wizard/hooks/useWizardNavigation.ts`** - Derive components from stack
2. **`src/features/project-creation/ui/helpers/templateDefaults.ts`** - Adapt to use brands/stacks
3. **`templates/wizard-steps.json`** - Add conditional step visibility
4. **`src/features/project-creation/ui/wizard/WizardContainer.tsx`** - Step filtering logic

---

## Key Integration Points

### 1. Deriving Components from Stack

When user selects a stack, automatically populate `wizardState.components`:

```typescript
// In useWizardNavigation.ts or new helper

import type { Stack } from '@/types/stacks';
import type { ComponentSelection } from '@/types/webview';

export function deriveComponentsFromStack(stack: Stack): ComponentSelection {
    return {
        frontend: stack.frontend,
        backend: stack.backend,
        dependencies: stack.dependencies,
        integrations: [],
        appBuilderApps: [],
    };
}
```

### 2. Applying Brand Config Defaults

When user selects a brand, merge config defaults:

```typescript
// Update templateDefaults.ts or create brandDefaults.ts

import type { Brand } from '@/types/brands';
import type { WizardState } from '@/types/webview';

export function applyBrandDefaults(
    state: WizardState,
    brand: Brand,
): WizardState {
    // Store config defaults under the frontend component ID
    const frontendId = state.components?.frontend;
    if (!frontendId || !brand.configDefaults) {
        return state;
    }

    return {
        ...state,
        componentConfigs: {
            ...state.componentConfigs,
            [frontendId]: {
                ...state.componentConfigs?.[frontendId],
                ...brand.configDefaults,
            },
        },
    };
}
```

### 3. Conditional Wizard Steps

Steps that only appear for certain stacks:

| Step | Headless | Edge Delivery |
|------|----------|---------------|
| Prerequisites | Yes | Yes |
| Adobe Auth | Yes | Yes |
| Component Selection | Skip (derived) | Skip (derived) |
| Settings Collection | Yes | Yes |
| GitHub Setup | No | Yes |
| DA.live Setup | No | Yes |
| Review | Yes | Yes |
| Project Creation | Yes | Yes |

**wizard-steps.json update:**

```json
{
    "id": "github-setup",
    "name": "GitHub Setup",
    "condition": {
        "stackRequires": "requiresGitHub"
    }
},
{
    "id": "dalive-setup",
    "name": "DA.live Setup",
    "condition": {
        "stackRequires": "requiresDaLive"
    }
}
```

### 4. Content Source for EDS

Pass brand's content source to EDS services:

```typescript
// When EDS stack is selected
const contentSource = brand.contentSources.eds;
// e.g., "main--accs-citisignal--demo-system-stores.aem.live"

// Used by DA.live service to copy content
await daLiveService.copyContent(contentSource, destinationSite);
```

---

## Tests to Write First (TDD)

### Component Derivation Tests

**Test File:** `tests/features/project-creation/ui/helpers/stackHelpers.test.ts`

```typescript
import { deriveComponentsFromStack } from '@/features/project-creation/ui/helpers/stackHelpers';
import type { Stack } from '@/types/stacks';

describe('deriveComponentsFromStack', () => {
    it('should derive components from headless stack', () => {
        const headlessStack: Stack = {
            id: 'headless',
            name: 'Headless',
            description: 'NextJS + PaaS',
            frontend: 'citisignal-nextjs',
            backend: 'adobe-commerce-paas',
            dependencies: ['commerce-mesh', 'demo-inspector'],
        };

        const result = deriveComponentsFromStack(headlessStack);

        expect(result.frontend).toBe('citisignal-nextjs');
        expect(result.backend).toBe('adobe-commerce-paas');
        expect(result.dependencies).toContain('commerce-mesh');
    });

    it('should derive components from edge-delivery stack', () => {
        const edsStack: Stack = {
            id: 'edge-delivery',
            name: 'Edge Delivery',
            description: 'EDS + ACCS',
            frontend: 'eds-storefront',
            backend: 'adobe-commerce-accs',
            dependencies: ['demo-inspector'],
            requiresGitHub: true,
            requiresDaLive: true,
        };

        const result = deriveComponentsFromStack(edsStack);

        expect(result.frontend).toBe('eds-storefront');
        expect(result.backend).toBe('adobe-commerce-accs');
        expect(result.dependencies).not.toContain('commerce-mesh');
    });
});
```

### Brand Defaults Tests

**Test File:** `tests/features/project-creation/ui/helpers/brandDefaults.test.ts`

```typescript
import { applyBrandDefaults } from '@/features/project-creation/ui/helpers/brandDefaults';
import type { Brand } from '@/types/brands';
import type { WizardState } from '@/types/webview';

describe('applyBrandDefaults', () => {
    const citisignalBrand: Brand = {
        id: 'citisignal',
        name: 'CitiSignal',
        description: 'Telecom demo',
        configDefaults: {
            ADOBE_COMMERCE_WEBSITE_CODE: 'citisignal',
            ADOBE_COMMERCE_STORE_CODE: 'citisignal_store',
            ADOBE_COMMERCE_STORE_VIEW_CODE: 'citisignal_us',
        },
        contentSources: { eds: 'main--accs-citisignal--demo-system-stores.aem.live' },
    };

    it('should apply brand configDefaults to componentConfigs', () => {
        const state: WizardState = {
            currentStep: 'welcome',
            projectName: 'test',
            components: { frontend: 'eds-storefront' },
            adobeAuth: { isAuthenticated: false, isChecking: false },
        };

        const result = applyBrandDefaults(state, citisignalBrand);

        expect(result.componentConfigs?.['eds-storefront']).toEqual({
            ADOBE_COMMERCE_WEBSITE_CODE: 'citisignal',
            ADOBE_COMMERCE_STORE_CODE: 'citisignal_store',
            ADOBE_COMMERCE_STORE_VIEW_CODE: 'citisignal_us',
        });
    });

    it('should merge with existing componentConfigs', () => {
        const state: WizardState = {
            currentStep: 'welcome',
            projectName: 'test',
            components: { frontend: 'eds-storefront' },
            componentConfigs: {
                'eds-storefront': { EXISTING_KEY: 'existing-value' },
            },
            adobeAuth: { isAuthenticated: false, isChecking: false },
        };

        const result = applyBrandDefaults(state, citisignalBrand);

        expect(result.componentConfigs?.['eds-storefront']).toEqual({
            EXISTING_KEY: 'existing-value',
            ADOBE_COMMERCE_WEBSITE_CODE: 'citisignal',
            ADOBE_COMMERCE_STORE_CODE: 'citisignal_store',
            ADOBE_COMMERCE_STORE_VIEW_CODE: 'citisignal_us',
        });
    });

    it('should return unchanged state if no frontend selected', () => {
        const state: WizardState = {
            currentStep: 'welcome',
            projectName: 'test',
            adobeAuth: { isAuthenticated: false, isChecking: false },
        };

        const result = applyBrandDefaults(state, citisignalBrand);

        expect(result).toEqual(state);
    });
});
```

### Step Filtering Tests

**Test File:** `tests/features/project-creation/ui/wizard/stepFiltering.test.ts`

```typescript
import { filterStepsForStack } from '@/features/project-creation/ui/wizard/stepFiltering';
import type { Stack } from '@/types/stacks';

describe('filterStepsForStack', () => {
    const allSteps = [
        { id: 'welcome', name: 'Welcome' },
        { id: 'prerequisites', name: 'Prerequisites' },
        { id: 'adobe-auth', name: 'Adobe Auth' },
        { id: 'github-setup', name: 'GitHub Setup', condition: { stackRequires: 'requiresGitHub' } },
        { id: 'dalive-setup', name: 'DA.live Setup', condition: { stackRequires: 'requiresDaLive' } },
        { id: 'review', name: 'Review' },
    ];

    it('should exclude GitHub/DA.live steps for headless stack', () => {
        const headlessStack: Stack = {
            id: 'headless',
            name: 'Headless',
            description: '',
            frontend: 'citisignal-nextjs',
            backend: 'adobe-commerce-paas',
            dependencies: [],
        };

        const result = filterStepsForStack(allSteps, headlessStack);

        expect(result.map(s => s.id)).not.toContain('github-setup');
        expect(result.map(s => s.id)).not.toContain('dalive-setup');
    });

    it('should include GitHub/DA.live steps for edge-delivery stack', () => {
        const edsStack: Stack = {
            id: 'edge-delivery',
            name: 'Edge Delivery',
            description: '',
            frontend: 'eds-storefront',
            backend: 'adobe-commerce-accs',
            dependencies: [],
            requiresGitHub: true,
            requiresDaLive: true,
        };

        const result = filterStepsForStack(allSteps, edsStack);

        expect(result.map(s => s.id)).toContain('github-setup');
        expect(result.map(s => s.id)).toContain('dalive-setup');
    });
});
```

---

## Implementation Details

### New Helper: `stackHelpers.ts`

```typescript
// src/features/project-creation/ui/helpers/stackHelpers.ts

import type { Stack } from '@/types/stacks';
import type { ComponentSelection } from '@/types/webview';

export function deriveComponentsFromStack(stack: Stack): ComponentSelection {
    return {
        frontend: stack.frontend,
        backend: stack.backend,
        dependencies: stack.dependencies,
        integrations: [],
        appBuilderApps: [],
    };
}

export function getContentSourceForBrand(brand: Brand, stackId: string): string | undefined {
    if (stackId === 'edge-delivery') {
        return brand.contentSources?.eds;
    }
    return undefined;
}
```

### New Helper: `brandDefaults.ts`

```typescript
// src/features/project-creation/ui/helpers/brandDefaults.ts

import type { Brand } from '@/types/brands';
import type { WizardState } from '@/types/webview';

export function applyBrandDefaults(
    state: WizardState,
    brand: Brand,
): WizardState {
    const frontendId = state.components?.frontend;

    if (!frontendId) {
        return state;
    }

    const configDefaults = brand.configDefaults || {};
    if (Object.keys(configDefaults).length === 0) {
        return state;
    }

    console.debug(`[Brand] Applied ${Object.keys(configDefaults).length} config defaults from "${brand.id}"`);

    return {
        ...state,
        componentConfigs: {
            ...state.componentConfigs,
            [frontendId]: {
                ...state.componentConfigs?.[frontendId],
                ...configDefaults,
            },
        },
    };
}
```

### Step Filtering: `stepFiltering.ts`

```typescript
// src/features/project-creation/ui/wizard/stepFiltering.ts

import type { Stack } from '@/types/stacks';
import type { WizardStep } from '@/types/wizard';

interface StepCondition {
    stackRequires?: keyof Stack;
}

interface ConditionalStep extends WizardStep {
    condition?: StepCondition;
}

export function filterStepsForStack(
    steps: ConditionalStep[],
    stack: Stack | undefined,
): WizardStep[] {
    if (!stack) {
        // No stack selected - return only unconditional steps
        return steps.filter(step => !step.condition);
    }

    return steps.filter(step => {
        if (!step.condition) {
            return true; // Unconditional step
        }

        const { stackRequires } = step.condition;
        if (stackRequires) {
            return Boolean(stack[stackRequires]);
        }

        return true;
    });
}
```

---

## Integration Flow

```
User selects Brand (CitiSignal)
        ↓
User selects Stack (Edge Delivery)
        ↓
WelcomeStep dispatches both selections
        ↓
useWizardNavigation receives selections
        ↓
├── deriveComponentsFromStack(stack) → wizardState.components
├── applyBrandDefaults(state, brand) → wizardState.componentConfigs
└── filterStepsForStack(steps, stack) → visible wizard steps
        ↓
Component Selection step SKIPPED (auto-derived)
        ↓
Settings Collection shows pre-filled store codes
        ↓
GitHub Setup step appears (stack requires it)
        ↓
DA.live Setup step appears (stack requires it)
        ↓
Project Creation receives brand.contentSources.eds
```

---

## Acceptance Criteria

- [ ] Selecting stack auto-populates `wizardState.components`
- [ ] Selecting brand auto-populates `wizardState.componentConfigs` with store codes
- [ ] Component Selection step is skipped when components derived from stack
- [ ] GitHub Setup step only appears for EDS stack
- [ ] DA.live Setup step only appears for EDS stack
- [ ] Content source from brand available to EDS services
- [ ] All tests passing

---

## Dependencies

- **Step 1:** brands.json, stacks.json
- **Step 2:** Brand and Stack selectors in WelcomeStep

---

## Estimated Complexity

**Medium** - State management and conditional logic

**Estimated Time:** 4-6 hours
