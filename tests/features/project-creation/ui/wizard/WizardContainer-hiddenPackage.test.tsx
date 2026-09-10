// Import mocks FIRST - before any component imports (suite convention; the
// jest.mock calls live in WizardContainer.mocks and must execute before the SUT
// binds to real Spectrum).
import './WizardContainer.mocks';

import { cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { getPackageById } from '@/features/project-creation/ui/helpers/demoPackageLoader';
import { WizardContainer } from '@/features/project-creation/ui/wizard/WizardContainer';
import '@testing-library/jest-dom';
import {
    createMockComponentDefaults,
    createMockWizardSteps,
    setupTest,
    cleanupTest,
    renderWizard,
} from './WizardContainer.testUtils';

/**
 * A project on a HIDDEN package must still see its own package.
 *
 * `getSelectablePackages()` drops anything marked `hidden`. That is right for
 * the new-project picker — hidden means "not offered yet" — and wrong for a
 * project already using one: Configure rendered the project with no brand at
 * all, so it looked like the project had lost its package. Reported live
 * 2026-08-16 on a Bodea project, where `bodea` carries `hidden: true` pending a
 * storefront redesign.
 *
 * The loader's own docstring already stated the rule the wizard was breaking:
 * "a hidden package must still resolve by id so existing projects keep working."
 *
 * The fix resolves ONLY the current package, never every hidden one — hidden
 * still means not selectable, so a project sees what it has without being
 * offered a switch to something unreleased.
 *
 * Asserted on the LOOKUP rather than on rendered output because the step
 * components are stubbed in this suite's mocks; the lookup is the behaviour that
 * distinguishes fixed from broken.
 */
describe('WizardContainer — a project on a hidden package', () => {
    /** Edit mode is what sets `wizardMode: 'edit'` and seeds `selectedPackage`. */
    const editProjectOn = (packageId: string) => ({
        projectName: 'demo',
        projectPath: '/projects/demo',
        settings: { selectedPackage: packageId, selectedStack: 'test-stack' },
    });

    /**
     * `setupTest()` calls `jest.resetAllMocks()`, which strips IMPLEMENTATIONS,
     * not just recorded calls — so the shared mock's `getPackageById` comes back
     * returning `undefined` and the component's `.then()` throws. Re-establish it
     * AFTER setupTest, never before.
     */
    beforeEach(() => {
        setupTest();
        (getPackageById as jest.Mock).mockImplementation(async (id: string) =>
            id === 'test-package' ? { id: 'test-package', name: 'Test Package' } : { id, name: id }
        );
    });

    afterEach(async () => {
        cleanup();
        await cleanupTest();
    });

    it('resolves its own package by id when the selectable list omits it', async () => {
        await renderWizard(
            <WizardContainer
                componentDefaults={createMockComponentDefaults()}
                wizardSteps={createMockWizardSteps()}
                editProject={editProjectOn('hidden-brand')}
            />
        );

        await waitFor(() => {
            expect(getPackageById).toHaveBeenCalledWith('hidden-brand');
        });
    });

    /**
     * CONTROL. A package already in the selectable list must NOT trigger the
     * lookup. Without this, the test above would also pass against a component
     * that called `getPackageById` unconditionally — which would prove nothing
     * about hidden packages.
     */
    it('CONTROL — does not look up a package the selectable list already has', async () => {
        await renderWizard(
            <WizardContainer
                componentDefaults={createMockComponentDefaults()}
                wizardSteps={createMockWizardSteps()}
                editProject={editProjectOn('test-package')}
            />
        );

        await waitFor(() => {
            expect(document.querySelector('body')).toBeTruthy();
        });
        expect(getPackageById).not.toHaveBeenCalledWith('test-package');
    });

    it('looks nothing up when the project has no package selected', async () => {
        await renderWizard(
            <WizardContainer
                componentDefaults={createMockComponentDefaults()}
                wizardSteps={createMockWizardSteps()}
            />
        );

        await waitFor(() => {
            expect(document.querySelector('body')).toBeTruthy();
        });
        expect(getPackageById).not.toHaveBeenCalled();
    });
});
