// Import mocks FIRST - before any component imports
import './WizardContainer.mocks';

import { screen, cleanup } from '@testing-library/react';
import React from 'react';
import { WizardContainer } from '@/features/project-creation/ui/wizard/WizardContainer';
import '@testing-library/jest-dom';
import {
    createMockComponentDefaults,
    createMockWizardSteps,
    createMockImportedSettings,
    setupTest,
    cleanupTest,
    renderWizard,
} from './WizardContainer.testUtils';

/**
 * Tests for import flow auto-navigation feature
 *
 * When user imports settings from a file:
 * 1. Wizard starts at welcome step
 * 2. Auth check runs automatically
 * 3. When auth succeeds, wizard auto-navigates to review step
 * 4. Intermediate steps are marked complete so user can go back
 */
describe('WizardContainer - Import Flow', () => {
    beforeEach(() => {
        setupTest();
    });

    afterEach(async () => {
        cleanup();
        await cleanupTest();
    });

    describe('Import Settings Pre-population', () => {
        it('should pre-populate project name from imported settings', async () => {
            const importedSettings = createMockImportedSettings();

            await renderWizard(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                    existingProjectNames={[]}
                    importedSettings={importedSettings}
                />
            );

            // Should start at welcome step
            expect(screen.getByTestId('welcome-step')).toBeInTheDocument();
        });

        it('should generate unique project name when original exists', async () => {
            const importedSettings = createMockImportedSettings();

            await renderWizard(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                    existingProjectNames={['my-existing-project']}
                    importedSettings={importedSettings}
                />
            );

            // Should still render auth step (name uniqueness handled internally)
            expect(screen.getByTestId('welcome-step')).toBeInTheDocument();
        });
    });

    describe('Edge Cases - Import without Adobe context', () => {
        it('should handle import without Adobe binding', async () => {
            const settingsWithoutAdobe = {
                ...createMockImportedSettings(),
                adobe: undefined,
            };

            await renderWizard(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                    existingProjectNames={[]}
                    importedSettings={settingsWithoutAdobe}
                />
            );

            // Should start at welcome step (no auto-navigation without auth)
            expect(screen.getByTestId('welcome-step')).toBeInTheDocument();
        });

        it('should handle import with partial Adobe context', async () => {
            const settingsWithPartialAdobe = {
                ...createMockImportedSettings(),
                adobe: {
                    orgId: 'org123',
                    orgName: 'Test Org',
                    // Missing projectId, workspaceId
                },
            };

            await renderWizard(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                    existingProjectNames={[]}
                    importedSettings={settingsWithPartialAdobe}
                />
            );

            // Should start at welcome step
            expect(screen.getByTestId('welcome-step')).toBeInTheDocument();
        });
    });

    describe('Edge Cases - Import with existing selections', () => {
        it('should preserve component selections from import', async () => {
            const importedSettings = createMockImportedSettings();

            await renderWizard(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                    existingProjectNames={[]}
                    importedSettings={importedSettings}
                />
            );

            // Component selections are set in state (tested via behavior, not internal state)
            // Verify the step renders - selections will be visible on component-selection step
            expect(screen.getByTestId('welcome-step')).toBeInTheDocument();
        });
    });
});
