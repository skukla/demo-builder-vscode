/**
 * Tests for template defaults integration in useWizardNavigation
 *
 * Phase 5: Template Defaults Integration
 * Step 1: Add templates prop to navigation hook
 * Step 2: Apply defaults when leaving welcome step
 */

import { renderHook, act } from '@testing-library/react';
import { useWizardNavigation } from '@/features/project-creation/ui/wizard/hooks/useWizardNavigation';
import type { WizardState, WizardStep } from '@/types/webview';
import type { DemoTemplate } from '@/types/templates';

// Mock vscode API
jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: {
        postMessage: jest.fn(),
        request: jest.fn().mockResolvedValue({ success: true }),
    },
}));

// Mock webviewLogger
jest.mock('@/core/ui/utils/webviewLogger', () => ({
    webviewLogger: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

describe('useWizardNavigation - Templates Integration', () => {
    const mockWizardSteps: Array<{ id: WizardStep; name: string }> = [
        { id: 'welcome', name: 'Welcome' },
        { id: 'component-selection', name: 'Components' },
        { id: 'review', name: 'Review' },
    ];

    const createMockState = (overrides: Partial<WizardState> = {}): WizardState => ({
        projectName: 'test-project',
        currentStep: 'welcome',
        components: {
            frontend: '',
            backend: '',
            dependencies: [],
            integrations: [],
            appBuilderApps: [],
        },
        editMode: false,
        ...overrides,
    });

    const createMockTemplates = (): DemoTemplate[] => [
        {
            id: 'citisignal',
            name: 'CitiSignal Storefront',
            description: 'Next.js headless storefront',
            defaults: {
                frontend: 'citisignal-nextjs',
                backend: 'adobe-commerce-paas',
                dependencies: ['commerce-mesh', 'demo-inspector'],
            },
        },
    ];

    const createMockHookProps = (overrides = {}) => ({
        state: createMockState(),
        setState: jest.fn(),
        WIZARD_STEPS: mockWizardSteps,
        completedSteps: [] as WizardStep[],
        setCompletedSteps: jest.fn(),
        highestCompletedStepIndex: -1,
        setHighestCompletedStepIndex: jest.fn(),
        setAnimationDirection: jest.fn(),
        setIsTransitioning: jest.fn(),
        setIsConfirmingSelection: jest.fn(),
        setIsPreparingReview: jest.fn(),
        ...overrides,
    });

    describe('Step 1: Templates prop acceptance', () => {
        it('should accept templates prop without errors', () => {
            const props = createMockHookProps({
                templates: createMockTemplates(),
            });

            // This test verifies the hook accepts templates prop
            // Will fail until interface is updated
            const { result } = renderHook(() => useWizardNavigation(props));

            expect(result.current.goNext).toBeDefined();
            expect(result.current.goBack).toBeDefined();
        });

        it('should work correctly when templates is undefined (backward compatibility)', () => {
            const props = createMockHookProps({
                templates: undefined,
            });

            const { result } = renderHook(() => useWizardNavigation(props));

            expect(result.current.goNext).toBeDefined();
            expect(result.current.goBack).toBeDefined();
        });

        it('should work correctly when templates is empty array', () => {
            const props = createMockHookProps({
                templates: [],
            });

            const { result } = renderHook(() => useWizardNavigation(props));

            expect(result.current.goNext).toBeDefined();
            expect(result.current.goBack).toBeDefined();
        });
    });

    describe('Step 2: Apply defaults on welcome exit', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should apply template defaults when leaving welcome step with template selected', async () => {
            const mockSetState = jest.fn();
            const templates = createMockTemplates();
            const stateWithTemplate = createMockState({
                currentStep: 'welcome',
                selectedTemplate: 'citisignal',
                components: {
                    frontend: '',
                    backend: '',
                    dependencies: [],
                    integrations: [],
                    appBuilderApps: [],
                },
            });

            const props = createMockHookProps({
                state: stateWithTemplate,
                setState: mockSetState,
                templates,
            });

            const { result } = renderHook(() => useWizardNavigation(props));

            // Call goNext to leave welcome step
            await act(async () => {
                await result.current.goNext();
                // Advance timers to complete navigation transitions
                jest.runAllTimers();
            });

            // Verify setState was called to apply template defaults
            // The first call should be the template defaults application
            expect(mockSetState).toHaveBeenCalled();

            // Find the call that applies template defaults (should have components populated)
            const setStateCalls = mockSetState.mock.calls;
            let foundTemplateDefaultsCall = false;

            for (const call of setStateCalls) {
                if (typeof call[0] === 'function') {
                    const result = call[0](stateWithTemplate);
                    if (result.components?.frontend === 'citisignal-nextjs') {
                        foundTemplateDefaultsCall = true;
                        expect(result.components.backend).toBe('adobe-commerce-paas');
                        expect(result.components.dependencies).toContain('commerce-mesh');
                        expect(result.components.dependencies).toContain('demo-inspector');
                        break;
                    }
                }
            }

            expect(foundTemplateDefaultsCall).toBe(true);
        });

        it('should NOT apply template defaults when no template selected', async () => {
            const mockSetState = jest.fn();
            const templates = createMockTemplates();
            const stateWithoutTemplate = createMockState({
                currentStep: 'welcome',
                selectedTemplate: undefined,  // No template selected
                components: {
                    frontend: '',
                    backend: '',
                    dependencies: [],
                    integrations: [],
                    appBuilderApps: [],
                },
            });

            const props = createMockHookProps({
                state: stateWithoutTemplate,
                setState: mockSetState,
                templates,
            });

            const { result } = renderHook(() => useWizardNavigation(props));

            await act(async () => {
                await result.current.goNext();
                jest.runAllTimers();
            });

            // Verify no setState call populates components from template
            const setStateCalls = mockSetState.mock.calls;

            for (const call of setStateCalls) {
                if (typeof call[0] === 'function') {
                    const result = call[0](stateWithoutTemplate);
                    // Components should remain empty (no template defaults applied)
                    expect(result.components?.frontend || '').toBe('');
                }
            }
        });

        it('should NOT apply template defaults when leaving other steps', async () => {
            const mockSetState = jest.fn();
            const templates = createMockTemplates();
            const stateOnComponentStep = createMockState({
                currentStep: 'component-selection',  // Not welcome step
                selectedTemplate: 'citisignal',
                components: {
                    frontend: 'custom-frontend',
                    backend: 'custom-backend',
                    dependencies: [],
                    integrations: [],
                    appBuilderApps: [],
                },
            });

            const props = createMockHookProps({
                state: stateOnComponentStep,
                setState: mockSetState,
                templates,
            });

            const { result } = renderHook(() => useWizardNavigation(props));

            await act(async () => {
                await result.current.goNext();
                jest.runAllTimers();
            });

            // Verify components remain unchanged (no template defaults applied)
            const setStateCalls = mockSetState.mock.calls;

            for (const call of setStateCalls) {
                if (typeof call[0] === 'function') {
                    const result = call[0](stateOnComponentStep);
                    // Should NOT have template defaults
                    if (result.components) {
                        expect(result.components.frontend).not.toBe('citisignal-nextjs');
                    }
                }
            }
        });

        it('should NOT apply defaults when templates array is empty', async () => {
            const mockSetState = jest.fn();
            const stateWithTemplate = createMockState({
                currentStep: 'welcome',
                selectedTemplate: 'citisignal',  // Template selected but no templates available
                components: {
                    frontend: '',
                    backend: '',
                    dependencies: [],
                    integrations: [],
                    appBuilderApps: [],
                },
            });

            const props = createMockHookProps({
                state: stateWithTemplate,
                setState: mockSetState,
                templates: [],  // Empty templates array
            });

            const { result } = renderHook(() => useWizardNavigation(props));

            await act(async () => {
                await result.current.goNext();
                jest.runAllTimers();
            });

            // No template defaults should be applied
            const setStateCalls = mockSetState.mock.calls;

            for (const call of setStateCalls) {
                if (typeof call[0] === 'function') {
                    const result = call[0](stateWithTemplate);
                    // Components should remain empty
                    expect(result.components?.frontend || '').toBe('');
                }
            }
        });
    });
});
