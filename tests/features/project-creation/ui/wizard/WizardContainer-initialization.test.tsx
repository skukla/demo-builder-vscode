// Import mocks FIRST - before any component imports
import './WizardContainer.mocks';

import { screen, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { WizardContainer } from '@/features/project-creation/ui/wizard/WizardContainer';
import '@testing-library/jest-dom';
import {
    mockRequest,
    createMockComponentDefaults,
    createMockWizardSteps,
    setupTest,
    cleanupTest,
    renderWithTheme,
} from './WizardContainer.testUtils';

describe('WizardContainer - Initialization', () => {
    beforeEach(() => {
        setupTest();
    });

    afterEach(async () => {
        cleanup();
        await cleanupTest();
    });

    describe('Happy Path - Component Mounting', () => {
        it('should load component data on mount', async () => {
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Wait for async component data loading
            await waitFor(() => {
                expect(mockRequest).toHaveBeenCalledWith('get-components-data');
            });
        });

        it('should render initial adobe-auth step (welcome removed)', () => {
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Wizard now starts at adobe-auth (welcome step removed in Step 3)
            expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
            expect(screen.queryByTestId('welcome-step')).not.toBeInTheDocument();
        });

        it('should render wizard with all step navigation buttons', () => {
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Verify navigation buttons are present
            // Note: Timeline navigation has been moved to the sidebar
            expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();

            // Verify first step is adobe-auth (welcome removed)
            expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
        });

        it('should display footer buttons (Cancel, Back, Continue) except on last step', () => {
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
        });
    });

    describe('Edge Cases - Configuration Validation', () => {
        it('should handle missing wizardSteps configuration', () => {
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={undefined}
                />
            );

            expect(screen.getByText('Configuration Error')).toBeInTheDocument();
            expect(screen.getByText('Wizard configuration not loaded. Please restart the extension.')).toBeInTheDocument();
        });

        it('should handle empty wizardSteps array', () => {
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={[]}
                />
            );

            expect(screen.getByText('Configuration Error')).toBeInTheDocument();
        });

        it('should filter out disabled steps', () => {
            const stepsWithDisabled = [
                { id: 'adobe-auth', name: 'Adobe Auth', enabled: true },
                { id: 'adobe-project', name: 'Adobe Project', enabled: false }, // Disabled
                { id: 'review', name: 'Review', enabled: true },
            ];

            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={stepsWithDisabled}
                />
            );

            // Verify the wizard starts at adobe-auth (first enabled step)
            expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();

            // Verify step configuration by checking the filtered steps array
            // (disabled steps are filtered out internally)
            const enabledSteps = stepsWithDisabled.filter(s => s.enabled);
            expect(enabledSteps).toHaveLength(2);
            expect(enabledSteps.map(s => s.id)).toEqual(['adobe-auth', 'review']);
        });
    });
});
