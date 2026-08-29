/**
 * Remedy tiles: the fix is a BUTTON in the zone, and its dot says whether you
 * need it.
 *
 * First attempt put a StatusCard row inside the zone ("Storefront · Republish
 * needed · Republish"). It dangled off the end of the tile row and broke the
 * grid. The tile dot was already the established answer — IntegrationsSummaryTile
 * does exactly this — but there was no tile to hang a dot on, because both
 * remedies lived elsewhere: Republish Content in the More overflow, Restart
 * nowhere at all. So the fix is to give each remedy a tile.
 *
 * The dot must NOT go on Sync Storefront. Verified: Sync Storefront pushes
 * storefront CODE (git push + Helix publish of those files) and never touches
 * `edsStorefrontStatusSummary`. Only `storefrontRepublishService` clears it. The
 * two are different operations on different things, so a dot on Sync would point
 * at a button that does not fix the state it is reporting.
 *
 * Both remedy tiles are PERMANENT (Restart whenever the demo is running), with
 * the dot varying. A tile that appears only when something is wrong makes its own
 * presence the status signal — the thing that made `Redeploy Mesh` wrong on the
 * project kebab — and it makes the grid change shape as you watch.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ActionGrid, defaultProps, edsProps, getZone } from './ActionGrid.testUtils';

const stale = { color: 'yellow' as const, text: 'Republish needed', remedy: 'republish' as const };
const published = { color: 'green' as const, text: 'Published' };
const needsRestart = {
    color: 'yellow' as const,
    text: 'Restart needed',
    remedy: 'restart' as const,
};
const running = { color: 'green' as const, text: 'Running on port 3000' };

describe('Storefront zone — the Republish tile', () => {
    it('is a real tile in the zone, not a menu item', () => {
        const { container } = render(<ActionGrid {...edsProps} demoStatus={published} />);

        expect(within(getZone(container, 'storefront')).getByText('Republish')).toBeInTheDocument();
    });

    it('has LEFT the More overflow — a tile and a menu copy is clutter', () => {
        render(<ActionGrid {...edsProps} demoStatus={published} />);

        expect(screen.queryByText('Republish Content')).not.toBeInTheDocument();
    });

    it('runs the republish when pressed', () => {
        const handleRepublishContent = jest.fn();
        const { container } = render(
            <ActionGrid
                {...edsProps}
                handleRepublishContent={handleRepublishContent}
                demoStatus={stale}
            />
        );

        within(getZone(container, 'storefront')).getByText('Republish').click();
        expect(handleRepublishContent).toHaveBeenCalledTimes(1);
    });

    it('wears an amber dot when the storefront has drifted', () => {
        render(<ActionGrid {...edsProps} demoStatus={stale} />);

        expect(screen.getByTestId('republish-tile-dot')).toHaveAttribute('data-variant', 'warning');
    });

    it('wears NO dot when the storefront is current', () => {
        render(<ActionGrid {...edsProps} demoStatus={published} />);

        expect(screen.queryByTestId('republish-tile-dot')).not.toBeInTheDocument();
    });

    it('never puts the dot on Sync Storefront — that is not what fixes it', () => {
        render(<ActionGrid {...edsProps} demoStatus={stale} />);

        expect(screen.queryByTestId('sync-storefront-tile-dot')).not.toBeInTheDocument();
    });

    it('says in a tooltip what the dot means', () => {
        // The words left the surface with the status row, so the tooltip is now
        // the only place "Republish needed" is spelled out. Scoped to the zone:
        // other tiles carry tooltips too.
        const { container } = render(<ActionGrid {...edsProps} demoStatus={stale} />);

        expect(within(getZone(container, 'storefront')).getByRole('tooltip')).toHaveTextContent(
            /Republish needed/
        );
    });

    it('explains the tile rather than echoing its label when idle', () => {
        const { container } = render(<ActionGrid {...edsProps} demoStatus={published} />);

        expect(within(getZone(container, 'storefront')).getByRole('tooltip')).toHaveTextContent(
            'Push config and authored content to the CDN'
        );
    });

    it('drops the dangling status row the tile replaced', () => {
        const { container } = render(<ActionGrid {...edsProps} demoStatus={stale} />);

        expect(container.querySelector('.dashboard-zone-status')).not.toBeInTheDocument();
    });
});

describe('Primary zone — the Restart tile', () => {
    it('appears whenever the demo is running', () => {
        const { container } = render(
            <ActionGrid {...defaultProps} isRunning demoStatus={running} />
        );

        expect(within(getZone(container, 'primary')).getByText('Restart')).toBeInTheDocument();
    });

    it('is absent while the demo is stopped — nothing to restart', () => {
        const { container } = render(
            <ActionGrid {...defaultProps} demoStatus={{ color: 'gray', text: 'Stopped' }} />
        );

        expect(
            within(getZone(container, 'primary')).queryByText('Restart')
        ).not.toBeInTheDocument();
    });

    it('restarts when pressed', () => {
        const handleRestartDemo = jest.fn();
        const { container } = render(
            <ActionGrid
                {...defaultProps}
                isRunning
                handleRestartDemo={handleRestartDemo}
                demoStatus={needsRestart}
            />
        );

        within(getZone(container, 'primary')).getByText('Restart').click();
        expect(handleRestartDemo).toHaveBeenCalledTimes(1);
    });

    it('wears an amber dot when config changed under a running demo', () => {
        render(<ActionGrid {...defaultProps} isRunning demoStatus={needsRestart} />);

        expect(screen.getByTestId('restart-tile-dot')).toHaveAttribute('data-variant', 'warning');
    });

    it('wears NO dot on a healthy running demo', () => {
        render(<ActionGrid {...defaultProps} isRunning demoStatus={running} />);

        expect(screen.queryByTestId('restart-tile-dot')).not.toBeInTheDocument();
    });

    it('says in a tooltip what the dot means', () => {
        // The zone has two tooltips now (lifecycle tile + restart tile), so this
        // asks whether ANY of them carries the words.
        const { container } = render(
            <ActionGrid {...defaultProps} isRunning demoStatus={needsRestart} />
        );

        const tips = within(getZone(container, 'primary'))
            .getAllByRole('tooltip')
            .map((n) => n.textContent);
        expect(tips.some((t) => t?.includes('Restart needed'))).toBe(true);
    });

    it('adds no runtime status ROW — the words live in the tooltip instead', () => {
        // A green dot on "Stop" meaning "running" is the same fact twice, and the
        // status row that used to carry the port is what dangled off the grid.
        // The text survives, but only on hover.
        const { container } = render(
            <ActionGrid {...defaultProps} isRunning demoStatus={running} />
        );

        expect(container.querySelector('.dashboard-zone-status')).not.toBeInTheDocument();
        const onSurface = within(getZone(container, 'primary'))
            .getAllByText('Running on port 3000')
            .filter((n) => n.getAttribute('role') !== 'tooltip');
        expect(onSurface).toHaveLength(0);
    });

    it('gives an EDS project no Restart tile — it has no running state', () => {
        const { container } = render(<ActionGrid {...edsProps} demoStatus={published} />);

        expect(
            within(getZone(container, 'primary')).queryByText('Restart')
        ).not.toBeInTheDocument();
    });
});

/**
 * The Start/Stop tile carries the states IT cannot express.
 *
 * Removing the runtime status text was right for the steady states — the tile
 * showing "Stop" already means running, and a green dot beside it is the same
 * fact twice. But it silently took "Starting…", "Stopping…" and "Error" with it,
 * and the tile says nothing about those: it looks identical mid-start and
 * mid-failure.
 *
 * So the dot appears only where the tile is ambiguous, and the tooltip carries
 * the words that used to be on screen.
 */
