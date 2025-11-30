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

        it('should render initial welcome step', () => {
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            expect(screen.getByTestId('welcome-step')).toBeInTheDocument();
            expect(screen.getByText('Create Demo Project')).toBeInTheDocument();
            // "Welcome" appears in TimelineNav - already verified by welcome-step testid
        });

        it('should render timeline navigation with all steps', () => {
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            expect(screen.getByTestId('timeline-nav')).toBeInTheDocument();
            expect(screen.getByTestId('timeline-step-welcome')).toBeInTheDocument();
            expect(screen.getByTestId('timeline-step-adobe-auth')).toBeInTheDocument();
            expect(screen.getByTestId('timeline-step-review')).toBeInTheDocument();
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
                { id: 'welcome', name: 'Welcome', enabled: true },
                { id: 'adobe-auth', name: 'Adobe Auth', enabled: false }, // Disabled
                { id: 'review', name: 'Review', enabled: true },
            ];

            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={stepsWithDisabled}
                />
            );

            // Timeline should only show enabled steps
            expect(screen.getByTestId('timeline-step-welcome')).toBeInTheDocument();
            expect(screen.queryByTestId('timeline-step-adobe-auth')).not.toBeInTheDocument();
            expect(screen.getByTestId('timeline-step-review')).toBeInTheDocument();
        });
    });
});
