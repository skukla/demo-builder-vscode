/**
 * WelcomeStep — the three things it derives from the selected demo package.
 *
 *  1. `packageConfigDefaults` (the brand's store codes) on the EDIT path, where the
 *     manifest rehydrates `selectedPackage` but never carried the defaults.
 *  2. `edsConfig` from the package's storefront entry for the chosen stack.
 *  3. the whole set of architecture-derived selections it CLEARS when the SC picks a
 *     different brand.
 *
 * Each is written from a catalog lookup, so each test asserts the values that reach
 * `updateState` — the wrong package found is otherwise indistinguishable from the right
 * one. `PACKAGES` puts `citisignal` second for exactly that reason.
 *
 * Spectrum is stubbed globally via jest `moduleNameMapper`; the catalog arrives as a
 * prop, so no bundled JSON is involved.
 */

import { fireEvent, screen } from '@testing-library/react';
import type { WizardState } from '@/types/webview';
import {
    CITISIGNAL_PACKAGE,
    PACKAGES,
    PACKAGE_WITHOUT_STOREFRONTS,
    STACKS,
    renderWelcome,
} from './WelcomeStep.testUtils';
import '@testing-library/jest-dom';

/** The last update that carried `key`, or undefined if none did. */
function lastUpdateWith(updateState: jest.Mock, key: string): Record<string, unknown> | undefined {
    const calls = updateState.mock.calls.filter((c) => c[0] && key in c[0]);
    return calls.length ? calls[calls.length - 1][0] : undefined;
}

function clickCard(name: RegExp) {
    fireEvent.click(screen.getByRole('button', { name }));
}

describe('WelcomeStep — filling packageConfigDefaults on the edit path', () => {
    it('fills them from the package the manifest names', () => {
        const { updateState } = renderWelcome({
            state: { selectedPackage: 'citisignal' },
            packages: PACKAGES,
            stacks: STACKS,
        });

        expect(updateState).toHaveBeenCalledWith({
            packageConfigDefaults: CITISIGNAL_PACKAGE.configDefaults,
        });
    });

    it('leaves defaults the manifest already carries alone', () => {
        const { updateState } = renderWelcome({
            state: {
                selectedPackage: 'citisignal',
                packageConfigDefaults: { ADOBE_COMMERCE_STORE_VIEW_CODE: 'kept_by_the_manifest' },
            },
            packages: PACKAGES,
            stacks: STACKS,
        });

        expect(lastUpdateWith(updateState, 'packageConfigDefaults')).toBeUndefined();
    });

    it('treats an EMPTY defaults object as not yet filled', () => {
        const { updateState } = renderWelcome({
            state: { selectedPackage: 'citisignal', packageConfigDefaults: {} },
            packages: PACKAGES,
            stacks: STACKS,
        });

        expect(updateState).toHaveBeenCalledWith({
            packageConfigDefaults: CITISIGNAL_PACKAGE.configDefaults,
        });
    });

    it('waits for the catalog rather than reading a list that has not loaded', () => {
        const { updateState } = renderWelcome({
            state: { selectedPackage: 'citisignal' },
            packages: undefined,
            stacks: STACKS,
        });

        expect(lastUpdateWith(updateState, 'packageConfigDefaults')).toBeUndefined();
    });

    it('fills them when the package is chosen after the first render', () => {
        const { updateState, rerender } = renderWelcome({
            state: { selectedPackage: undefined },
            packages: PACKAGES,
            stacks: STACKS,
        });
        expect(lastUpdateWith(updateState, 'packageConfigDefaults')).toBeUndefined();

        rerender({
            state: { selectedPackage: 'citisignal' },
            packages: PACKAGES,
            stacks: STACKS,
        });

        expect(updateState).toHaveBeenCalledWith({
            packageConfigDefaults: CITISIGNAL_PACKAGE.configDefaults,
        });
    });
});