describe('Primary zone — the lifecycle dot', () => {
    const status = (color: 'blue' | 'red' | 'green' | 'gray', text: string) => ({ color, text });

    it.each([
        ['starting', 'blue', 'Starting...', 'info'],
        ['stopping', 'blue', 'Stopping...', 'info'],
        ['error', 'red', 'Error', 'error'],
    ] as const)('marks %s, which the tile cannot show', (_s, color, text, variant) => {
        render(<ActionGrid {...defaultProps} demoStatus={status(color, text)} />);

        expect(screen.getByTestId('lifecycle-tile-dot')).toHaveAttribute('data-variant', variant);
    });

    it.each([
        ['running', 'green', 'Running on port 3000', true],
        ['stopped', 'gray', 'Stopped', false],
    ] as const)('leaves %s undotted — the tile already says it', (_s, color, text, isRunning) => {
        render(
            <ActionGrid {...defaultProps} isRunning={isRunning} demoStatus={status(color, text)} />
        );

        expect(screen.queryByTestId('lifecycle-tile-dot')).not.toBeInTheDocument();
    });

    it('keeps the words in the tooltip', () => {
        const { container } = render(
            <ActionGrid {...defaultProps} demoStatus={status('blue', 'Starting...')} />
        );

        expect(within(getZone(container, 'primary')).getAllByRole('tooltip')[0]).toHaveTextContent(
            'Starting...'
        );
    });

    it('still reports the port there, even though it left the surface', () => {
        // The text moved into the tooltip rather than vanishing; the projects
        // grid card remains the place it is visible at a glance.
        const { container } = render(
            <ActionGrid
                {...defaultProps}
                isRunning
                demoStatus={status('green', 'Running on port 3000')}
            />
        );

        expect(within(getZone(container, 'primary')).getAllByRole('tooltip')[0]).toHaveTextContent(
            'Running on port 3000'
        );
    });

    it('gives an EDS project no lifecycle tile at all', () => {
        const { container } = render(<ActionGrid {...edsProps} demoStatus={published} />);

        expect(within(getZone(container, 'primary')).queryByText('Start')).not.toBeInTheDocument();
        expect(within(getZone(container, 'primary')).queryByText('Stop')).not.toBeInTheDocument();
    });
});

