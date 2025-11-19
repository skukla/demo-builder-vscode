// Import mocks FIRST - before any component imports
import './WizardContainer.mocks';

import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { WizardContainer } from '@/features/project-creation/ui/wizard/WizardContainer';
import '@testing-library/jest-dom';
import {
    createMockComponentDefaults,
    createMockWizardSteps,
    setupTest,
    cleanupTest,
    renderWithTheme,
} from './WizardContainer.testUtils';

describe('WizardContainer - Focus Management', () => {
    beforeEach(() => {
        setupTest();
    });

    afterEach(async () => {
        cleanup();
        await cleanupTest();
        jest.restoreAllMocks();
    });

    describe('Self-Managed Steps - Skip Auto-Focus', () => {
        it('should skip auto-focus for component-selection step', async () => {
            const focusSpy = jest.spyOn(HTMLElement.prototype, 'focus');

            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Navigate to component-selection step
            const continueButton = screen.getByRole('button', { name: /continue/i });

            // Welcome → Adobe Auth → Adobe Project → Adobe Workspace → Component Selection
            for (let i = 0; i < 4; i++) {
                fireEvent.click(continueButton);
                await waitFor(() => {}, { timeout: 400 });
            }

            // Now on component-selection step
            await waitFor(() => {
                expect(screen.getByTestId('component-selection-step')).toBeInTheDocument();
            }, { timeout: 500 });

            // Clear any focus calls from previous steps
            focusSpy.mockClear();

            // Wait for potential auto-focus delay (300ms + buffer)
            await new Promise(resolve => setTimeout(resolve, 400));

            // WizardContainer should NOT have called focus() because component-selection is self-managed
            expect(focusSpy).not.toHaveBeenCalled();

            focusSpy.mockRestore();
        });

        it('should skip auto-focus for component-config step', async () => {
            const focusSpy = jest.spyOn(HTMLElement.prototype, 'focus');

            // Create steps with component-config (settings)
            const stepsWithConfig = createMockWizardSteps().map(step =>
                step.id === 'settings' ? { ...step, id: 'component-config' } : step
            );

            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={stepsWithConfig}
                />
            );

            // Navigate to component-config step (7 steps forward)
            const continueButton = screen.getByRole('button', { name: /continue/i });

            for (let i = 0; i < 7; i++) {
                fireEvent.click(continueButton);
                await waitFor(() => {}, { timeout: 400 });
            }

            // Now on component-config step
            await waitFor(() => {
                expect(screen.getByTestId('component-config-step')).toBeInTheDocument();
            }, { timeout: 500 });

            focusSpy.mockClear();

            // Wait for potential auto-focus delay
            await new Promise(resolve => setTimeout(resolve, 400));

            // Should NOT have called focus() because component-config is self-managed
            expect(focusSpy).not.toHaveBeenCalled();

            focusSpy.mockRestore();
        });
    });

    describe('Auto-Managed Steps - Apply Auto-Focus', () => {
        it('should still auto-focus for other steps like welcome', async () => {
            // Create a mock element with focus method
            const mockFocusableElement = document.createElement('button');
            const focusSpy = jest.spyOn(mockFocusableElement, 'focus');

            // Mock querySelectorAll to return our focusable element
            const querySelectorAllSpy = jest.spyOn(Element.prototype, 'querySelectorAll');
            querySelectorAllSpy.mockImplementation(function(this: Element, selector: string) {
                if (selector.includes('button')) {
                    return [mockFocusableElement] as any;
                }
                return [] as any;
            });

            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // On welcome step (not self-managed)
            expect(screen.getByTestId('welcome-step')).toBeInTheDocument();

            // Wait for auto-focus delay (300ms + buffer)
            await new Promise(resolve => setTimeout(resolve, 400));

            // WizardContainer SHOULD auto-focus for welcome step
            expect(focusSpy).toHaveBeenCalled();

            focusSpy.mockRestore();
            querySelectorAllSpy.mockRestore();
        });

        it('should still auto-focus for prerequisites step', async () => {
            const mockFocusableElement = document.createElement('button');
            const focusSpy = jest.spyOn(mockFocusableElement, 'focus');

            const querySelectorAllSpy = jest.spyOn(Element.prototype, 'querySelectorAll');
            querySelectorAllSpy.mockImplementation(function(this: Element, selector: string) {
                if (selector.includes('button')) {
                    return [mockFocusableElement] as any;
                }
                return [] as any;
            });

            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Navigate to prerequisites step (5 steps forward)
            const continueButton = screen.getByRole('button', { name: /continue/i });

            for (let i = 0; i < 5; i++) {
                fireEvent.click(continueButton);
                await waitFor(() => {}, { timeout: 400 });
            }

            await waitFor(() => {
                expect(screen.getByTestId('prerequisites-step')).toBeInTheDocument();
            }, { timeout: 500 });

            focusSpy.mockClear();

            // Wait for auto-focus delay
            await new Promise(resolve => setTimeout(resolve, 400));

            // WizardContainer SHOULD auto-focus for prerequisites step (not self-managed)
            expect(focusSpy).toHaveBeenCalled();

            focusSpy.mockRestore();
            querySelectorAllSpy.mockRestore();
        });
    });
});
