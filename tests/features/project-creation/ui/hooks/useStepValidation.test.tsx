/**
 * useStepValidation Hook Tests
 *
 * Tests for the wizard step validation hook.
 * Verifies validation logic based on step name and wizard state.
 *
 * @jest-environment jsdom
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
    });

    describe('component-selection Step Validation', () => {
        it('should return valid when components are selected', () => {
            const state = createMockState({
                components: { frontend: 'headless', backend: 'commerce-backend' }
            } as Partial<WizardState>);

            const { result } = renderHook(() =>
                useStepValidation('component-selection', state)
            );

            expect(result.current).toEqual({
                isValid: true,
                canProceed: true,
            });
        });

        it('should return valid when only frontend is selected', () => {
            const state = createMockState({
                components: { frontend: 'headless' }
            } as Partial<WizardState>);

            const { result } = renderHook(() =>
                useStepValidation('component-selection', state)
            );

            expect(result.current).toEqual({
                isValid: true,
                canProceed: true,
            });
        });

        it('should return invalid when no components selected', () => {
            const state = createMockState({ components: undefined });

            const { result } = renderHook(() =>
                useStepValidation('component-selection', state)
            );

            expect(result.current).toEqual({
                isValid: false,
                canProceed: false,
            });
        });

        it('should return invalid when components object is empty', () => {
            const state = createMockState({
                components: {} as any
            });

            const { result } = renderHook(() =>
                useStepValidation('component-selection', state)
            );

            expect(result.current).toEqual({
                isValid: false,
                canProceed: false,
            });
        });
    });

    describe('adobe-project Step Validation', () => {
        it('should return valid when adobeProject is selected', () => {
            const state = createMockState({
                adobeProject: { id: 'proj-123', title: 'My Project' }
            } as Partial<WizardState>);

            const { result } = renderHook(() =>
                useStepValidation('adobe-project', state)
            );

            expect(result.current).toEqual({
                isValid: true,
                canProceed: true,
            });
        });

        it('should return invalid when adobeProject is not selected', () => {
            const state = createMockState({ adobeProject: undefined });

            const { result } = renderHook(() =>
                useStepValidation('adobe-project', state)
            );

            expect(result.current).toEqual({
                isValid: false,
                canProceed: false,
            });
        });
    });

    describe('adobe-workspace Step Validation', () => {
        it('should return valid when adobeWorkspace is selected', () => {
            const state = createMockState({
                adobeWorkspace: { id: 'ws-123', name: 'Production' }
            } as Partial<WizardState>);

            const { result } = renderHook(() =>
                useStepValidation('adobe-workspace', state)
            );

            expect(result.current).toEqual({
                isValid: true,
                canProceed: true,
            });
        });

        it('should return invalid when adobeWorkspace is not selected', () => {
            const state = createMockState({ adobeWorkspace: undefined });

            const { result } = renderHook(() =>
                useStepValidation('adobe-workspace', state)
            );

            expect(result.current).toEqual({
                isValid: false,
                canProceed: false,
            });
        });
    });

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