/**
 * THE INVARIANT: no naked dots.
 *
 * Every status dot on the dashboard must be hoverable for the words explaining
 * it. The integrations tile shipped without a tooltip and stayed that way
 * because the rule lived in three separate call sites and nothing checked it.
 *
 * `DashboardTile` now makes the pairing unrepresentable in the type — this
 * sweeps the assembled grid as a second line of defence, since a future tile
 * could always bypass the component.
 */
describe('ActionGrid — every dot has words', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
        ['stopped', { ...defaultProps, demoStatus: { color: 'gray', text: 'Stopped' } }],
        ['starting', { ...defaultProps, demoStatus: { color: 'blue', text: 'Starting...' } }],
        ['errored', { ...defaultProps, demoStatus: { color: 'red', text: 'Error' } }],
        ['needing a restart', { ...defaultProps, isRunning: true, demoStatus: needsRestart }],
        ['EDS, published', { ...edsProps, demoStatus: published }],
        ['EDS, drifted', { ...edsProps, demoStatus: stale }],
        [
            'with a failed integration',
            {
                ...edsProps,
                demoStatus: published,
                hasAdobeContext: true,
                appBuilderComponents: {
                    a: { kind: 'integration', status: 'error', source: { owner: 'o', repo: 'r' } },
                },
            },
        ],
    ];

    it.each(cases)('leaves no undocumented dot on a project %s', (_name, props) => {
        const { container } = render(
            <ActionGrid {...(props as unknown as React.ComponentProps<typeof ActionGrid>)} />
        );

        const dots = Array.from(container.querySelectorAll('.tile-status-dot'));
        // Positive control: at least one case must actually produce a dot, or
        // this whole sweep passes by finding nothing.
        const tiles = dots.map((d) => d.closest('button'));

        for (const tile of tiles) {
            expect(tile).not.toBeNull();
            const tip = tile?.parentElement?.querySelector('[role="tooltip"]');
            expect(tip?.textContent ?? '').not.toBe('');
        }
    });

    it('positive control — the sweep above sees real dots', () => {
        const { container } = render(<ActionGrid {...edsProps} demoStatus={stale} />);

        expect(container.querySelectorAll('.tile-status-dot').length).toBeGreaterThan(0);
    });
});

