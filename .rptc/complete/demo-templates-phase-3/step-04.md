# Step 4: Wire Template Defaults to Component Selection State

## Purpose

When a user selects a demo template in WelcomeStep, pre-populate the ComponentSelectionStep with the template's default values. This creates the "demo-first" experience where templates drive initial selections.

## Prerequisites

- [ ] Step 1 complete (demo-templates.json with defaults structure)
- [ ] Step 2 complete (WelcomeStep stores selectedTemplate in state)
- [ ] Step 3 complete (ComponentSelectionStep simplified)

## Tests to Write First (RED Phase)

### Test File: `tests/features/project-creation/ui/wizard/templateDefaults.test.ts`

```typescript
import { applyTemplateDefaults, getTemplateById } from '../templateDefaults';
import type { WizardState } from '@/types/webview';
import type { DemoTemplate } from '@/types/templates';

const mockTemplates: DemoTemplate[] = [
    {
        id: 'citisignal-financial',
        name: 'CitiSignal Financial',
        description: 'Financial services demo',
        defaults: {
            backend: 'adobe-commerce-paas',
            frontend: 'citisignal-nextjs',
            dependencies: ['commerce-mesh', 'demo-inspector'],
            services: ['catalog-service', 'live-search']
        }
    },
    {
        id: 'minimal-demo',
        name: 'Minimal Demo',
        description: 'Bare minimum demo',
        defaults: {
            backend: 'adobe-commerce-paas',
            frontend: 'citisignal-nextjs',
            dependencies: ['commerce-mesh'],
            services: []
        }
    }
];

describe('templateDefaults', () => {
    describe('getTemplateById', () => {
        it('should return template when ID matches', () => {
            const template = getTemplateById('citisignal-financial', mockTemplates);
            expect(template?.id).toBe('citisignal-financial');
        });

        it('should return undefined when ID not found', () => {
            const template = getTemplateById('nonexistent', mockTemplates);
            expect(template).toBeUndefined();
        });

        it('should return undefined when templates array is empty', () => {
            const template = getTemplateById('citisignal-financial', []);
            expect(template).toBeUndefined();
        });
    });

    describe('applyTemplateDefaults', () => {
        const initialState: Partial<WizardState> = {
            projectName: 'my-demo',
            selectedTemplate: 'citisignal-financial',
            selectedComponents: {
                frontend: undefined,
                backend: undefined,
                dependencies: new Set<string>(),
                services: new Set<string>()
            }
        };

        it('should apply backend default from template', () => {
            const newState = applyTemplateDefaults(
                initialState as WizardState,
                mockTemplates
            );
            expect(newState.selectedComponents.backend).toBe('adobe-commerce-paas');
        });

        it('should apply frontend default from template', () => {
            const newState = applyTemplateDefaults(
                initialState as WizardState,
                mockTemplates
            );
            expect(newState.selectedComponents.frontend).toBe('citisignal-nextjs');
        });

        it('should apply dependencies as Set from template', () => {
            const newState = applyTemplateDefaults(
                initialState as WizardState,
                mockTemplates
            );
            expect(newState.selectedComponents.dependencies).toEqual(
                new Set(['commerce-mesh', 'demo-inspector'])
            );
        });

        it('should apply services as Set from template', () => {
            const newState = applyTemplateDefaults(
                initialState as WizardState,
                mockTemplates
            );
            expect(newState.selectedComponents.services).toEqual(
                new Set(['catalog-service', 'live-search'])
            );
        });

        it('should return unchanged state when no template selected', () => {
            const noTemplateState = { ...initialState, selectedTemplate: undefined };
            const newState = applyTemplateDefaults(
                noTemplateState as WizardState,
                mockTemplates
            );
            expect(newState.selectedComponents.backend).toBeUndefined();
        });

        it('should return unchanged state when template not found', () => {
            const invalidTemplateState = { ...initialState, selectedTemplate: 'nonexistent' };
            const newState = applyTemplateDefaults(
                invalidTemplateState as WizardState,
                mockTemplates
            );
            expect(newState.selectedComponents.backend).toBeUndefined();
        });

        it('should handle empty dependencies array in template', () => {
            const minimalState = { ...initialState, selectedTemplate: 'minimal-demo' };
            const newState = applyTemplateDefaults(
                minimalState as WizardState,
                mockTemplates
            );
            expect(newState.selectedComponents.dependencies).toEqual(
                new Set(['commerce-mesh'])
            );
        });

        it('should handle empty services array in template', () => {
            const minimalState = { ...initialState, selectedTemplate: 'minimal-demo' };
            const newState = applyTemplateDefaults(
                minimalState as WizardState,
                mockTemplates
            );
            expect(newState.selectedComponents.services).toEqual(new Set());
        });
    });
});
```

