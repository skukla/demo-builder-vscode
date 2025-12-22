# Step 2: Welcome Step UI Redesign

## Status

- [ ] Tests Written (RED)
- [ ] Implementation Complete (GREEN)
- [ ] Refactored (REFACTOR)

---

## Purpose

Redesign the Welcome step to implement the two-choice template selection UX:
1. **Brand selection** - What vertical/content do you want? (CitiSignal, Default, BuildRight)
2. **Stack selection** - How should it be built? (Headless, Edge Delivery)

This replaces the current single template picker with an explicit two-dimensional selection.

---

## Prerequisites

- [ ] Step 1 complete (brands.json and stacks.json exist)
- [ ] Existing WelcomeStep.tsx understanding

---

## Current State Analysis

**Current WelcomeStep.tsx:**
- Single template selection via `TemplateGallery` component
- Template includes both brand AND stack (hardcoded combination)
- Selection stored in `wizardState.selectedTemplate`

**Target State:**
- Two-section UI: Brand cards + Stack cards
- Selections stored in `wizardState.selectedBrand` and `wizardState.selectedStack`
- Visual feedback showing selected combination

---

## Files to Create/Modify

### Modified Files

1. **`src/features/project-creation/ui/steps/WelcomeStep.tsx`** - Major redesign
2. **`src/types/webview.ts`** - Add `selectedBrand`, `selectedStack` to WizardState

### New Files

1. **`src/features/project-creation/ui/components/BrandSelector.tsx`** - Brand selection cards
2. **`src/features/project-creation/ui/components/StackSelector.tsx`** - Stack selection cards
3. **`tests/features/project-creation/ui/components/BrandSelector.test.tsx`**
4. **`tests/features/project-creation/ui/components/StackSelector.test.tsx`**

---

## UI Design

### Wireframe

```
┌─────────────────────────────────────────────────────────────────┐
│  Create a New Project                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Project Name: [________________________]                       │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  What do you want to demo?                                      │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Default   │  │ ● CitiSign. │  │  BuildRight │             │
│  │             │  │             │  │             │             │
│  │  [icon]     │  │  [icon]     │  │  [icon]     │             │
│  │             │  │             │  │             │             │
│  │  Generic    │  │  Telecom    │  │ Hardware    │             │
│  │  storefront │  │  demo       │  │ demo        │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  How should it be built?                                        │
│                                                                 │
│  ┌────────────────────────┐  ┌────────────────────────┐        │
│  │      ● Headless        │  │    Edge Delivery       │        │
│  │                        │  │                        │        │
│  │  NextJS + PaaS + Mesh  │  │  EDS + ACCS            │        │
│  │                        │  │                        │        │
│  │  • Server rendering    │  │  • Ultra-fast CDN      │        │
│  │  • API Mesh            │  │  • DA.live content     │        │
│  │  • Full customization  │  │  • Commerce Drop-ins   │        │
│  └────────────────────────┘  └────────────────────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Visual Design Notes

- Brand cards: Similar to current template cards (icon, name, short description)
- Stack cards: Larger, include feature bullets to explain differences
- Selected state: Blue border + checkmark (consistent with existing selection patterns)
- Both selections required before Continue is enabled

---

## Tests to Write First (TDD)

### BrandSelector Tests

**Test File:** `tests/features/project-creation/ui/components/BrandSelector.test.tsx`

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrandSelector } from '@/features/project-creation/ui/components/BrandSelector';
import type { Brand } from '@/types/brands';

const mockBrands: Brand[] = [
    {
        id: 'default',
        name: 'Default',
        description: 'Generic storefront',
        configDefaults: {},
        contentSources: {},
    },
    {
        id: 'citisignal',
        name: 'CitiSignal',
        description: 'Telecom demo',
        featured: true,
        configDefaults: { ADOBE_COMMERCE_STORE_CODE: 'citisignal_store' },
        contentSources: { eds: 'main--accs-citisignal--demo-system-stores.aem.live' },
    },
];

describe('BrandSelector', () => {
    it('should render all brands', () => {
        render(
            <BrandSelector
                brands={mockBrands}
                selectedBrand={undefined}
                onSelect={jest.fn()}
            />
        );

        expect(screen.getByText('Default')).toBeInTheDocument();
        expect(screen.getByText('CitiSignal')).toBeInTheDocument();
    });

    it('should show selected state for selected brand', () => {
        render(
            <BrandSelector
                brands={mockBrands}
                selectedBrand="citisignal"
                onSelect={jest.fn()}
            />
        );

        const citisignalCard = screen.getByText('CitiSignal').closest('[role="button"]');
        expect(citisignalCard).toHaveAttribute('aria-selected', 'true');
    });

    it('should call onSelect when brand is clicked', () => {
        const onSelect = jest.fn();
        render(
            <BrandSelector
                brands={mockBrands}
                selectedBrand={undefined}
                onSelect={onSelect}
            />
        );

        fireEvent.click(screen.getByText('CitiSignal'));
        expect(onSelect).toHaveBeenCalledWith('citisignal');
    });

    it('should show featured badge for featured brands', () => {
        render(
            <BrandSelector
                brands={mockBrands}
                selectedBrand={undefined}
                onSelect={jest.fn()}
            />
        );

        // CitiSignal is featured
        const citisignalCard = screen.getByText('CitiSignal').closest('[data-testid="brand-card"]');
        expect(citisignalCard).toHaveAttribute('data-featured', 'true');
    });

    it('should be keyboard accessible', () => {
        const onSelect = jest.fn();
        render(
            <BrandSelector
                brands={mockBrands}
                selectedBrand={undefined}
                onSelect={onSelect}
            />
        );

        const citisignalCard = screen.getByText('CitiSignal').closest('[role="button"]');
        fireEvent.keyDown(citisignalCard!, { key: 'Enter' });
        expect(onSelect).toHaveBeenCalledWith('citisignal');
    });
});
```

