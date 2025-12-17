# Step 2: Enhance WelcomeStep with Template Card Selection

## Purpose

Add a template card grid to the WelcomeStep, allowing users to select a demo template before proceeding. The selected template will pre-populate component selections in the next step.

## Prerequisites

- [ ] Step 1 complete (demo-templates.json and types available)

## Tests to Write First (RED Phase)

### Test File: `tests/features/project-creation/ui/steps/WelcomeStep.test.tsx`

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { WelcomeStep } from '@/features/project-creation/ui/steps/WelcomeStep';
import { Provider, lightTheme } from '@adobe/react-spectrum';

const mockTemplates = [
    {
        id: 'citisignal-financial',
        name: 'CitiSignal Financial',
        description: 'Financial services demo',
        defaults: { backend: 'adobe-commerce-paas', frontend: 'citisignal-nextjs' }
    },
    {
        id: 'retail-demo',
        name: 'Retail Demo',
        description: 'Retail storefront demo',
        defaults: { backend: 'adobe-commerce-paas', frontend: 'citisignal-nextjs' }
    }
];

const renderWithProvider = (component: React.ReactElement) => {
    return render(
        <Provider theme={lightTheme}>
            {component}
        </Provider>
    );
};

describe('WelcomeStep - Template Selection', () => {
    const defaultProps = {
        state: { projectName: '', selectedTemplate: undefined },
        updateState: jest.fn(),
        setCanProceed: jest.fn(),
        templates: mockTemplates
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Template Card Grid', () => {
        it('should render template cards when templates are provided', () => {
            renderWithProvider(<WelcomeStep {...defaultProps} />);

            expect(screen.getByText('CitiSignal Financial')).toBeInTheDocument();
            expect(screen.getByText('Retail Demo')).toBeInTheDocument();
        });

        it('should display template descriptions', () => {
            renderWithProvider(<WelcomeStep {...defaultProps} />);

            expect(screen.getByText('Financial services demo')).toBeInTheDocument();
            expect(screen.getByText('Retail storefront demo')).toBeInTheDocument();
        });

        it('should highlight selected template card', () => {
            const props = {
                ...defaultProps,
                state: { ...defaultProps.state, selectedTemplate: 'citisignal-financial' }
            };
            renderWithProvider(<WelcomeStep {...props} />);

            const selectedCard = screen.getByText('CitiSignal Financial').closest('[data-selected="true"]');
            expect(selectedCard).toBeInTheDocument();
        });
    });

    describe('Template Selection Behavior', () => {
        it('should call updateState with selectedTemplate when card clicked', () => {
            renderWithProvider(<WelcomeStep {...defaultProps} />);

            fireEvent.click(screen.getByText('CitiSignal Financial'));

            expect(defaultProps.updateState).toHaveBeenCalledWith(
                expect.objectContaining({ selectedTemplate: 'citisignal-financial' })
            );
        });

        it('should allow template deselection by clicking same card', () => {
            const props = {
                ...defaultProps,
                state: { ...defaultProps.state, selectedTemplate: 'citisignal-financial' }
            };
            renderWithProvider(<WelcomeStep {...props} />);

            fireEvent.click(screen.getByText('CitiSignal Financial'));

            expect(defaultProps.updateState).toHaveBeenCalledWith(
                expect.objectContaining({ selectedTemplate: undefined })
            );
        });
    });

    describe('Can Proceed Logic', () => {
        it('should NOT allow proceed with valid project name but NO template selected', () => {
            const props = {
                ...defaultProps,
                state: { projectName: 'my-demo', selectedTemplate: undefined }
            };
            renderWithProvider(<WelcomeStep {...props} />);

            expect(defaultProps.setCanProceed).toHaveBeenLastCalledWith(false);
        });

        it('should allow proceed with valid project name AND template selected', () => {
            const props = {
                ...defaultProps,
                state: { projectName: 'my-demo', selectedTemplate: 'citisignal-financial' }
            };
            renderWithProvider(<WelcomeStep {...props} />);

            expect(defaultProps.setCanProceed).toHaveBeenLastCalledWith(true);
        });

        it('should NOT allow proceed with template selected but invalid project name', () => {
            const props = {
                ...defaultProps,
                state: { projectName: 'ab', selectedTemplate: 'citisignal-financial' } // too short
            };
            renderWithProvider(<WelcomeStep {...props} />);

            expect(defaultProps.setCanProceed).toHaveBeenLastCalledWith(false);
        });
    });

    describe('Empty State', () => {
        it('should show fallback message when no templates available', () => {
            const props = { ...defaultProps, templates: [] };
            renderWithProvider(<WelcomeStep {...props} />);

            expect(screen.getByText(/no templates available/i)).toBeInTheDocument();
        });
    });
});
```

**Test Scenarios:**
- [ ] Template cards render with name and description
- [ ] Selected template is visually highlighted
- [ ] Clicking card updates selectedTemplate in state
- [ ] Clicking selected card deselects it
- [ ] Cannot proceed without template selection
- [ ] Cannot proceed without valid project name
- [ ] Can proceed with both valid name and template
- [ ] Empty state shown when no templates

## Files to Modify

### 1. `src/features/project-creation/ui/steps/WelcomeStep.tsx`

**Changes:**
1. Add `templates` prop to receive template data
2. Add `selectedTemplate` to state interface
3. Add template card grid section below project name
4. Update `setCanProceed` logic to require template selection

**Key Implementation:**

```typescript
// New imports
import { TemplateCardGrid } from '../components/TemplateCardGrid';
import type { DemoTemplate } from '@/types/templates';

