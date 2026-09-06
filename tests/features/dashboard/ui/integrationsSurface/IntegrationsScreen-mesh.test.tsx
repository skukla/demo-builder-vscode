/**
 * The integrations surface — the MESH card and the workspace eventing section.
 *
 * Split from `IntegrationsScreen.test.tsx` (750-line CI limit). Both subjects
 * were unreachable until the harness learned to push a mesh status: the screen
 * renders a mesh card only when `useDashboardStatus` derives a
 * `meshStatusDisplay`, which needs `mesh` on the statusUpdate payload.
 *
 * Mocks and helpers live in `IntegrationsScreen.testUtils.tsx`.
 */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import {
    DEPLOYED,
    IntegrationsScreen,
    MESH,
    captureHandlers,
    resetIntegrationsScreenMocks,
    settleStatus,
} from './IntegrationsScreen.testUtils';

beforeEach(() => {
    resetIntegrationsScreenMocks();
});

describe('IntegrationsScreen — the mesh card', () => {
    it('puts the mesh card ahead of the integrations once a mesh status arrives', () => {
        const handlers = captureHandlers();
        render(
            <IntegrationsScreen
                hasAdobeContext
                appBuilderComponents={{ 'api-mesh': MESH, 'erp-sync': DEPLOYED }}
            />
        );
        settleStatus(handlers, { status: 'deployed' });

        // The mesh card is synthesized by the screen (id 'mesh'), not derived
        // from the keyed entry — so its presence pins the whole branch.
        expect(screen.getByTestId('card-mesh')).toHaveTextContent('API Mesh');
        expect(screen.getByTestId('card-erp-sync')).toBeInTheDocument();
    });

    it('renders no mesh card while the project has no mesh status', () => {
        const handlers = captureHandlers();
        render(
            <IntegrationsScreen
                hasAdobeContext
                appBuilderComponents={{ 'api-mesh': MESH, 'erp-sync': DEPLOYED }}
            />
        );
        settleStatus(handlers);

        expect(screen.queryByTestId('card-mesh')).not.toBeInTheDocument();
        expect(screen.getByTestId('card-erp-sync')).toBeInTheDocument();
    });

    /**
     * The BUSY argument the screen computes for `deriveMeshCard`.
     *
     * `isMeshBusy(meshStatus) || isTransitioning` is passed as
     * `isActionDisabled`, and `meshMenuActions` returns an EMPTY list for a busy
     * mesh. So the menu is the only place the argument shows, which is why the
     * grid mock surfaces it — asserting the card's text would have agreed with
     * every mutation of that expression.
     */
    it('offers the mesh menu on a settled mesh', () => {
        const handlers = captureHandlers();
        render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{ 'api-mesh': MESH }} />);
        settleStatus(handlers, { status: 'deployed' });

        expect(screen.getByTestId('card-mesh')).toHaveAttribute(
            'data-actions',
            'redeploy,remove'
        );
    });

    it('withholds the mesh menu while a deploy is in flight', () => {
        const handlers = captureHandlers();
        render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{ 'api-mesh': MESH }} />);
        settleStatus(handlers, { status: 'deploying' });

        // Not transitioning — the busy read comes from the mesh status alone,
        // so an `&&` between the two operands would offer actions here.
        expect(screen.getByTestId('card-mesh')).toHaveAttribute('data-actions', '');
    });
});

describe('IntegrationsScreen — workspace eventing', () => {
    it('renders the eventing section for a project with an Adobe context', () => {
        const handlers = captureHandlers();
        render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} />);
        settleStatus(handlers);

        expect(screen.getByTestId('eventing-section')).toBeInTheDocument();
    });

    // Without a context the handler can only answer "unavailable", and a section
    // whose sole state is its own absence is noise.
    it('withholds it from a project with none', () => {
        const handlers = captureHandlers();
        render(<IntegrationsScreen appBuilderComponents={{ a: DEPLOYED }} />);
        settleStatus(handlers);

        expect(screen.queryByTestId('eventing-section')).not.toBeInTheDocument();
    });
});
