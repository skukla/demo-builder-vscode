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
import { card, renderGrid, resetGridMocks, twoDeployed } from './IntegrationsGrid.testUtils';

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
                mesh.compareDocumentPosition(integration) & Node.DOCUMENT_POSITION_FOLLOWING
            ).toBeTruthy();
        });

        it('renders no mesh card when no mesh status display is supplied', () => {
            renderGrid({ appBuilderComponents: twoDeployed() });

            expect(screen.queryByRole('button', { name: /API Mesh/ })).not.toBeInTheDocument();
        });

        it('gives the mesh card the same chrome as the rest', () => {
            renderGrid({ withMesh: true, appBuilderComponents: twoDeployed() });

            // Card families should read alike; the mesh earns no accent border.
            expect(card('API Mesh', 'Deployed').className).toBe(
                card('custom-app', 'Deployed').className
            );
        });

        it('renders nothing after the last card — the add tile is gone', () => {
            // The grid offers no add affordance; the sticky header's button is
            // the single door. See IntegrationsGrid-actions.test.tsx.
            const { container } = renderGrid({ appBuilderComponents: twoDeployed() });

            expect(screen.queryByTestId('integration-add-tile')).not.toBeInTheDocument();
            const grid = container.querySelector('.integrations-grid') as HTMLElement;
            expect(grid.querySelectorAll(':scope > *')).toHaveLength(2);
        });
    });
});