/**
 * Edit takes the tile; Sync Storefront takes the menu.
 *
 * Sync Storefront pushes hand-edited storefront CODE. Its main consumer is the
 * AI loop, where a PostToolUse hook now commits and pushes automatically — so a
 * permanent tile buys little. It is also EDS-only, in a row otherwise almost
 * universal.
 *
 * Edit reopens the creation wizard: which brand, stack, components and block
 * libraries the demo HAS. That applies to every project type, has no automation,
 * and is the highest-value manual change after Configure — which sits beside it.
 * Configure changes VALUES; Edit changes what exists.
 */
describe('Edit tile / Sync Storefront demotion', () => {
    /**
     * Query tiles by `data-action`, never by text alone: the More MenuTrigger
     * renders INSIDE the build zone, so `getByText('Edit')` scoped to that zone
     * matches the menu item too and passes whether or not a tile exists.
     */
    const tile = (container: HTMLElement, action: string) =>
        container.querySelector(`[data-action="${action}"]`);

    it('gives Edit a tile, and places it BEFORE Republish in the row', () => {
        // Zones render Primary -> Storefront -> Build, so an Edit tile in Build
        // would land after the storefront's Republish. Edit belongs earlier:
        // changing what the demo contains precedes fixing how it is published.
        const { container } = render(<ActionGrid {...edsProps} demoStatus={stale} />);

        const edit = tile(container, 'edit');
        const republish = tile(container, 'republish-tile');
        expect(edit).toBeInTheDocument();
        expect(republish).toBeInTheDocument();
        // Node.compareDocumentPosition: 4 === edit precedes republish.
        expect(edit!.compareDocumentPosition(republish!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('takes Edit out of the More menu — one door, not two', () => {
        const { container } = render(<ActionGrid {...defaultProps} />);

        const menu = container.querySelector('[role="menu"]') as HTMLElement;
        expect(within(menu).queryByText('Edit')).not.toBeInTheDocument();
    });

    it('disables the Edit tile while a non-EDS demo runs, rather than hiding it', () => {
        // The wizard cannot re-shape a running project. Hiding the tile would
        // reshuffle the grid as the demo starts and stops; disabling keeps the
        // row stable and the tooltip says why.
        const { container } = render(<ActionGrid {...defaultProps} isRunning />);

        expect(tile(container, 'edit')).toBeDisabled();
    });

    it('leaves Edit enabled for EDS, which has no running state', () => {
        const { container } = render(<ActionGrid {...edsProps} isRunning />);

        expect(tile(container, 'edit')).not.toBeDisabled();
    });

    it('moves Sync Storefront into the More menu', () => {
        const { container } = render(<ActionGrid {...edsProps} />);

        const menu = container.querySelector('[role="menu"]') as HTMLElement;
        expect(within(menu).getByText('Sync Storefront')).toBeInTheDocument();
        expect(container.querySelector('[data-action="sync-storefront"]')).not.toBeInTheDocument();
    });

    it('keeps Sync Storefront EDS-only', () => {
        const { container } = render(<ActionGrid {...defaultProps} />);

        const menu = container.querySelector('[role="menu"]') as HTMLElement;
        expect(within(menu).queryByText('Sync Storefront')).not.toBeInTheDocument();
    });

    it('still fires the sync from the menu', () => {
        const handleSyncStorefront = jest.fn();
        const { container } = render(
            <ActionGrid {...edsProps} handleSyncStorefront={handleSyncStorefront} />
        );

        const menu = container.querySelector('[role="menu"]') as HTMLElement;
        within(menu).getByText('Sync Storefront').click();
        expect(handleSyncStorefront).toHaveBeenCalledTimes(1);
    });

    it('leaves Republish alone in the storefront zone', () => {
        // The zone survives with one tile: Republish is the remedy that carries
        // the drift dot, and it must stay next to the status it reports.
        const { container } = render(<ActionGrid {...edsProps} demoStatus={stale} />);

        expect(tile(getZone(container, 'storefront'), 'republish-tile')).toBeInTheDocument();
        expect(screen.getByTestId('republish-tile-dot')).toBeInTheDocument();
    });
});
