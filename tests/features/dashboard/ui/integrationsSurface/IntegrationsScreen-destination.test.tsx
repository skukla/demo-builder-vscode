/**
 * The integrations surface — the DESTINATION control.
 *
 * Split out of `IntegrationsScreen.test.tsx` on 2026-09-02: one screen, two subjects, and
 * the combined file sat over the 750-line limit.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import {
    DEPLOYED,
    IntegrationsScreen,
    asDisplayName,
    captureHandlers,
    resetIntegrationsScreenMocks,
    settleStatus,
} from './IntegrationsScreen.testUtils';

beforeEach(() => {
    resetIntegrationsScreenMocks();
});

describe('IntegrationsScreen — destination control', () => {
    const DEST = { projectTitle: 'Kukla Mesh', workspaceTitle: 'Stage' };

    it('offers Change beside the destination in the band', () => {
        const handlers = captureHandlers();
        render(
            <IntegrationsScreen
                hasAdobeContext
                appBuilderComponents={{ a: DEPLOYED }}
                projectName={asDisplayName('demo-builder-test')}
                destination={DEST}
            />
        );
        settleStatus(handlers);

        expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    });

    it('renders no Change when the project has no committed destination', () => {
        // Half a destination is worse than none — it reads as settled.
        const handlers = captureHandlers();
        render(
            <IntegrationsScreen
                hasAdobeContext
                appBuilderComponents={{ a: DEPLOYED }}
                projectName={asDisplayName('demo-builder-test')}
            />
        );
        settleStatus(handlers);

        expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    });

    it('opens the flow in destination mode, not the add journey', () => {
        const handlers = captureHandlers();
        render(
            <IntegrationsScreen
                hasAdobeContext
                appBuilderComponents={{ a: DEPLOYED }}
                projectName={asDisplayName('demo-builder-test')}
                destination={DEST}
            />
        );
        settleStatus(handlers);

        fireEvent.click(screen.getByRole('button', { name: 'Change' }));

        expect(screen.getByTestId('add-modal')).toHaveAttribute('data-mode', 'destination');
    });

    /**
     * Content must start where the project dashboard's does.
     *
     * This surface is one click from that dashboard, and the two disagreed about
     * where content begins — the dashboard anchors left, this one centred inside
     * the shared 960px band, so moving between them shifted everything sideways.
     *
     * The anchor is opt-in via a root class. The stylesheet half is pinned in
     * pageLeftAnchor.test.ts; this pins that the screen actually opts in, which
     * jsdom CAN see.
     */
    it('needs no alignment opt-out — left is the shared default', () => {
        // This screen briefly carried `.page-left-anchored` to match the project
        // dashboard. The default moved instead, so the opt-out is gone; leaving
        // it behind would re-create the trap that made this screen centre in the
        // first place.
        //
        // Status must settle first: the screen renders a full-height loading gate
        // until it arrives, and that branch has no page chrome at all.
        const handlers = captureHandlers();
        const { container } = render(
            <IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} />
        );
        settleStatus(handlers);

        expect(container.querySelector('.page-container-padded')).toBeInTheDocument();
        expect(container.querySelector('.page-left-anchored')).not.toBeInTheDocument();
    });

    /**
     * A search that matches nothing says so, like the projects list does.
     *
     * The grid receives search-FILTERED cards while the empty-state gate reads
     * the unfiltered list, so a no-match search renders the grid with zero
     * cards. That used to leave the dashed add tile sitting alone, which read as
     * "add one" rather than "nothing matched". Removing the tile would have left
     * the area blank, so the message the projects list already shows comes with
     * it — the header count alone ("0 of 2") is not an answer.
     */
    it('says nothing matched when a search filters everything out', () => {
        const handlers = captureHandlers();
        render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} />);
        settleStatus(handlers);

        fireEvent.change(screen.getByLabelText('Filter integrations'), {
            target: { value: 'zzzz-no-match' },
        });

        expect(screen.getByText(/no integrations match/i)).toHaveTextContent('zzzz-no-match');
    });

    it('stays quiet when the search matches something — control', () => {
        const handlers = captureHandlers();
        render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} />);
        settleStatus(handlers);

        expect(screen.queryByText(/no integrations match/i)).not.toBeInTheDocument();
    });

    /**
     * Search shows from the first integration, as on the projects list.
     *
     * The threshold was 6, so a project with two integrations saw no field —
     * leaving the count alone on a row it only occupies as a FALLBACK for having
     * no search (`SearchHeader` puts the count beside the refresh button when
     * `showSearch` is false, and on its own line beneath the field when true).
     * That is why the count's placement read as arbitrary: it was rendering the
     * no-search layout on a screen that otherwise looks like a list.
     *
     * A previous pass argued for keeping 6 — "a search box above three cards is
     * clutter". That weighed the field in isolation and missed that the count
     * position depends on it.
     */
    it('shows the filter field with only two integrations', () => {
        const handlers = captureHandlers();
        render(
            <IntegrationsScreen
                hasAdobeContext
                appBuilderComponents={{ a: DEPLOYED, b: DEPLOYED }}
            />
        );
        settleStatus(handlers);

        expect(screen.getByLabelText('Filter integrations')).toBeInTheDocument();
    });

    it('shows it for a single integration too — the projects-list rule', () => {
        const handlers = captureHandlers();
        render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} />);
        settleStatus(handlers);

        expect(screen.getByLabelText('Filter integrations')).toBeInTheDocument();
    });
});
