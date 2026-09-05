/**
 * StorefrontSetupStep — the start request, on mount and on retry.
 *
 * The step sends `storefront-setup-start` from two places: once on mount from a
 * snapshot taken at mount time, and again from the Retry button using whatever
 * the wizard holds NOW. Both build the same payload, and the field that has to
 * be derived rather than copied is `dependencies` — the mesh rides
 * `selectedAppBuilderComponents` (D3) and the wire's dependency list still has
 * to carry it for the handler's mesh gate, while every other App Builder
 * selection must stay out of it.
 *
 * These assert the ARGUMENT the extension receives, not that a post happened.
 */

import {
    COMPLETE_EDS_CONFIG,
    cancelPayloads,
    pushError,
    renderStep,
    resetDriver,
    startPayloads,
} from './StorefrontSetupStep.driver.testUtils';
import { fireEvent, screen } from '@testing-library/react';
import type { WizardState } from '@/types/webview';

beforeEach(() => {
    resetDriver();
});

/** A wizard that has picked a backend, a mesh, and a non-mesh App Builder app. */
const RICH_STATE: Partial<WizardState> = {
    projectName: 'citisignal-demo',
    componentConfigs: { 'adobe-commerce-paas': { host: 'https://commerce.example.test' } },
    components: { backend: 'adobe-commerce-paas', dependencies: ['api-mesh-shared'] },
    selectedAppBuilderComponents: ['eds-commerce-mesh', 'app-builder-shell'],
    selectedAddons: ['adobe-commerce-aco'],
    selectedBlockLibraries: ['isle5'],
    customBlockLibraries: [
        { name: 'Demo Team Blocks', source: { owner: 'demo-team', repo: 'blocks', branch: 'main' } },
    ],
    selectedPackage: 'citisignal',
    selectedStack: 'eds-paas',
};

const RICH_PAYLOAD = {
    projectName: 'citisignal-demo',
    edsConfig: COMPLETE_EDS_CONFIG,
    componentConfigs: { 'adobe-commerce-paas': { host: 'https://commerce.example.test' } },
    backendComponentId: 'adobe-commerce-paas',
    // The stack's own dependency, plus the mesh lifted out of the App Builder
    // selection. 'app-builder-shell' is an App Builder app, not a mesh, and does
    // not belong on this list.
    dependencies: ['api-mesh-shared', 'eds-commerce-mesh'],
    selectedAddons: ['adobe-commerce-aco'],
    selectedBlockLibraries: ['isle5'],
    customBlockLibraries: [
        { name: 'Demo Team Blocks', source: { owner: 'demo-team', repo: 'blocks', branch: 'main' } },
    ],
    selectedPackage: 'citisignal',
    selectedStack: 'eds-paas',
};

/** Get to the Retry button: it only exists on the failure screen. */
function failThenRetry(): void {
    pushError({ message: 'Pipeline stopped', error: 'GitHub returned 500' });
    fireEvent.click(screen.getByText('Retry'));
}

describe('StorefrontSetupStep — the start request on mount', () => {
    it('sends every selection the wizard made', () => {
        renderStep({ state: RICH_STATE });

        expect(startPayloads()).toEqual([RICH_PAYLOAD]);
    });

    it('sends an empty dependency list when nothing was selected', () => {
        renderStep();

        expect(startPayloads()).toHaveLength(1);
        expect(startPayloads()[0].dependencies).toEqual([]);
        expect(startPayloads()[0].backendComponentId).toBeUndefined();
    });

    it('starts exactly once even when the mount effect is invoked twice', () => {
        renderStep({ strict: true });

        expect(startPayloads()).toHaveLength(1);
    });
});

describe('StorefrontSetupStep — the start request on retry', () => {
    it('rebuilds the same payload from the wizard state', () => {
        renderStep({ state: RICH_STATE });

        failThenRetry();

        expect(startPayloads()).toHaveLength(2);
        expect(startPayloads()[1]).toEqual(RICH_PAYLOAD);
    });

    it('handles a wizard that has selected no components at all', () => {
        renderStep();

        failThenRetry();

        expect(startPayloads()).toHaveLength(2);
        expect(startPayloads()[1].dependencies).toEqual([]);
        expect(startPayloads()[1].backendComponentId).toBeUndefined();
    });

    it('uses the selections the wizard holds now, not the ones it mounted with', () => {
        const { rerenderWith } = renderStep();

        rerenderWith({ state: RICH_STATE });
        failThenRetry();

        expect(startPayloads()[1]).toEqual(RICH_PAYLOAD);
    });

    it('returns to a running state with the setup bookkeeping cleared', () => {
        const { unmount } = renderStep();

        failThenRetry();

        const loader = screen.getByTestId('loading');
        expect(loader).toHaveTextContent('Retrying storefront setup...');
        expect(loader).toHaveAttribute('data-progress', '0');
        expect(screen.queryByText('Storefront Setup Failed')).not.toBeInTheDocument();

        unmount();
        expect(cancelPayloads().at(-1)?.partialState).toEqual({
            repoCreated: false,
            contentCopied: false,
            phase: 'idle',
        });
    });

    it('refuses to retry an incomplete configuration', () => {
        renderStep({ state: { edsConfig: { ...COMPLETE_EDS_CONFIG, daLiveSite: '' } } });
        // The mount guard already refused, so the failure screen is showing.
        expect(startPayloads()).toHaveLength(0);

        fireEvent.click(screen.getByText('Retry'));

        expect(startPayloads()).toHaveLength(0);
        expect(
            screen.getByText(
                'Storefront configuration is incomplete — go back and finish the Storefront step.',
            ),
        ).toBeInTheDocument();
    });
});