### Test File: `tests/features/project-creation/ui/hooks/useWizardState.templateDefaults.test.ts`

```typescript
import { renderHook, act } from '@testing-library/react';
import { useWizardState } from '@/features/project-creation/ui/hooks/useWizardState';

describe('useWizardState - Template Defaults', () => {
    const mockTemplates = [
        {
            id: 'citisignal-financial',
            name: 'CitiSignal Financial',
            description: 'Demo',
            defaults: {
                backend: 'adobe-commerce-paas',
                frontend: 'citisignal-nextjs',
                dependencies: ['commerce-mesh'],
                services: ['catalog-service']
            }
        }
    ];

    it('should apply template defaults when selectedTemplate changes', () => {
        const { result } = renderHook(() => useWizardState({ templates: mockTemplates }));

        act(() => {
            result.current.updateState({ selectedTemplate: 'citisignal-financial' });
        });

        // Defaults should be applied after template selection
        expect(result.current.state.selectedComponents.backend).toBe('adobe-commerce-paas');
        expect(result.current.state.selectedComponents.frontend).toBe('citisignal-nextjs');
    });

    it('should NOT override user changes after template application', () => {
        const { result } = renderHook(() => useWizardState({ templates: mockTemplates }));

        // Select template first
        act(() => {
            result.current.updateState({ selectedTemplate: 'citisignal-financial' });
        });

        // User changes backend
        act(() => {
            result.current.updateState({
                selectedComponents: {
                    ...result.current.state.selectedComponents,
                    backend: 'custom-backend'
                }
            });
        });

        // User change should persist
        expect(result.current.state.selectedComponents.backend).toBe('custom-backend');
    });
});
```

**Test Scenarios:**
- [ ] `getTemplateById` returns correct template
- [ ] `getTemplateById` returns undefined for unknown ID
- [ ] `applyTemplateDefaults` sets backend from template
- [ ] `applyTemplateDefaults` sets frontend from template
- [ ] `applyTemplateDefaults` sets dependencies as Set
- [ ] `applyTemplateDefaults` sets services as Set
- [ ] Returns unchanged state when no template selected
- [ ] Returns unchanged state when template not found
- [ ] Handles empty dependencies/services arrays
- [ ] Hook applies defaults when template changes
- [ ] User changes are not overwritten after initial application

## Files to Create

### 1. `src/features/project-creation/ui/helpers/templateDefaults.ts`

```typescript
import type { WizardState } from '@/types/webview';
import type { DemoTemplate } from '@/types/templates';

/**
 * Find a template by ID
 */
export function getTemplateById(
    templateId: string,
    templates: DemoTemplate[]
): DemoTemplate | undefined {
    return templates.find(t => t.id === templateId);
}

/**
 * Apply template defaults to wizard state
 * Only applies defaults; does not override existing user selections
 */
export function applyTemplateDefaults(
    state: WizardState,
    templates: DemoTemplate[]
): WizardState {
    const { selectedTemplate } = state;

    if (!selectedTemplate) {
        return state;
    }

    const template = getTemplateById(selectedTemplate, templates);
    if (!template) {
        return state;
    }

    const { defaults } = template;

    return {
        ...state,
        selectedComponents: {
            frontend: defaults.frontend,
            backend: defaults.backend,
            dependencies: new Set(defaults.dependencies || []),
            services: new Set(defaults.services || []),
            // Preserve any fields not in template defaults
            integrations: state.selectedComponents?.integrations || new Set(),
            appBuilder: state.selectedComponents?.appBuilder || new Set()
        }
    };
}
```