interface WelcomeStepProps extends BaseStepProps {
    existingProjectNames?: string[];
    templates?: DemoTemplate[];  // NEW
}

// In component:
// 1. Add template selection to canProceed check
useEffect(() => {
    const isValid =
        state.projectName.length >= 3 &&
        validateProjectName(state.projectName) === undefined &&
        state.selectedTemplate !== undefined;  // NEW: require template
    setCanProceed(isValid);
}, [state.projectName, state.selectedTemplate, setCanProceed, validateProjectName]);

// 2. Add template selection handler
const handleTemplateSelect = (templateId: string) => {
    const newSelection = state.selectedTemplate === templateId ? undefined : templateId;
    updateState({ selectedTemplate: newSelection });
};

// 3. Add template grid section in JSX (after project name form)
{templates && templates.length > 0 ? (
    <View marginTop="size-400">
        <Heading level={3} marginBottom="size-200">
            Choose a Demo Template
        </Heading>
        <TemplateCardGrid
            templates={templates}
            selectedId={state.selectedTemplate}
            onSelect={handleTemplateSelect}
        />
    </View>
) : (
    <View marginTop="size-400">
        <Text>No templates available</Text>
    </View>
)}
```

### 2. `src/features/project-creation/ui/components/TemplateCardGrid.tsx` (create new)

Reusable card grid component:

```typescript
import React from 'react';
import { Flex, View, Text, Heading } from '@adobe/react-spectrum';
import type { DemoTemplate } from '@/types/templates';

interface TemplateCardGridProps {
    templates: DemoTemplate[];
    selectedId?: string;
    onSelect: (templateId: string) => void;
}

export function TemplateCardGrid({ templates, selectedId, onSelect }: TemplateCardGridProps) {
    return (
        <div className="template-card-grid">
            {templates.map(template => (
                <TemplateCard
                    key={template.id}
                    template={template}
                    isSelected={selectedId === template.id}
                    onSelect={() => onSelect(template.id)}
                />
            ))}
        </div>
    );
}

interface TemplateCardProps {
    template: DemoTemplate;
    isSelected: boolean;
    onSelect: () => void;
}

function TemplateCard({ template, isSelected, onSelect }: TemplateCardProps) {
    return (
        <div
            className={`template-card ${isSelected ? 'template-card--selected' : ''}`}
            data-selected={isSelected}
            onClick={onSelect}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onSelect()}
            aria-pressed={isSelected}
        >
            <Heading level={4} marginBottom="size-100">
                {template.name}
            </Heading>
            <Text UNSAFE_className="text-sm text-gray-600">
                {template.description}
            </Text>
        </div>
    );
}
```

### 3. `src/types/webview.ts`

Add `selectedTemplate` to WizardState:

```typescript
export interface WizardState {
    projectName: string;
    selectedTemplate?: string;  // NEW
    // ... existing fields
}
```

### 4. CSS Styles (in appropriate stylesheet)

```css
.template-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
    margin-top: 16px;
}

.template-card {
    padding: 16px;
    border: 2px solid var(--spectrum-global-color-gray-300);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.2s, background-color 0.2s;
}

.template-card:hover {
    border-color: var(--spectrum-global-color-blue-500);
    background-color: var(--spectrum-global-color-gray-75);
}

.template-card--selected {
    border-color: var(--spectrum-global-color-blue-600);
    background-color: var(--spectrum-global-color-blue-100);
}

.template-card:focus {
    outline: 2px solid var(--spectrum-global-color-blue-600);
    outline-offset: 2px;
}
```

## Implementation Details (GREEN Phase)

1. Create `TemplateCardGrid` component first
2. Update WizardState type to include `selectedTemplate`
3. Update WelcomeStep props interface
4. Add template grid rendering
5. Update canProceed logic
6. Add CSS styles
7. Run tests to verify

## Refactor Phase

- Extract card styles to CSS variables
- Ensure keyboard navigation works correctly
- Verify responsive grid behavior
- Check accessibility (ARIA roles, focus management)

## Expected Outcome

- [ ] Template cards display in responsive grid
- [ ] Visual selection indicator works
- [ ] Clicking card toggles selection
- [ ] Cannot proceed without template selection
- [ ] Keyboard navigation supported
- [ ] Empty state handled gracefully

## Acceptance Criteria

- [ ] All new tests passing
- [ ] All existing WelcomeStep tests passing
- [ ] Template selection persists in wizard state
- [ ] Continue button requires template selection
- [ ] Card grid is responsive
- [ ] No accessibility regressions
- [ ] No TypeScript errors
