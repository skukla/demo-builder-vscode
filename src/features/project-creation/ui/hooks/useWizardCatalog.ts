/**
 * What the wizard offers to pick from: the demo packages and stacks, loaded
 * once on mount (`useWizardCatalog`), and the cards the Welcome grid shows —
 * the selectable catalog, the project's OWN package when it is hidden, and the
 * demos the SC added from a link (`usePackageCards`).
 *
 * Two hooks rather than one because `stacks` must exist BEFORE `useWizardState`
 * runs (it feeds step filtering), while the hidden-package lookup needs the
 * `selectedPackage` that only `useWizardState` provides. The container calls the
 * first above its state hook and the second below it.
 *
 * Moved out of WizardContainer.tsx on 2026-10-08 (EDS-8).
 *
 * @module features/project-creation/ui/hooks/useWizardCatalog
 */

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { loadStacks } from '../helpers/brandStackLoader';
import { getPackageById, getSelectablePackages } from '../helpers/demoPackageLoader';
import { addedDemoCards } from '../wizard/addedDemoCards';
import type { DemoPackage } from '@/types/demoPackages';
import { ADDED_DEMO_ID_PREFIX, type AddedDemo } from '@/types/projectFile';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

export interface WizardCatalog {
    packages: DemoPackage[];
    setPackages: Dispatch<SetStateAction<DemoPackage[]>>;
    stacks: Stack[];
    /**
     * Distinguishes "no packages yet" from "loaded, and this one is absent" —
     * the hidden-package effect cannot tell them apart from an empty array,
     * and without this it fires a lookup for EVERY project before the list lands.
     */
    packagesLoaded: boolean;
}

/** Packages and stacks - loaded once on mount. */
export function useWizardCatalog(): WizardCatalog {
    const [packages, setPackages] = useState<DemoPackage[]>([]);
    const [stacks, setStacks] = useState<Stack[]>([]);
    const [packagesLoaded, setPackagesLoaded] = useState(false);
    useEffect(() => {
        getSelectablePackages().then((loaded) => {
            setPackages(loaded);
            setPackagesLoaded(true);
        });
        loadStacks().then(setStacks);
    }, []);
    return { packages, setPackages, stacks, packagesLoaded };
}

/**
 * The grid's cards: the shipped catalog, then the remembered demos.
 *
 * A project already ON a hidden package must still see it.
 *
 * `getSelectablePackages()` drops anything marked `hidden`, which is right for
 * the NEW-project picker and wrong for a project that already uses one:
 * Configure rendered no brand at all, so the project appeared to have lost its
 * package. `demoPackageLoader`'s own docstring already states the rule — "a
 * hidden package must still resolve by id so existing projects keep working" —
 * the wizard just never applied it.
 *
 * Appends only the CURRENT package, never every hidden one: hidden still means
 * "not selectable", so this restores what the project has without offering a
 * switch to something unreleased.
 *
 * @param catalog - the loaded packages (with their setter and loaded flag)
 * @param addedDemos - the remembered demos (`addedDemoCards` says which become cards)
 * @param state - the wizard state; reads `selectedPackage`, `demo` and `selectedStack`
 * @returns every card the Welcome grid shows
 */
export function usePackageCards({
    catalog: { packages, setPackages, packagesLoaded },
    addedDemos,
    state,
}: {
    catalog: Pick<WizardCatalog, 'packages' | 'setPackages' | 'packagesLoaded'>;
    addedDemos: AddedDemo[];
    state: WizardState;
}): DemoPackage[] {
    const currentPackageId = state.selectedPackage;
    useEffect(() => {
        // Wait for the selectable list — an empty `packages` on first render is
        // "not loaded", not "absent", and acting on it looks up every project's
        // package needlessly. A control test caught exactly that.
        if (!packagesLoaded || !currentPackageId) return;
        // An added demo's card comes from its row, never from the catalog.
        if (currentPackageId.startsWith(ADDED_DEMO_ID_PREFIX)) return;
        if (packages.some((p) => p.id === currentPackageId)) return;
        let cancelled = false;
        void getPackageById(currentPackageId).then((own) => {
            if (!cancelled && own) {
                setPackages((prev) => (prev.some((p) => p.id === own.id) ? prev : [...prev, own]));
            }
        });
        return () => {
            cancelled = true;
        };
    }, [currentPackageId, packages, packagesLoaded, setPackages]);

    // The grid's cards: the shipped catalog, then the remembered demos (`addedDemoCards`
    // says which, and why a project's own row survives a removed setting).
    const addedDemoPackages = useMemo(
        () => addedDemoCards(addedDemos, state.demo, state.selectedStack),
        [addedDemos, state.demo, state.selectedStack],
    );
    return useMemo(
        () => (addedDemoPackages.length === 0 ? packages : [...packages, ...addedDemoPackages]),
        [packages, addedDemoPackages],
    );
}
