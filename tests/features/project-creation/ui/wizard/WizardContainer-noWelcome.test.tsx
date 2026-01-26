/**
 * Tests for WizardContainer - No Welcome Step
 *
 * Step 3: Integration & Cleanup
 *
 * These tests verify that the wizard no longer includes a Welcome step
 * and starts directly at the Adobe Authentication step.
 *
 * Note: Timeline navigation has been moved to the sidebar.
 * These tests verify step content directly.
 */

// Import mocks FIRST - before any component imports
import './WizardContainer.mocks';

import { screen, cleanup } from '@testing-library/react';
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

describe('WizardContainer - No Welcome Step', () => {
    beforeEach(() => {
        setupTest();
    });

    afterEach(async () => {
        cleanup();
        await cleanupTest();
    });

    describe('Wizard Configuration', () => {
        it('should NOT have welcome step in wizard', () => {
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Welcome step should NOT be rendered
            expect(screen.queryByTestId('welcome-step')).not.toBeInTheDocument();

            // First step should be adobe-auth
            expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
        });

        it('should start at adobe-auth step (not welcome)', () => {
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Should NOT render welcome step content
            expect(screen.queryByTestId('welcome-step')).not.toBeInTheDocument();
            expect(screen.queryByText('Welcome to Adobe Demo Builder')).not.toBeInTheDocument();

            // Should render adobe-auth step content
            expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
        });

        it('should have adobe-auth as the first step', () => {
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Adobe auth step content should be rendered (first step)
            expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();

            // Continue button should be available (indicating we're on a valid step)
            expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
        });

        it('should have correct step count (8 steps without welcome)', () => {
            // This test verifies the wizard configuration has 8 steps
            // (welcome and api-mesh removed, deploy-mesh added)
            const steps = createMockWizardSteps();
            expect(steps).toHaveLength(8);

            // Verify welcome is not in the list
            const stepIds = steps.map(s => s.id);
            expect(stepIds).not.toContain('welcome');
            expect(stepIds[0]).toBe('adobe-auth');
        });
    });

    describe('Step Configuration', () => {
        it('should render first step (adobe-auth) content without welcome', () => {
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Adobe auth step should be rendered
            expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();

            // Welcome step should NOT be rendered
            expect(screen.queryByTestId('welcome-step')).not.toBeInTheDocument();
        });
    });

    describe('Initial State', () => {
        it('should have currentStep set to adobe-auth on mount', () => {
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Adobe auth content should be rendered
            expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
        });

        it('should hide Back button on first step (d1b31df)', () => {
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Back button is hidden on first step (d1b31df)
            expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument();
            // Continue button should be visible
            expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
        });
    });
});
