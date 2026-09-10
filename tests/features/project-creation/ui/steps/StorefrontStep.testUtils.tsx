/**
 * Shared fixtures for the StorefrontStep suites.
 *
 * The step's whole block-library half is gated on ONE derived fact — whether
 * the selected stack's frontend is `eds-storefront` — so every fixture here
 * comes in an EDS and a non-EDS form, and a suite that only ever builds the EDS
 * one is measuring half the step.
 *
 * `jest.mock` calls deliberately stay in each suite: a mock only hoists above
 * the imports of the file it appears in.
 */

import type { DemoPackage, GitSource } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

export const gitSource: GitSource = {
    type: 'git',
    url: 'https://github.com/test/repo',
    branch: 'main',
    gitOptions: { shallow: true },
};

/** The frontend id the block-library sub-step is gated on. */
export const EDS_FRONTEND_ID = 'eds-storefront';

export const edsStack: Stack = {
    id: 'eds-paas',
    name: 'EDS + PaaS',
    description: 'Edge Delivery with PaaS backend',
    frontend: EDS_FRONTEND_ID,
    backend: 'adobe-commerce-paas',
    dependencies: [],
    optionalDependencies: [],
    optionalAddons: [],
    requiresGitHub: true,
    requiresDaLive: true,
};

export const veniaStack: Stack = {
    id: 'venia-paas',
    name: 'Venia + PaaS',
    description: 'Venia with PaaS backend',
    frontend: 'venia',
    backend: 'adobe-commerce-paas',
    dependencies: [],
    optionalDependencies: [],
    optionalAddons: [],
};

export const citisignal: DemoPackage = {
    id: 'citisignal',
    name: 'CitiSignal',
    description: 'A test package',
    configDefaults: {},
    storefronts: {
        'eds-paas': { name: 'CS EDS', description: '', source: gitSource },
        'venia-paas': { name: 'CS Venia', description: '', source: gitSource },
    },
};

export const bodea: DemoPackage = {
    id: 'bodea',
    name: 'Bodea',
    description: 'A second package, so a lookup that ignores its id is visible',
    configDefaults: {},
    storefronts: {
        'eds-paas': { name: 'Bodea EDS', description: '', source: gitSource },
    },
};

/**
 * Decoys first, on purpose: with the wanted entry at index 0 a `find` whose
 * predicate is ignored still lands on it, and the test proves nothing.
 */
export const PACKAGES: DemoPackage[] = [bodea, citisignal];
export const STACKS: Stack[] = [veniaStack, edsStack];

export function storefrontState(initial: Partial<WizardState> = {}): WizardState {
    return {
        currentStep: 'storefront',
        projectName: '',
        selectedPackage: 'citisignal',
        selectedStack: 'eds-paas',
        adobeAuth: { isAuthenticated: false, isChecking: false },
        edsConfig: {
            accsHost: '',
            storeViewCode: '',
            customerGroup: '',
            repoName: '',
            daLiveOrg: '',
            daLiveSite: '',
            repoMode: 'existing',
            githubAuth: { isAuthenticated: false },
        },
        ...initial,
    } as WizardState;
}
