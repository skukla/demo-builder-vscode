/**
 * Shared fixtures + setup for the useProjectBuilder suites
 * (useProjectBuilder.test.ts — mesh selection/stack select;
 * useProjectBuilder.instances.test.ts — instance add/remove/rename).
 *
 * NOTE: `jest.mock` calls are per-file and stay in each test file; only the
 * mock-free fixtures and the renderHook wrapper live here (same pattern as
 * appBuilderComponentRunner.testUtils.ts).
 */

import { renderHook } from '@testing-library/react';
import { useProjectBuilder } from '@/features/project-creation/ui/steps/useProjectBuilder';
import { COMPONENT_IDS } from '@/core/constants';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { DemoPackage, GitSource } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

const mockGitSource: GitSource = {
    type: 'git',
    url: 'https://github.com/test/repo',
    branch: 'main',
    gitOptions: { shallow: true },
};

export const edsStack: Stack = {
    id: 'eds-paas',
    name: 'EDS + PaaS',
    description: 'Edge Delivery with PaaS backend',
    frontend: 'eds-storefront',
    backend: 'adobe-commerce-paas',
    dependencies: [],
    optionalDependencies: [COMPONENT_IDS.EDS_COMMERCE_MESH],
    optionalAddons: [
        { id: 'live-search', default: true },
        { id: 'catalog-service', default: false },
    ],
};

export const headlessStack: Stack = {
    id: 'headless-paas',
    name: 'Headless + PaaS',
    description: 'Headless storefront with PaaS backend',
    frontend: 'headless',
    backend: 'adobe-commerce-paas',
    dependencies: [],
    optionalDependencies: [COMPONENT_IDS.HEADLESS_COMMERCE_MESH],
};

export const edsRequiresStack: Stack = {
    id: 'eds-accs',
    name: 'EDS + ACCS',
    description: 'Edge Delivery with ACCS backend',
    frontend: 'eds-storefront',
    backend: 'adobe-commerce-accs',
    dependencies: [],
    requiresGitHub: true,
    requiresDaLive: true,
};

export const citisignal: DemoPackage = {
    id: 'citisignal',
    name: 'CitiSignal',
    description: 'A test package',
    configDefaults: {},
    storefronts: {
        'eds-paas': { name: 'CS EDS', description: '', source: mockGitSource },
        'eds-accs': {
            name: 'CS EDS ACCS',
            description: '',
            source: mockGitSource,
            templateOwner: 'skukla',
            templateRepo: 'citisignal-eds',
        },
    },
};

export const custom: DemoPackage = {
    id: 'custom',
    name: 'Custom',
    description: 'Custom package',
    configDefaults: {},
    storefronts: { 'headless-paas': { name: 'Custom HL', description: '', source: mockGitSource } },
};

/**
 * Package with a REQUIRED addon (`live-search`) and an OPTIONAL one (`foo`).
 * Drives the addon-seeding parity tests: onStackSelect must union the package's
 * required addons with the stack's default optionalAddons.
 */
export const withAddons: DemoPackage = {
    id: 'withAddons',
    name: 'With Addons',
    description: 'A package with required + optional addons',
    configDefaults: {},
    addons: { 'live-search': 'required', foo: 'optional' },
    storefronts: {
        'eds-paas': { name: 'WA EDS', description: '', source: mockGitSource },
        'headless-paas': { name: 'WA HL', description: '', source: mockGitSource },
    },
} as DemoPackage;

export interface SetupExtras {
    onArchitectureChange?: (oldStackId: string, newStackId: string) => void;
    blockLibraryDefaults?: string[];
    customBlockLibraryDefaults?: CustomBlockLibrary[];
    /** Override the catalog the hook resolves stacks and packages against. */
    packages?: DemoPackage[];
    stacks?: Stack[];
}

/**
 * Render the hook with a controlled WizardState. updateState applies the partial
 * to a mutable ref so successive handler calls in one test observe prior writes
 * (mirrors the real reducer's functional update).
 */
export function setup(initial: Partial<WizardState> = {}, extras: SetupExtras = {}) {
    const {
        onArchitectureChange,
        blockLibraryDefaults,
        customBlockLibraryDefaults,
        packages = [citisignal, custom, withAddons],
        stacks = [edsStack, headlessStack, edsRequiresStack],
    } = extras;
    const stateRef: { current: WizardState } = {
        current: {
            currentStep: 'welcome',
            projectName: '',
            selectedPackage: 'citisignal',
            adobeAuth: { isAuthenticated: false, isChecking: false },
            ...initial,
        } as WizardState,
    };
    const updateState = jest.fn((partial: Partial<WizardState>) => {
        stateRef.current = { ...stateRef.current, ...partial };
    });

    const { result, rerender: rerenderHook } = renderHook(
        ({ state, updater }: { state: WizardState; updater: typeof updateState }) =>
            useProjectBuilder(state, updater, {
                packages,
                stacks,
                onArchitectureChange,
                blockLibraryDefaults,
                customBlockLibraryDefaults,
            }),
        { initialProps: { state: stateRef.current, updater: updateState } }
    );

    /** Re-render with a new state, keeping the original updater. */
    const rerender = ({ state }: { state: WizardState }): void =>
        rerenderHook({ state, updater: updateState });

    /**
     * Re-render with a SECOND updater and hand it back.
     *
     * The wizard passes a fresh `updateState` down whenever its own state moves,
     * so a handler memoised without it keeps writing through the updater from the
     * render it was made in — a write that lands nowhere the wizard is reading.
     */
    const swapUpdater = (state: WizardState = stateRef.current): jest.Mock => {
        const next = jest.fn();
        rerenderHook({ state, updater: next as unknown as typeof updateState });
        return next;
    };

    return { result, rerender, swapUpdater, updateState, stateRef };
}
