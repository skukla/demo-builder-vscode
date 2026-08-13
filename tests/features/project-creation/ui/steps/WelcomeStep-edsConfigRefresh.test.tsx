/**
 * WelcomeStep — the edsConfig refresh effect, and what it must NOT leave behind.
 *
 * The effect re-derives template info from the selected package's storefront, because that
 * info is a function of brand + stack and is deliberately not stored per project. It fires
 * on EDIT, where `useWizardState` rehydrates both `selectedPackage` and `selectedStack`
 * from the manifest (useWizardState.ts:287) — the one path where both are set at once. On a
 * NEW project a package change clears `selectedStack` in the same update
 * (WelcomeStep.tsx:99), so the effect's `eds-` guard cannot pass there.
 *
 * The defect this pins: the effect refreshed 14 storefront-derived fields and silently
 * skipped `codePatches` / `codePatchSource`. A project created before its storefront gained
 * a code patch picked up the new templateOwner and contentPatches on edit but kept the OLD
 * code patches — and those are the PDP link-encoding fixes that
 * `storefrontSetupPhases.ts:282` applies to the repo.
 *
 * Both fields now come from the shared `buildEdsConfigFromStorefront`, whose own suite pins
 * the field set. This suite pins the CALLER: that WelcomeStep routes through it on edit.
 *
 * Spectrum is stubbed globally via jest `moduleNameMapper`, so there is no per-suite mock
 * preamble here; `packages` arrives as a prop, so no bundled-JSON lookup is involved.
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { render } from '@testing-library/react';
import React from 'react';
import { WelcomeStep } from '@/features/project-creation/ui/steps/WelcomeStep';
import type { DemoPackage } from '@/types/demoPackages';
import type { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/hooks/useSelectableDefault', () => ({
    useSelectableDefault: () => ({}),
}));

/** The catalog's CURRENT truth for citisignal/eds-paas — including two code patches. */
const PACKAGES = [
    {
        id: 'citisignal',
        name: 'CitiSignal',
        description: 'Telecommunications demo',
        icon: 'citisignal',
        configDefaults: {},
        storefronts: {
            'eds-paas': {
                name: 'CitiSignal EDS',
                description: 'EDS storefront',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/citisignal',
                    branch: 'main',
                    gitOptions: { shallow: true },
                },
                templateOwner: 'current-owner',
                templateRepo: 'current-repo',
                contentPatches: ['current-content-patch'],
                codePatches: ['product-link-sku-encoding', 'product-teaser-sku-encoding'],
                codePatchSource: { owner: 'skukla', repo: 'eds-demo-patches' },
            },
        },
    },
] as unknown as DemoPackage[];

/** A manifest written before the catalog gained the second code patch. */
const STALE_EDS_CONFIG = {
    accsHost: 'https://commerce.example',
    repoName: 'my-storefront',
    daLiveOrg: 'my-org',
    daLiveSite: 'my-site',
    templateOwner: 'OLD-owner',
    templateRepo: 'OLD-repo',
    contentPatches: ['OLD-content-patch'],
    codePatches: ['product-link-sku-encoding'],
    codePatchSource: { owner: 'skukla', repo: 'eds-demo-patches' },
};

function renderWelcome(updateState: jest.Mock, stackId: string, edsConfig?: object) {
    const state = {
        // Edit mode always rehydrates a name; WelcomeStep reads it unguarded.
        projectName: 'my-commerce-demo',
        selectedPackage: 'citisignal',
        selectedStack: stackId,
        edsConfig,
    } as unknown as WizardState;

    render(
        <Provider theme={defaultTheme}>
            <WelcomeStep
                state={state}
                updateState={updateState}
                setCanProceed={jest.fn()}
                packages={PACKAGES}
                stacks={[]}
            />
        </Provider>
    );
}

/** The edsConfig from the last updateState call that carried one. */
function lastEdsConfig(updateState: jest.Mock): Record<string, unknown> | undefined {
    const calls = updateState.mock.calls.filter((c) => c[0] && 'edsConfig' in c[0]);
    return calls.length ? calls[calls.length - 1][0].edsConfig : undefined;
}

describe('WelcomeStep — edsConfig refresh on the edit path', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('refreshes code patches from the catalog, not just the other template fields', () => {
        const updateState = jest.fn();

        renderWelcome(updateState, 'eds-paas', STALE_EDS_CONFIG);

        const eds = lastEdsConfig(updateState);
        expect(eds).toBeDefined();
        // The regression: these two were the fields left behind.
        expect(eds!.codePatches).toEqual([
            'product-link-sku-encoding',
            'product-teaser-sku-encoding',
        ]);
        expect(eds!.codePatchSource).toEqual({ owner: 'skukla', repo: 'eds-demo-patches' });
    });

    it('refreshes every catalog-derived field together, so none can lag the others', () => {
        const updateState = jest.fn();

        renderWelcome(updateState, 'eds-paas', STALE_EDS_CONFIG);

        const eds = lastEdsConfig(updateState)!;
        // If these refresh but codePatches does not, that IS the drift.
        expect(eds.templateOwner).toBe('current-owner');
        expect(eds.templateRepo).toBe('current-repo');
        expect(eds.contentPatches).toEqual(['current-content-patch']);
        expect(eds.codePatches).toEqual([
            'product-link-sku-encoding',
            'product-teaser-sku-encoding',
        ]);
    });

    it('keeps the user-entered values the manifest carried', () => {
        const updateState = jest.fn();

        renderWelcome(updateState, 'eds-paas', STALE_EDS_CONFIG);

        const eds = lastEdsConfig(updateState)!;
        expect(eds.accsHost).toBe('https://commerce.example');
        expect(eds.repoName).toBe('my-storefront');
        expect(eds.daLiveOrg).toBe('my-org');
        expect(eds.daLiveSite).toBe('my-site');
    });

    it('does not fire for a non-EDS stack', () => {
        const updateState = jest.fn();

        renderWelcome(updateState, 'headless-paas', undefined);

        expect(lastEdsConfig(updateState)).toBeUndefined();
    });
});