### StackSelector Tests

**Test File:** `tests/features/project-creation/ui/components/StackSelector.test.tsx`

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { StackSelector } from '@/features/project-creation/ui/components/StackSelector';
import type { Stack } from '@/types/stacks';

const mockStacks: Stack[] = [
    {
        id: 'headless',
        name: 'Headless',
        description: 'NextJS + PaaS + Mesh',
        frontend: 'citisignal-nextjs',
        backend: 'adobe-commerce-paas',
        dependencies: ['commerce-mesh'],
        features: ['Server rendering', 'API Mesh', 'Full customization'],
    },
    {
        id: 'edge-delivery',
        name: 'Edge Delivery',
        description: 'EDS + ACCS',
        frontend: 'eds-storefront',
        backend: 'adobe-commerce-accs',
        dependencies: [],
        features: ['Ultra-fast CDN', 'DA.live content', 'Commerce Drop-ins'],
        requiresGitHub: true,
        requiresDaLive: true,
    },
];

describe('StackSelector', () => {
    it('should render all stacks', () => {
        render(
            <StackSelector
                stacks={mockStacks}
                selectedStack={undefined}
                onSelect={jest.fn()}
            />
        );

        expect(screen.getByText('Headless')).toBeInTheDocument();
        expect(screen.getByText('Edge Delivery')).toBeInTheDocument();
    });

    it('should show feature bullets for each stack', () => {
        render(
            <StackSelector
                stacks={mockStacks}
                selectedStack={undefined}
                onSelect={jest.fn()}
            />
        );

        expect(screen.getByText('Server rendering')).toBeInTheDocument();
        expect(screen.getByText('Ultra-fast CDN')).toBeInTheDocument();
    });

    it('should show selected state for selected stack', () => {
        render(
            <StackSelector
                stacks={mockStacks}
                selectedStack="headless"
                onSelect={jest.fn()}
            />
        );

        const headlessCard = screen.getByText('Headless').closest('[role="button"]');
        expect(headlessCard).toHaveAttribute('aria-selected', 'true');
    });

    it('should call onSelect when stack is clicked', () => {
        const onSelect = jest.fn();
        render(
            <StackSelector
                stacks={mockStacks}
                selectedStack={undefined}
                onSelect={onSelect}
            />
        );

        fireEvent.click(screen.getByText('Edge Delivery'));
        expect(onSelect).toHaveBeenCalledWith('edge-delivery');
    });

    it('should indicate when stack requires additional setup', () => {
        render(
            <StackSelector
                stacks={mockStacks}
                selectedStack={undefined}
                onSelect={jest.fn()}
            />
        );

        // Edge Delivery requires GitHub + DA.live
        const edsCard = screen.getByText('Edge Delivery').closest('[data-testid="stack-card"]');
        expect(edsCard).toHaveAttribute('data-requires-setup', 'true');
    });
});
```

### WelcomeStep Integration Tests

**Test File:** `tests/features/project-creation/ui/steps/WelcomeStep.test.tsx` (update existing)

```typescript
// Add to existing tests:

