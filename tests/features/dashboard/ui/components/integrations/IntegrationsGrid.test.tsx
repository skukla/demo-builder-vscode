/**
 * IntegrationsGrid Tests — composition + live push channels
 * (integrations grid, Step 7 — the cutover)
 *
 * The grid that supersedes AppBuilderComponentsList: a card per integration
 * (mesh card FIRST), the add tile as the last cell (it IS the empty state), and
 * the two channels that keep it current:
 * The two live push channels and the card derivation they feed moved to
 * IntegrationsScreen (the screen owns the data, the grid renders it), so their
 * tests live in IntegrationsScreen.test.tsx.
 *
 * Detail panel, action dispatch, dialogs, rename, and the add flow live in
 * IntegrationsGrid-actions.test.tsx; the shared harness in
 * IntegrationsGrid.testUtils.tsx.
 *
 * Strict TDD: written BEFORE the component exists.
 */

import { screen } from '@testing-library/react';
import {
    card,
    renderGrid,
    resetGridMocks,
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

    });


});
