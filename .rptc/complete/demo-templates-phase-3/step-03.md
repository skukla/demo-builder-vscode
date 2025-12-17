# Step 3: Simplify ComponentSelectionStep

## Purpose

Remove the External Systems and App Builder placeholder sections from ComponentSelectionStep, leaving only Frontend and Backend selection. This reduces visual clutter and focuses users on the core component choices.

## Prerequisites

- [ ] Step 1 complete (template schema defines what defaults will be applied)
- [ ] Step 2 can run in parallel (no code dependency)

## Tests to Write First (RED Phase)

### Test File: `tests/features/components/ui/steps/ComponentSelectionStep.test.tsx`

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComponentSelectionStep } from '@/features/components/ui/steps/ComponentSelectionStep';
import { Provider, lightTheme } from '@adobe/react-spectrum';

const renderWithProvider = (component: React.ReactElement) => {
    return render(
        <Provider theme={lightTheme}>
            {component}
        </Provider>
    );
};

describe('ComponentSelectionStep - Simplified', () => {
    const defaultProps = {
        state: {
            projectName: 'my-demo',
            selectedComponents: {
                frontend: 'citisignal-nextjs',
                backend: 'adobe-commerce-paas',
                dependencies: new Set(['commerce-mesh']),
                services: new Set(['catalog-service', 'live-search'])
            }
        },
        updateState: jest.fn(),
        setCanProceed: jest.fn()
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Core Sections Present', () => {
        it('should render Frontend section', () => {
            renderWithProvider(<ComponentSelectionStep {...defaultProps} />);
            expect(screen.getByText('Frontend')).toBeInTheDocument();
        });

        it('should render Backend section', () => {
            renderWithProvider(<ComponentSelectionStep {...defaultProps} />);
            expect(screen.getByText('Backend')).toBeInTheDocument();
        });

        it('should render frontend picker', () => {
            renderWithProvider(<ComponentSelectionStep {...defaultProps} />);
            expect(screen.getByLabelText('Select frontend system')).toBeInTheDocument();
        });

        it('should render backend picker', () => {
            renderWithProvider(<ComponentSelectionStep {...defaultProps} />);
            expect(screen.getByLabelText('Select backend system')).toBeInTheDocument();
        });
    });

    describe('Removed Sections', () => {
        it('should NOT render External Systems section', () => {
            renderWithProvider(<ComponentSelectionStep {...defaultProps} />);
            expect(screen.queryByText('External Systems')).not.toBeInTheDocument();
        });

        it('should NOT render App Builder Apps section', () => {
            renderWithProvider(<ComponentSelectionStep {...defaultProps} />);
            expect(screen.queryByText('App Builder Apps')).not.toBeInTheDocument();
        });

        it('should NOT render Experience Platform checkbox', () => {
            renderWithProvider(<ComponentSelectionStep {...defaultProps} />);
            expect(screen.queryByText('Experience Platform')).not.toBeInTheDocument();
        });

        it('should NOT render Integration Service checkbox', () => {
            renderWithProvider(<ComponentSelectionStep {...defaultProps} />);
            expect(screen.queryByText('Kukla Integration Service')).not.toBeInTheDocument();
        });
    });

    describe('Frontend Dependencies (Still Present)', () => {
        it('should render API Mesh checkbox when frontend selected', () => {
            renderWithProvider(<ComponentSelectionStep {...defaultProps} />);
            expect(screen.getByText('API Mesh')).toBeInTheDocument();
        });

        it('should render Demo Inspector checkbox when frontend selected', () => {
            renderWithProvider(<ComponentSelectionStep {...defaultProps} />);
            expect(screen.getByText('Demo Inspector')).toBeInTheDocument();
        });
    });

    describe('Backend Services (Still Present)', () => {
        it('should render Catalog Service checkbox when backend selected', () => {
            renderWithProvider(<ComponentSelectionStep {...defaultProps} />);
            expect(screen.getByText('Catalog Service')).toBeInTheDocument();
        });

        it('should render Live Search checkbox when backend selected', () => {
            renderWithProvider(<ComponentSelectionStep {...defaultProps} />);
            expect(screen.getByText('Live Search')).toBeInTheDocument();
        });
    });

    describe('Layout Simplification', () => {
        it('should NOT render divider between sections', () => {
            const { container } = renderWithProvider(<ComponentSelectionStep {...defaultProps} />);
            // Divider was used to separate the two rows
            const dividers = container.querySelectorAll('[class*="Divider"]');
            expect(dividers.length).toBe(0);
        });
    });
});
```

**Test Scenarios:**
- [ ] Frontend section renders
- [ ] Backend section renders
- [ ] External Systems section removed
- [ ] App Builder Apps section removed
- [ ] Frontend dependencies (API Mesh, Demo Inspector) still visible
- [ ] Backend services (Catalog Service, Live Search) still visible
- [ ] Divider removed (single row layout)

## Files to Modify

### 1. `src/features/components/ui/steps/ComponentSelectionStep.tsx`

**Changes to Make:**

1. **Remove imports** for removed sections:
   - Remove `Divider` import if no longer needed
   - Remove `integrationsOptions` and `appBuilderOptions` references

2. **Remove state variables** related to removed sections:
   - Keep: `selectedIntegrations` in hook (for backward compat)
   - Keep: `selectedAppBuilder` in hook (for backward compat)
   - Remove: UI rendering of these sections

3. **Remove JSX sections:**

**Before (lines 213-262):**
```tsx
<Divider size="S" />