describe('brand and stack selection', () => {
    it('should enable Continue only when both brand and stack selected', () => {
        // ... render WelcomeStep with brands and stacks
        // Initially Continue should be disabled
        // Select brand only - still disabled
        // Select stack - now enabled
    });

    it('should update wizardState with selected brand and stack', () => {
        // Verify state updates propagate correctly
    });

    it('should show appropriate defaults (featured brand, first stack)', () => {
        // Verify initial selection state
    });
});
```

---

## Implementation Details

### WizardState Updates (`src/types/webview.ts`)

```typescript
export interface WizardState {
    // ... existing fields

    // Deprecated - replaced by selectedBrand + selectedStack
    selectedTemplate?: string;

    // New fields
    selectedBrand?: string;    // Brand ID (e.g., 'citisignal')
    selectedStack?: string;    // Stack ID (e.g., 'edge-delivery')
}
```

### BrandSelector Component

```typescript
interface BrandSelectorProps {
    brands: Brand[];
    selectedBrand: string | undefined;
    onSelect: (brandId: string) => void;
}

export function BrandSelector({ brands, selectedBrand, onSelect }: BrandSelectorProps) {
    return (
        <div className="brand-selector">
            <h3 className="section-header">What do you want to demo?</h3>
            <div className="brand-cards">
                {brands.map(brand => (
                    <BrandCard
                        key={brand.id}
                        brand={brand}
                        isSelected={brand.id === selectedBrand}
                        onSelect={() => onSelect(brand.id)}
                    />
                ))}
            </div>
        </div>
    );
}
```

### StackSelector Component

```typescript
interface StackSelectorProps {
    stacks: Stack[];
    selectedStack: string | undefined;
    onSelect: (stackId: string) => void;
}

export function StackSelector({ stacks, selectedStack, onSelect }: StackSelectorProps) {
    return (
        <div className="stack-selector">
            <h3 className="section-header">How should it be built?</h3>
            <div className="stack-cards">
                {stacks.map(stack => (
                    <StackCard
                        key={stack.id}
                        stack={stack}
                        isSelected={stack.id === selectedStack}
                        onSelect={() => onSelect(stack.id)}
                    />
                ))}
            </div>
        </div>
    );
}
```

---

## CSS Styling

Use existing utility classes and design tokens:

```css
/* Brand cards - similar to template cards */
.brand-card {
    /* Reuse existing card patterns */
}

/* Stack cards - larger with feature list */
.stack-card {
    min-width: 280px;
    padding: var(--spectrum-global-dimension-size-200);
}

.stack-card .features {
    list-style: none;
    padding: 0;
    margin-top: var(--spectrum-global-dimension-size-100);
}

.stack-card .features li::before {
    content: "•";
    margin-right: var(--spectrum-global-dimension-size-50);
}
```

---

## Acceptance Criteria

- [ ] Brand cards render for all brands in brands.json
- [ ] Stack cards render for all stacks in stacks.json
- [ ] Selection state visually indicated (border + checkmark)
- [ ] Continue button disabled until both selections made
- [ ] Selections stored in wizardState.selectedBrand and selectedStack
- [ ] Keyboard navigation works (Tab, Enter, Space)
- [ ] Featured brands visually distinguished
- [ ] Stacks show feature bullets
- [ ] All tests passing

---

## Dependencies

- **Step 1:** brands.json and stacks.json must exist
- **Depends on:** Existing Spectrum components, CSS utilities

---

## Estimated Complexity

**Medium** - New UI components with state management

**Estimated Time:** 4-6 hours