## Files to Modify

### 2. `src/features/project-creation/ui/hooks/useWizardState.ts`

**Changes:**

1. Add imports:
```typescript
import { applyTemplateDefaults } from '../helpers/templateDefaults';
import type { DemoTemplate } from '@/types/templates';
```

2. Add templates to hook params:
```typescript
interface UseWizardStateParams {
    templates?: DemoTemplate[];
    // ... existing params
}
```

3. Add effect to apply defaults when template changes:
```typescript
// Track if we've already applied defaults for this template
const appliedTemplateRef = useRef<string | undefined>(undefined);

useEffect(() => {
    // Only apply defaults when:
    // 1. A template is selected
    // 2. We haven't already applied defaults for this template
    if (
        state.selectedTemplate &&
        state.selectedTemplate !== appliedTemplateRef.current &&
        templates
    ) {
        const newState = applyTemplateDefaults(state, templates);
        setState(newState);
        appliedTemplateRef.current = state.selectedTemplate;
    }
}, [state.selectedTemplate, templates]);
```

### 3. `src/features/project-creation/ui/wizard/WizardContainer.tsx`

**Changes:**

1. Pass templates to useWizardState hook:
```typescript
const { state, updateState, ... } = useWizardState({
    templates: templatesData,  // From message or prop
    // ... existing params
});
```

2. Pass templates to WelcomeStep:
```typescript
<WelcomeStep
    state={state}
    updateState={updateState}
    setCanProceed={setCanProceed}
    templates={templatesData}  // NEW
/>
```

### 4. Message Handler (Extension Side)

Update handler to load and send templates to webview:

**File:** `src/features/project-creation/handlers/wizardHandlers.ts` (or appropriate handler file)

```typescript
// Add handler for loading templates
async function handleGetTemplates(): Promise<DemoTemplate[]> {
    const templatesPath = path.join(
        __dirname,
        '../../../templates/demo-templates.json'
    );
    const content = await fs.readFile(templatesPath, 'utf-8');
    const { templates } = JSON.parse(content);
    return templates;
}
```

## Implementation Details (GREEN Phase)

1. Create `templateDefaults.ts` helper module
2. Add effect to `useWizardState` for applying defaults
3. Update `WizardContainer` to pass templates
4. Update message handler to load templates
5. Run tests to verify

## Refactor Phase

- Consider caching template data
- Ensure ref doesn't cause stale closure issues
- Verify state updates are batched correctly
- Add logging for template application

## Expected Outcome

- [ ] Template defaults apply on selection
- [ ] Frontend/backend/dependencies/services all populated
- [ ] User can modify defaults after application
- [ ] Re-selecting same template doesn't re-apply
- [ ] Selecting different template applies new defaults

## Acceptance Criteria

- [ ] All new tests passing
- [ ] All existing wizard tests passing
- [ ] Template selection in Step 1 → defaults appear in Step 2
- [ ] User modifications in Step 2 persist
- [ ] No infinite loops or duplicate renders
- [ ] No TypeScript errors
- [ ] State serialization works (Sets converted properly)

## Integration Notes

This step ties together the previous steps:
- **Step 1** provides the template schema and data
- **Step 2** provides the UI for template selection
- **Step 3** provides the simplified component UI
- **Step 4** wires them together via state management

After this step, the complete "demo-first" flow is functional.
