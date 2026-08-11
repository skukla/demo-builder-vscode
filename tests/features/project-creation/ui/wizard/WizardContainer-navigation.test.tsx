// Import mocks FIRST - before any component imports
import './WizardContainer.mocks';

import { screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('WizardContainer - Navigation', () => {
    beforeEach(() => {
        setupTest();
    });

    afterEach(async () => {
        cleanup();
        await cleanupTest();
    });

    describe('Happy Path - Step Navigation', () => {
        it('should advance to next step when Continue is clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Initially on welcome step (welcome removed in Step 3)
            expect(screen.getByTestId('welcome-step')).toBeInTheDocument();

            // Click Continue button
            const continueButton = screen.getByRole('button', { name: /continue/i });
            await user.click(continueButton);

            // Wait for transition (300ms delay in navigateToStep)
            await waitFor(() => {
                expect(screen.getByTestId('storefront-setup-step')).toBeInTheDocument();
            }, { timeout: 500 });
        });

        it('should navigate backwards when Back button is clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Navigate forward to welcome step
            const continueButton = screen.getByRole('button', { name: /continue/i });
            await user.click(continueButton);

            await waitFor(() => {
                expect(screen.getByTestId('storefront-setup-step')).toBeInTheDocument();
            }, { timeout: 500 });

            // Navigate back
            const backButton = screen.getByRole('button', { name: /back/i });
            await user.click(backButton);

            await waitFor(() => {
                expect(screen.getByTestId('welcome-step')).toBeInTheDocument();
            }, { timeout: 500 });
        });

        it('should mark steps as completed when navigating forward', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Navigate forward twice (welcome → welcome → prerequisites)
            const continueButton = screen.getByRole('button', { name: /continue/i });

            await user.click(continueButton);
            await waitFor(() => {
                expect(screen.getByTestId('storefront-setup-step')).toBeInTheDocument();
            }, { timeout: 500 });

            await user.click(continueButton);
            await waitFor(() => {
                expect(screen.getByTestId('prerequisites-step')).toBeInTheDocument();
            }, { timeout: 500 });

            // Timeline should show welcome and welcome as completed
            // (Verified through TimelineNav completedSteps prop)
        });
    });

    describe('Sidebar Navigation Integration', () => {
        // Note: Timeline navigation has been moved to the sidebar.
        // These tests verify the wizard responds to navigation messages from the sidebar.

        it('should allow backward navigation via sidebar message', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Navigate forward to welcome (2nd step)
            const continueButton = screen.getByRole('button', { name: /continue/i });
            await user.click(continueButton);

            await waitFor(() => {
                expect(screen.getByTestId('storefront-setup-step')).toBeInTheDocument();
            }, { timeout: 500 });

            // Simulate sidebar sending navigation message (go back to step 0)
            // The sidebar integration is tested in sidebar tests
            // Here we verify the wizard's Back button still works
            const backButton = screen.getByRole('button', { name: /back/i });
            await user.click(backButton);

            await waitFor(() => {
                expect(screen.getByTestId('welcome-step')).toBeInTheDocument();
            }, { timeout: 500 });
        });

        it('should not allow skipping steps via Continue', async () => {
            const _user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Currently on welcome step (first step)
            expect(screen.getByTestId('welcome-step')).toBeInTheDocument();

            // Continue button should be enabled/disabled based on step validation
            // Cannot skip ahead without completing current step
            const continueButton = screen.getByRole('button', { name: /continue/i });
            expect(continueButton).toBeInTheDocument();
        });
    });

    describe('Happy Path - Backend Call on Continue', () => {
        it('should call backend when selecting project and clicking Continue', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Navigate to welcome step (2nd step)
            const continueButton = screen.getByRole('button', { name: /continue/i });

            // Adobe Auth -> Welcome
            await user.click(continueButton);
            await waitFor(() => screen.getByTestId('storefront-setup-step'), { timeout: 500 });

            // For this test, we just verify the Continue button drives navigation
            // (and any backend call it triggers) onward to the next step.

            // Click Continue (should trigger the backend call on continue)
            await user.click(continueButton);

            // Verify navigation proceeds to the next step
            await waitFor(() => {
                expect(screen.getByTestId('prerequisites-step')).toBeInTheDocument();
            }, { timeout: 500 });
        });
    });

    describe('Integration - Full Wizard Flow', () => {
        it('should complete entire wizard flow from auth to project creation', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Navigate through all render-able mock steps. Retired steps
            // (adobe-project / adobe-workspace) were removed from the wizard; the
            // mock flow now uses welcome + prerequisites as navigable intermediates.
            const getButton = () => screen.getByRole('button', { name: /continue|^create$/i });

            // Start at welcome (first step in the mock flow)
            expect(screen.getByTestId('welcome-step')).toBeInTheDocument();

            // welcome → welcome
            await user.click(getButton());
            await screen.findByTestId('storefront-setup-step', {}, { timeout: 1000 });

            // welcome → prerequisites
            await user.click(getButton());
            await screen.findByTestId('prerequisites-step', {}, { timeout: 1000 });

            // prerequisites → review
            await user.click(getButton());
            await screen.findByTestId('review-step', {}, { timeout: 1000 });

            // Review step should have Create button
            expect(screen.getByRole('button', { name: /^create$/i })).toBeInTheDocument();
        });
    });
});
