// Import mocks FIRST - before any component imports (suite convention; the
// jest.mock calls live in WizardContainer.mocks and must execute before the SUT
// binds to real Spectrum).
import '../wizard/WizardContainer.mocks';

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { addedDemoId } from '@/features/components/services/storefrontResolver';
import { getPackageById } from '@/features/project-creation/ui/helpers/demoPackageLoader';
import {
    usePackageCards,
    useWizardCatalog,
} from '@/features/project-creation/ui/hooks/useWizardCatalog';
import { WizardContainer } from '@/features/project-creation/ui/wizard/WizardContainer';
import type { DemoPackage } from '@/types/demoPackages';
import type { AddedDemo } from '@/types/projectFile';
import type { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';
import { makeAddedDemo } from '../../../../helpers/demoPackageFixtures';
import {
    createMockComponentDefaults,
    createMockWizardSteps,
    setupTest,
    cleanupTest,
    renderWizard,
} from '../wizard/WizardContainer.testUtils';

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
 *
 * Driven through the wizard that calls the hook. (Moved from
 * WizardContainer-hiddenPackage on 2026-10-08 when the lookup left the
 * container for `usePackageCards`, EDS-8; the assertions are unchanged.)
 */
describe('usePackageCards — a project on a hidden package', () => {
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

/**
 * The two hooks on their own, against the mocked loaders the wall above
 * installs (one package `test-package`, one stack `test-stack`).
 */
describe('useWizardCatalog', () => {
    beforeEach(() => {
        setupTest();
    });

    afterEach(async () => {
        await cleanupTest();
    });

    it('starts empty and not loaded, then holds the selectable packages and the stacks', async () => {
        const { result } = renderHook(() => useWizardCatalog());

        expect(result.current.packages).toStrictEqual([]);
        expect(result.current.stacks).toStrictEqual([]);
        expect(result.current.packagesLoaded).toBe(false);

        await waitFor(() => {
            expect(result.current.packagesLoaded).toBe(true);
        });
        expect(result.current.packages.map((p) => p.id)).toEqual(['test-package']);
        expect(result.current.stacks.map((s) => s.id)).toEqual(['test-stack']);
    });
});

describe('usePackageCards — the cards the grid shows', () => {
    const JEN = makeAddedDemo();
    const CATALOG: DemoPackage[] = [{ id: 'test-package', name: 'Test Package' } as DemoPackage];
    const setPackages = jest.fn();
    const loaded = { packages: CATALOG, setPackages, packagesLoaded: true };
    const NO_DEMOS: never[] = [];
    const stateOn = (selectedPackage: string | undefined): WizardState =>
        ({ currentStep: 'welcome', projectName: '', selectedPackage, selectedStack: 'test-stack' }) as WizardState;

    beforeEach(() => {
        setupTest();
        (getPackageById as jest.Mock).mockImplementation(async (id: string) => ({ id, name: id }));
    });

    afterEach(async () => {
        await cleanupTest();
    });

    it('hands back the catalog list itself when no demo was added', () => {
        const state = stateOn('test-package');
        const { result } = renderHook(() => usePackageCards({ catalog: loaded, addedDemos: NO_DEMOS, state }));

        expect(result.current).toBe(CATALOG);
    });

    it('appends one card per added demo after the catalog', () => {
        const state = stateOn('test-package');
        const added = [JEN];
        const { result } = renderHook(() => usePackageCards({ catalog: loaded, addedDemos: added, state }));

        expect(result.current.map((p) => p.id)).toEqual(['test-package', addedDemoId(JEN)]);
    });

    it('shows a demo added mid-session as a card on the next render', () => {
        const state = stateOn('test-package');
        const start: { addedDemos: AddedDemo[] } = { addedDemos: NO_DEMOS };
        const { result, rerender } = renderHook(
            ({ addedDemos }: typeof start) => usePackageCards({ catalog: loaded, addedDemos, state }),
            { initialProps: start },
        );
        expect(result.current).toBe(CATALOG);

        rerender({ addedDemos: [JEN] });

        expect(result.current.map((p) => p.id)).toEqual(['test-package', addedDemoId(JEN)]);
    });

    it("never looks an added demo's id up in the catalog", async () => {
        const state = stateOn(addedDemoId(JEN));
        renderHook(() => usePackageCards({ catalog: loaded, addedDemos: [JEN], state }));

        await waitFor(() => {
            expect(document.querySelector('body')).toBeTruthy();
        });
        expect(getPackageById).not.toHaveBeenCalled();
        expect(setPackages).not.toHaveBeenCalled();
    });

    it('appends the resolved own package through the setter, once', async () => {
        const state = stateOn('hidden-brand');
        renderHook(() => usePackageCards({ catalog: loaded, addedDemos: NO_DEMOS, state }));

        await waitFor(() => {
            expect(setPackages).toHaveBeenCalledTimes(1);
        });
        const append = setPackages.mock.calls[0][0] as (prev: DemoPackage[]) => DemoPackage[];
        expect(append(CATALOG).map((p) => p.id)).toEqual(['test-package', 'hidden-brand']);
    });
});