describe('WelcomeStep — deriving edsConfig from the package storefront', () => {
    const edsState: Partial<WizardState> = {
        selectedPackage: 'citisignal',
        selectedStack: 'eds-paas',
        packageConfigDefaults: CITISIGNAL_PACKAGE.configDefaults,
    };

    it('takes the template from the SELECTED package, not the first one in the catalog', () => {
        const { updateState } = renderWelcome({
            state: edsState,
            packages: PACKAGES,
            stacks: STACKS,
        });

        const update = lastUpdateWith(updateState, 'edsConfig');
        expect((update?.edsConfig as { templateRepo?: string })?.templateRepo).toBe(
            'citisignal-eds',
        );
    });

    it('does not fire for a non-EDS stack the package does have a storefront for', () => {
        const { updateState } = renderWelcome({
            state: { ...edsState, selectedStack: 'headless-paas' },
            packages: PACKAGES,
            stacks: STACKS,
        });

        expect(lastUpdateWith(updateState, 'edsConfig')).toBeUndefined();
    });

    it('waits for the catalog rather than reading a list that has not loaded', () => {
        const { updateState } = renderWelcome({
            state: edsState,
            packages: undefined,
            stacks: STACKS,
        });

        expect(lastUpdateWith(updateState, 'edsConfig')).toBeUndefined();
    });

    it('derives nothing when the manifest names a package the catalog no longer has', () => {
        const { updateState } = renderWelcome({
            state: { ...edsState, selectedPackage: 'retired-brand' },
            packages: PACKAGES,
            stacks: STACKS,
        });

        expect(lastUpdateWith(updateState, 'edsConfig')).toBeUndefined();
    });

    it('derives nothing when the catalog entry carries no storefronts block', () => {
        const { updateState } = renderWelcome({
            state: edsState,
            packages: [PACKAGE_WITHOUT_STOREFRONTS],
            stacks: STACKS,
        });

        expect(lastUpdateWith(updateState, 'edsConfig')).toBeUndefined();
    });

    it('derives it when the stack changes to EDS after the first render', () => {
        const { updateState, rerender } = renderWelcome({
            state: { ...edsState, selectedStack: 'headless-paas' },
            packages: PACKAGES,
            stacks: STACKS,
        });
        expect(lastUpdateWith(updateState, 'edsConfig')).toBeUndefined();

        rerender({ state: edsState, packages: PACKAGES, stacks: STACKS });

        const update = lastUpdateWith(updateState, 'edsConfig');
        expect((update?.edsConfig as { templateRepo?: string })?.templateRepo).toBe(
            'citisignal-eds',
        );
    });
});

describe('WelcomeStep — picking a brand', () => {
    const startedOnDefault: Partial<WizardState> = {
        selectedPackage: 'default',
        packageConfigDefaults: { ADOBE_COMMERCE_STORE_VIEW_CODE: 'default_us' },
        componentConfigs: {
            'commerce-backend': {
                ADOBE_COMMERCE_STORE_VIEW_CODE: 'default_us',
                ADOBE_COMMERCE_WEBSITE_CODE: 'default',
                SC_ENTERED_VALUE: 'keep-me',
            },
        },
    };

    it('records the brand that was clicked, with ITS config defaults', () => {
        const { updateState } = renderWelcome({
            state: startedOnDefault,
            packages: PACKAGES,
            stacks: STACKS,
        });

        clickCard(/CitiSignal/);

        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({
                selectedPackage: 'citisignal',
                packageConfigDefaults: CITISIGNAL_PACKAGE.configDefaults,
            }),
        );
    });

    it('clears BOTH brands’ config keys and keeps what the SC typed', () => {
        const { updateState } = renderWelcome({
            state: startedOnDefault,
            packages: PACKAGES,
            stacks: STACKS,
        });

        clickCard(/CitiSignal/);

        const update = lastUpdateWith(updateState, 'componentConfigs');
        expect(update?.componentConfigs).toEqual({
            'commerce-backend': { SC_ENTERED_VALUE: 'keep-me' },
        });
    });

    it('does nothing when the brand already chosen is clicked again', () => {
        const { updateState } = renderWelcome({
            state: {
                selectedPackage: 'citisignal',
                packageConfigDefaults: CITISIGNAL_PACKAGE.configDefaults,
            },
            packages: PACKAGES,
            stacks: STACKS,
        });
        updateState.mockClear();

        clickCard(/CitiSignal/);

        expect(updateState).not.toHaveBeenCalled();
    });

    it('reads the brand chosen NOW, not the one chosen on the first render', () => {
        const { updateState, rerender } = renderWelcome({
            state: { selectedPackage: undefined },
            packages: PACKAGES,
            stacks: STACKS,
        });

        rerender({
            state: {
                selectedPackage: 'citisignal',
                packageConfigDefaults: CITISIGNAL_PACKAGE.configDefaults,
            },
            packages: PACKAGES,
            stacks: STACKS,
        });
        updateState.mockClear();

        clickCard(/CitiSignal/);

        expect(updateState).not.toHaveBeenCalled();
    });
});
