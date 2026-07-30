/**
 * IntegrationsGrid Tests — composition + live push channels
 * (integrations grid, Step 7 — the cutover)
 *
 * The grid that supersedes AppBuilderComponentsList: a card per integration
 * (mesh card FIRST), the add tile as the last cell (it IS the empty state), and
 * the two channels that keep it current:
 *   - `appBuilderComponentStatusUpdate` — per-id in-flight status, including the
 *     update-borne rename label (ported from the retired list suite)
 *   - `appBuilderComponentsSnapshot` — the whole fresh persisted map, which is
 *     what LANDS an added card and DROPS a removed one without a reload
 *
 * Drawer, action dispatch, dialogs, rename, and the add flow live in
 * IntegrationsGrid-actions.test.tsx; the shared harness in
 * IntegrationsGrid.testUtils.tsx.
 *
 * Strict TDD: written BEFORE the component exists.
 */

import { screen, act, within } from '@testing-library/react';
import {
    card,
    captureMessageHandlers,
    DEPLOYED_INTEGRATION,
    openDrawer,
    renderGrid,
    resetGridMocks,
    setupUser,
    twoDeployed,
} from './IntegrationsGrid.testUtils';

beforeEach(() => {
    resetGridMocks();
});

describe('IntegrationsGrid', () => {
    describe('grid composition', () => {
        it('renders one card per integration', () => {
            renderGrid({ appBuilderComponents: twoDeployed() });

            expect(card('custom-app', 'Deployed')).toBeInTheDocument();
            expect(card('other-app', 'Deployed')).toBeInTheDocument();
        });

        it('EXCLUDES a mesh entry from the keyed map (the mesh card comes from mesh props)', () => {
            renderGrid({
                appBuilderComponents: {
                    'commerce-paas-mesh': {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: 'acme', repo: 'mesh' },
                        endpoint: 'https://m',
                    },
                },
            });

            // No mesh props supplied ⇒ no mesh card at all.
            expect(screen.queryByRole('button', { name: /API Mesh/ })).not.toBeInTheDocument();
        });

        it('renders the mesh card FIRST, before the integration cards', () => {
            renderGrid({ appBuilderComponents: twoDeployed(), withMesh: true });

            const mesh = card('API Mesh', 'Deployed');
            const integration = card('custom-app', 'Deployed');
            expect(
                mesh.compareDocumentPosition(integration) & Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
        });

        it('renders no mesh card when no mesh status display is supplied', () => {
            renderGrid({ appBuilderComponents: twoDeployed() });

            expect(screen.queryByRole('button', { name: /API Mesh/ })).not.toBeInTheDocument();
        });

        it('marks the mesh card with the accent class', () => {
            renderGrid({ withMesh: true });

            expect(card('API Mesh', 'Deployed')).toHaveClass('integration-card--mesh');
        });

        it('renders the add tile as the LAST grid cell', () => {
            renderGrid({ appBuilderComponents: twoDeployed(), withMesh: true });

            const tile = screen.getByTestId('integration-add-tile');
            const cards = screen.getAllByRole('button', { name: /, Deployed$/ });
            const last = cards[cards.length - 1];
            expect(
                last.compareDocumentPosition(tile) & Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
        });

        it('renders the add tile as the empty state (no "No integrations yet." copy)', () => {
            renderGrid();

            expect(screen.getByTestId('integration-add-tile')).toBeInTheDocument();
            expect(screen.queryByText(/no integrations yet/i)).not.toBeInTheDocument();
        });

        it('shows the heading with the card count (mesh card included)', () => {
            renderGrid({ appBuilderComponents: twoDeployed(), withMesh: true });

            expect(screen.getByRole('heading', { name: /integrations/i })).toBeInTheDocument();
            expect(screen.getByTestId('integration-count')).toHaveTextContent('3');
        });
    });

    describe('live per-card status updates (appBuilderComponentStatusUpdate)', () => {
        it('flips ONLY the addressed card to deploying with the live message', () => {
            const handlers = captureMessageHandlers();
            renderGrid({ appBuilderComponents: twoDeployed() });

            act(() => {
                handlers.get('appBuilderComponentStatusUpdate')?.({
                    id: 'custom-app',
                    status: 'deploying',
                    message: 'Deploying custom-app…',
                });
            });

            expect(card('custom-app', 'Deploying…')).toBeInTheDocument();
            // The sibling is untouched.
            expect(card('other-app', 'Deployed')).toBeInTheDocument();
        });

        it('ignores malformed updates (no id / no status)', () => {
            const handlers = captureMessageHandlers();
            renderGrid({ appBuilderComponents: twoDeployed() });

            act(() => {
                handlers.get('appBuilderComponentStatusUpdate')?.({ status: 'deploying' });
                handlers.get('appBuilderComponentStatusUpdate')?.({ id: 'custom-app' });
            });

            expect(card('custom-app', 'Deployed')).toBeInTheDocument();
        });

        it('applies an update-borne display name so a rename refreshes the card label live', () => {
            const handlers = captureMessageHandlers();
            renderGrid({
                appBuilderComponents: {
                    'firefly-image-gen': { ...DEPLOYED_INTEGRATION, name: 'Firefly Image Gen' },
                },
            });

            act(() => {
                handlers.get('appBuilderComponentStatusUpdate')?.({
                    id: 'firefly-image-gen',
                    status: 'deployed',
                    name: 'Firefly Video Gen',
                });
            });

            expect(card('Firefly Video Gen', 'Deployed')).toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Firefly Image Gen, Deployed' }),
            ).not.toBeInTheDocument();
        });

        it('keeps a RENAMED label when a later name-less push arrives (rename then redeploy)', () => {
            const handlers = captureMessageHandlers();
            renderGrid({
                appBuilderComponents: {
                    'firefly-image-gen': { ...DEPLOYED_INTEGRATION, name: 'Firefly Image Gen' },
                },
            });

            act(() => {
                handlers.get('appBuilderComponentStatusUpdate')?.({
                    id: 'firefly-image-gen',
                    status: 'deployed',
                    name: 'Firefly Video Gen',
                });
            });
            act(() => {
                handlers.get('appBuilderComponentStatusUpdate')?.({
                    id: 'firefly-image-gen',
                    status: 'deployed',
                });
            });

            expect(card('Firefly Video Gen', 'Deployed')).toBeInTheDocument();
        });

        it('a name-less status update keeps the persisted display name (deploy pushes)', () => {
            const handlers = captureMessageHandlers();
            renderGrid({
                appBuilderComponents: {
                    'firefly-image-gen': { ...DEPLOYED_INTEGRATION, name: 'Firefly Image Gen' },
                },
            });

            act(() => {
                handlers.get('appBuilderComponentStatusUpdate')?.({
                    id: 'firefly-image-gen',
                    status: 'deployed',
                });
            });

            expect(card('Firefly Image Gen', 'Deployed')).toBeInTheDocument();
        });

        it('synthesizes a PENDING card for an unknown-id deploying override (add in flight)', () => {
            const handlers = captureMessageHandlers();
            renderGrid();

            act(() => {
                handlers.get('appBuilderComponentStatusUpdate')?.({
                    id: 'erp-sync',
                    status: 'deploying',
                    message: 'Cloning…',
                });
            });

            // Catalog-resolved name, no persisted entry yet.
            expect(card('ERP Sync', 'Deploying…')).toBeInTheDocument();
        });
    });

    describe('appBuilderComponentsSnapshot channel', () => {
        it('LANDS a card added after the initial seed', () => {
            const handlers = captureMessageHandlers();
            renderGrid({ appBuilderComponents: { 'custom-app': { ...DEPLOYED_INTEGRATION } } });

            act(() => {
                handlers.get('appBuilderComponentsSnapshot')?.({
                    components: {
                        'custom-app': { ...DEPLOYED_INTEGRATION },
                        'new-app': { ...DEPLOYED_INTEGRATION, status: 'not-deployed' },
                    },
                });
            });

            expect(card('new-app', 'Not deployed')).toBeInTheDocument();
        });

        it('DROPS a card removed from the persisted map', () => {
            const handlers = captureMessageHandlers();
            renderGrid({ appBuilderComponents: twoDeployed() });

            act(() => {
                handlers.get('appBuilderComponentsSnapshot')?.({
                    components: { 'custom-app': { ...DEPLOYED_INTEGRATION } },
                });
            });

            expect(card('custom-app', 'Deployed')).toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'other-app, Deployed' }),
            ).not.toBeInTheDocument();
        });

        it('ignores a malformed snapshot (no components map)', () => {
            const handlers = captureMessageHandlers();
            renderGrid({ appBuilderComponents: twoDeployed() });

            act(() => {
                handlers.get('appBuilderComponentsSnapshot')?.({});
            });

            expect(card('custom-app', 'Deployed')).toBeInTheDocument();
            expect(card('other-app', 'Deployed')).toBeInTheDocument();
        });

        it('keeps an OPEN drawer live as snapshots arrive', async () => {
            const user = setupUser();
            const handlers = captureMessageHandlers();
            renderGrid({ appBuilderComponents: { 'custom-app': { ...DEPLOYED_INTEGRATION } } });

            const drawer = await openDrawer(user, 'custom-app', 'Deployed');
            expect(within(drawer).getByText('Deployed')).toBeInTheDocument();

            act(() => {
                handlers.get('appBuilderComponentsSnapshot')?.({
                    components: {
                        'custom-app': { ...DEPLOYED_INTEGRATION, status: 'not-deployed' },
                    },
                });
            });

            expect(within(drawer).getByText('Not deployed')).toBeInTheDocument();
        });

        it('CLOSES the drawer when its card leaves the map', async () => {
            const user = setupUser();
            const handlers = captureMessageHandlers();
            renderGrid({ appBuilderComponents: twoDeployed() });

            await openDrawer(user, 'other-app', 'Deployed');

            act(() => {
                handlers.get('appBuilderComponentsSnapshot')?.({
                    components: { 'custom-app': { ...DEPLOYED_INTEGRATION } },
                });
            });

            expect(
                screen.queryByRole('dialog', { name: 'other-app details' }),
            ).not.toBeInTheDocument();
        });
    });
});
