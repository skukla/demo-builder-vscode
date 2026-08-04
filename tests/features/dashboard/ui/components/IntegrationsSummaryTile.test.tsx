/**
 * IntegrationsSummaryTile Tests (integrations surface)
 *
 * The dashboard's ENTIRE integrations footprint after the grid moved to its own
 * surface: a single tile carrying the WORST status across every card, opening
 * the surface on press. That dot is what mitigates integrations being one click
 * away instead of visible on arrival — so it must survive hover, and it must
 * never be outvoted by healthier siblings.
 *
 * Worst-status precedence (most alarming wins): error > stale > deploying >
 * not-deployed > deployed.
 *
 * Strict TDD: written BEFORE the component exists.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntegrationsSummaryTile } from '@/features/dashboard/ui/components/IntegrationsSummaryTile';
import type { AppBuilderComponentState } from '@/types/base';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { postMessage: jest.fn(), onMessage: jest.fn(() => jest.fn()) },
}));

jest.mock('@adobe/react-spectrum', () => ({
    ActionButton: ({
        children,
        onPress,
        isDisabled,
        isQuiet: _q,
        UNSAFE_className,
        ...props
    }: any) => (
        <button onClick={onPress} disabled={isDisabled} className={UNSAFE_className} {...props}>
            {children}
        </button>
    ),
    Text: ({ children, UNSAFE_className, ...props }: any) => (
        <span className={UNSAFE_className} {...props}>
            {children}
        </span>
    ),
}));

jest.mock('@spectrum-icons/workflow/Data', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-data" />,
}));

function getClient() {
    const { webviewClient } = require('@/core/ui/utils/WebviewClient');
    return webviewClient as { postMessage: jest.Mock };
}

const DEPLOYED: AppBuilderComponentState = {
    kind: 'integration',
    status: 'deployed',
    source: { owner: 'acme', repo: 'a' },
};

function components(
    ...statuses: Array<AppBuilderComponentState['status']>
): Record<string, AppBuilderComponentState> {
    return Object.fromEntries(statuses.map((status, i) => [`app-${i}`, { ...DEPLOYED, status }]));
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('IntegrationsSummaryTile', () => {
    it('renders nothing without an Adobe context (same gate as the old block)', () => {
        const { container } = render(
            <IntegrationsSummaryTile appBuilderComponents={components('deployed')} />
        );

        expect(container).toBeEmptyDOMElement();
    });

    // No count: "how many?" is idle trivia from the dashboard next to "is
    // anything broken?", and it put a number on a tile whose row-neighbours
    // carry none. The status dot is the whole payload.
    it('renders NO count', () => {
        render(
            <IntegrationsSummaryTile
                hasAdobeContext
                hasMesh
                appBuilderComponents={components('deployed', 'deployed')}
            />
        );

        expect(screen.queryByTestId('integrations-tile-count')).not.toBeInTheDocument();
        expect(screen.getByRole('button')).not.toHaveTextContent(/\d/);
    });

    // REGRESSION: `.dashboard-action-button:hover *` blanks every descendant
    // background to transparent to kill Spectrum's internal hover fills. The dot
    // IS a background, so it vanished under the pointer — on the exact gesture
    // preceding a click through to check on it. The marker class is its exemption.
    it('carries the marker exempting the dot from the tile hover-blanking rule', () => {
        render(
            <IntegrationsSummaryTile hasAdobeContext appBuilderComponents={components('error')} />
        );

        expect(screen.getByTestId('integrations-tile-dot')).toHaveClass('tile-status-dot');
    });

    describe('worst-status dot (most alarming wins)', () => {
        it.each([
            [['deployed', 'deployed'], 'success'],
            [['deployed', 'not-deployed'], 'neutral'],
            [['not-deployed', 'deploying'], 'info'],
            [['deploying', 'stale'], 'warning'],
            [['stale', 'error'], 'error'],
            [['error', 'deployed'], 'error'],
        ])('%s → %s', (statuses, expected) => {
            render(
                <IntegrationsSummaryTile
                    hasAdobeContext
                    appBuilderComponents={components(
                        ...(statuses as Array<AppBuilderComponentState['status']>)
                    )}
                />
            );

            expect(screen.getByTestId('integrations-tile-dot')).toHaveAttribute(
                'data-variant',
                expected
            );
        });
    });

    describe('mesh health folds into the same dot', () => {
        // Without this the mesh could be broken and the dashboard would look
        // healthy — the regression the tile exists to prevent, since the mesh
        // card left the dashboard with the grid.
        it('reports a mesh error even when every integration is healthy', () => {
            render(
                <IntegrationsSummaryTile
                    hasAdobeContext
                    hasMesh
                    meshStatus="error"
                    appBuilderComponents={components('deployed', 'deployed')}
                />
            );

            expect(screen.getByTestId('integrations-tile-dot')).toHaveAttribute(
                'data-variant',
                'error'
            );
        });

        it('maps mesh config drift to the warning dot (same mapping as the card)', () => {
            render(
                <IntegrationsSummaryTile
                    hasAdobeContext
                    hasMesh
                    meshStatus="config-changed"
                    appBuilderComponents={components('deployed')}
                />
            );

            expect(screen.getByTestId('integrations-tile-dot')).toHaveAttribute(
                'data-variant',
                'warning'
            );
        });

        it('ignores the in-flight "checking" mesh state (not a health signal)', () => {
            render(
                <IntegrationsSummaryTile
                    hasAdobeContext
                    hasMesh
                    meshStatus={undefined}
                    appBuilderComponents={components('deployed')}
                />
            );

            expect(screen.getByTestId('integrations-tile-dot')).toHaveAttribute(
                'data-variant',
                'success'
            );
        });

        it('ignores mesh status entirely when the project has no mesh', () => {
            render(
                <IntegrationsSummaryTile
                    hasAdobeContext
                    meshStatus="error"
                    appBuilderComponents={components('deployed')}
                />
            );

            expect(screen.getByTestId('integrations-tile-dot')).toHaveAttribute(
                'data-variant',
                'success'
            );
        });
    });

    // The dot reports HEALTH. With nothing deployed there is no health to report,
    // and worstStatusVariant's `?? 'success'` fallback painted an empty project
    // green — "all good" about nothing at all.
    describe('nothing to report → no dot', () => {
        it('shows no dot when the project has no integrations and no mesh', () => {
            render(<IntegrationsSummaryTile hasAdobeContext appBuilderComponents={{}} />);

            expect(screen.queryByTestId('integrations-tile-dot')).not.toBeInTheDocument();
            // The tile itself still renders — it is the way IN to add the first one.
            expect(screen.getByText('Integrations')).toBeInTheDocument();
        });

        it('shows no dot when the only mesh is still being checked', () => {
            render(
                <IntegrationsSummaryTile
                    hasAdobeContext
                    hasMesh
                    meshStatus="checking"
                    appBuilderComponents={{}}
                />
            );

            expect(screen.queryByTestId('integrations-tile-dot')).not.toBeInTheDocument();
        });

        it('still shows a dot once a mesh resolves, with no integrations', () => {
            render(
                <IntegrationsSummaryTile
                    hasAdobeContext
                    hasMesh
                    meshStatus="error"
                    appBuilderComponents={{}}
                />
            );

            expect(screen.getByTestId('integrations-tile-dot')).toHaveAttribute(
                'data-variant',
                'error'
            );
        });
    });

    it('opens the integrations surface on press', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        render(
            <IntegrationsSummaryTile
                hasAdobeContext
                appBuilderComponents={components('deployed')}
            />
        );

        await user.click(screen.getByRole('button', { name: /integrations/i }));

        expect(getClient().postMessage).toHaveBeenCalledWith('openIntegrations');
    });

    // THE BUG (2026-08-04, reported live): the integration CARD's blue dot blinked
    // while work was in flight; the same blue dot on this tile sat still. The tile
    // hand-rolled its dot markup instead of using StatusDot, so it never got the
    // pulse — motion was a caller responsibility rather than a property of the
    // status. This tile is the surface that proved it.
    it('pulses while an integration is deploying', () => {
        render(
            <IntegrationsSummaryTile hasAdobeContext appBuilderComponents={components('deploying')} />
        );

        const dot = screen.getByTestId('integrations-tile-dot');
        expect(dot).toHaveAttribute('data-variant', 'info');
        expect(dot).toHaveClass('status-dot--pulse');
    });

    it('does not pulse once everything has settled', () => {
        render(
            <IntegrationsSummaryTile hasAdobeContext appBuilderComponents={components('deployed')} />
        );

        expect(screen.getByTestId('integrations-tile-dot')).not.toHaveClass('status-dot--pulse');
    });
});