{/* External Systems and App Builder */}
<Flex gap="size-300" wrap marginTop="size-300">
    {/* External Systems */}
    <View flex="1" minWidth="300px">
        <Text UNSAFE_className={cn('text-xs', ...)}>
            External Systems
        </Text>
        <View UNSAFE_className="bordered-container">
            {integrationsOptions.map((system) => (
                <Checkbox ... />
            ))}
        </View>
    </View>

    {/* App Builder Apps */}
    <View flex="1" minWidth="300px">
        <Text UNSAFE_className={cn('text-xs', ...)}>
            App Builder Apps
        </Text>
        <View UNSAFE_className="bordered-container">
            {appBuilderOptions.map((app) => (
                <Checkbox ... />
            ))}
        </View>
    </View>
</Flex>
```

**After:**
```tsx
{/* External Systems and App Builder sections removed - Phase 4 will add data selection here */}
```

4. **Remove unused constants:**

```tsx
// REMOVE these (lines 65-71):
const DEFAULT_INTEGRATIONS: ComponentOption[] = [
    { id: 'experience-platform', name: 'Experience Platform', description: '...' },
];

const DEFAULT_APP_BUILDER: ComponentOption[] = [
    { id: 'integration-service', name: 'Integration Service', description: '...' },
];

// REMOVE these references (lines 109-110):
const integrationsOptions = dataTyped.integrations || DEFAULT_INTEGRATIONS;
const appBuilderOptions = dataTyped.appBuilder || DEFAULT_APP_BUILDER;
```

5. **Update useComponentSelection hook call** (keep existing, no changes needed - backward compatible)

### 2. `src/features/components/ui/hooks/useComponentSelection.ts`

**No changes required** - keep the hook as-is for backward compatibility. The integrations and appBuilder state will simply not be rendered, but the state management stays in place for future use.

## Implementation Details (GREEN Phase)

1. Remove External Systems JSX section
2. Remove App Builder Apps JSX section
3. Remove Divider component and import
4. Remove unused DEFAULT_INTEGRATIONS and DEFAULT_APP_BUILDER constants
5. Remove unused integrationsOptions and appBuilderOptions variables
6. Keep hook imports for backward compatibility
7. Run tests to verify

## Refactor Phase

- Verify layout looks balanced with only two columns
- Consider adjusting column widths now that there's only one row
- Clean up any orphaned CSS classes
- Ensure focus management still works correctly

## Expected Outcome

- [ ] Only Frontend and Backend sections visible
- [ ] External Systems and App Builder sections removed
- [ ] Divider removed (cleaner layout)
- [ ] Existing functionality preserved
- [ ] State management backward compatible
- [ ] Layout balanced and clean

## Acceptance Criteria

- [ ] All new tests passing
- [ ] All existing ComponentSelectionStep tests passing (that don't test removed sections)
- [ ] Frontend picker works correctly
- [ ] Backend picker works correctly
- [ ] Frontend dependencies (API Mesh, Demo Inspector) work correctly
- [ ] Backend services (Catalog Service, Live Search) work correctly
- [ ] No TypeScript errors
- [ ] No console warnings about removed components
