/**
 * useStepValidation Hook Tests
 *
 * Tests for the wizard step validation hook.
 * Verifies validation logic based on step name and wizard state.
 *
 */

import { renderHook } from '@testing-library/react';
import { useStepValidation } from '@/features/project-creation/ui/hooks/useStepValidation';
import type { WizardState } from '@/types/webview';

describe('useStepValidation', () => {
    const createMockState = (overrides: Partial<WizardState> = {}): WizardState => ({
        currentStep: 'welcome',
        projectName: '',
        adobeAuth: {
            isAuthenticated: false,
            isChecking: false,
        },
        ...overrides,
    } as WizardState);

    /**
     * The wizard state crosses the message channel as JSON, so a host that has
     * not populated a field yet hands over a state where it is simply absent —
     * a shape the WizardState type cannot express. The `?.` guards in the step
     * validators exist for exactly that case; these builders reproduce it.
     */
    const stateMissing = (field: keyof WizardState): WizardState => {
        const state = createMockState({ projectName: 'My Demo' });
        delete (state as Partial<WizardState>)[field];
        return state;
    };

    describe('adobe-auth Step Validation', () => {
        it('should return valid when isAuthenticated is true', () => {
            const state = createMockState({
                adobeAuth: { isAuthenticated: true, isChecking: false },
            });

            const { result } = renderHook(() =>
                useStepValidation('adobe-auth', state)
            );

            expect(result.current).toEqual({
                isValid: true,
                canProceed: true,
            });
        });

        it('should return invalid when isAuthenticated is false', () => {
            const state = createMockState({
                adobeAuth: { isAuthenticated: false, isChecking: false },
            });

            const { result } = renderHook(() =>
                useStepValidation('adobe-auth', state)
            );

            expect(result.current).toEqual({
                isValid: false,
                canProceed: false,
            });
        });

        it('should return invalid rather than throw when adobeAuth is absent', () => {
            const { result } = renderHook(() =>
                useStepValidation('adobe-auth', stateMissing('adobeAuth'))
            );

            expect(result.current).toEqual({
                isValid: false,
                canProceed: false,
            });
        });
    });

    describe('project-name Step Validation', () => {
        it('should return valid when projectName is provided', () => {
            const state = createMockState({ projectName: 'My Demo' });

            const { result } = renderHook(() =>
                useStepValidation('project-name', state)
            );

            expect(result.current).toEqual({
                isValid: true,
                canProceed: true,
            });
        });

        it('should return invalid when projectName is empty', () => {
            const state = createMockState({ projectName: '' });

            const { result } = renderHook(() =>
                useStepValidation('project-name', state)
            );

            expect(result.current).toEqual({
                isValid: false,
                canProceed: false,
            });
        });

        it('should return invalid when projectName is only whitespace', () => {
            const state = createMockState({ projectName: '   ' });

            const { result } = renderHook(() =>
                useStepValidation('project-name', state)
            );

            expect(result.current).toEqual({
                isValid: false,
                canProceed: false,
            });
        });

        it('should return invalid rather than throw when projectName is absent', () => {
            const { result } = renderHook(() =>
                useStepValidation('project-name', stateMissing('projectName'))
            );

            expect(result.current).toEqual({
                isValid: false,
                canProceed: false,
            });
        });
    });

    describe('build-your-project Step Validation', () => {
        it('should return valid when stack is selected', () => {
            const state = createMockState({
                selectedStack: 'headless',
            } as Partial<WizardState>);

            const { result } = renderHook(() =>
                useStepValidation('build-your-project', state)
            );

            expect(result.current).toEqual({
                isValid: true,
                canProceed: true,
            });
        });

        it('should return invalid when no stack selected', () => {
            const state = createMockState({ selectedStack: undefined });

            const { result } = renderHook(() =>
                useStepValidation('build-your-project', state)
            );

            expect(result.current).toEqual({
                isValid: false,
                canProceed: false,
            });
        });

        it('should return invalid when selectedStack is empty string', () => {
            const state = createMockState({
                selectedStack: '',
            } as Partial<WizardState>);

            const { result } = renderHook(() =>
                useStepValidation('build-your-project', state)
            );

            expect(result.current).toEqual({
                isValid: false,
                canProceed: false,
            });
        });
    });

    // Note: the `adobe-project` / `adobe-workspace` step validators were retired
    // along with those wizard steps (their pickers now live inside the
    // build-your-project Mesh tile). Unknown step names fall through to the
    // default valid verdict — covered by the "Unknown Step" describe below.

    describe('Unknown Step', () => {
        it('should return valid for unknown step names', () => {
            const state = createMockState();

            const { result } = renderHook(() =>
                useStepValidation('unknown-step', state)
            );

            expect(result.current).toEqual({
                isValid: true,
                canProceed: true,
            });
        });
    });

    describe('Memoization', () => {
        it('should return same object reference when inputs unchanged', () => {
            const state = createMockState({
                adobeAuth: { isAuthenticated: true, isChecking: false },
            });

            const { result, rerender } = renderHook(
                ({ step, wizardState }) => useStepValidation(step, wizardState),
                { initialProps: { step: 'adobe-auth', wizardState: state } }
            );

            const firstResult = result.current;
            rerender({ step: 'adobe-auth', wizardState: state });
            const secondResult = result.current;

            expect(firstResult).toBe(secondResult);
        });

        it('should return new object when step changes', () => {
            const state = createMockState({
                adobeAuth: { isAuthenticated: true, isChecking: false },
                projectName: 'Demo',
            });

            const { result, rerender } = renderHook(
                ({ step, wizardState }) => useStepValidation(step, wizardState),
                { initialProps: { step: 'adobe-auth', wizardState: state } }
            );

            const firstResult = result.current;
            rerender({ step: 'project-name', wizardState: state });
            const secondResult = result.current;

            expect(firstResult).not.toBe(secondResult);
        });

        it('should return new object when relevant state changes', () => {
            const state1 = createMockState({
                adobeAuth: { isAuthenticated: false, isChecking: false },
            });
            const state2 = createMockState({
                adobeAuth: { isAuthenticated: true, isChecking: false },
            });

            const { result, rerender } = renderHook(
                ({ step, wizardState }) => useStepValidation(step, wizardState),
                { initialProps: { step: 'adobe-auth', wizardState: state1 } }
            );

            const firstResult = result.current;
            rerender({ step: 'adobe-auth', wizardState: state2 });
            const secondResult = result.current;

            expect(firstResult).not.toBe(secondResult);
            expect(firstResult.isValid).toBe(false);
            expect(secondResult.isValid).toBe(true);
        });
    });
});
