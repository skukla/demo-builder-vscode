/**
 * IntegrationsScreen Tests (integrations surface)
 *
 * The screen owns the DATA — the two live push channels, card derivation, and
 * filtering — while IntegrationsGrid renders what it is handed (the same split
 * as ProjectsDashboard → ProjectsGrid). So the channel behaviour that used to be
 * pinned on the grid lives here now:
 *   - `appBuilderComponentStatusUpdate` — per-id in-flight status, incl. the
 *     update-borne rename label
 *   - `appBuilderComponentsSnapshot` — the fresh persisted map, which is what
 *     LANDS an added card and DROPS a removed one without a reload
 *
 * Plus the scaffolding this surface adopted from ProjectsDashboard: the three
 * render states, the header count, and filtering.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AppBuilderComponentState } from '@/types/base';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(() => jest.fn()),
        request: jest.fn(() => Promise.resolve({ success: true })),
    },
}));

// The page primitives have their own suites; stub them so this file tests the
// screen's own logic (states, counts, filtering, channels) rather than layout.
jest.mock('@/core/ui/components/layout', () => ({
    PageLayout: ({ header, children }: any) => (
        <div data-testid="page-layout">
            {header}
            {children}
        </div>
    ),
    PageHeader: ({ title, subtitle, action }: any) => (
        <div data-testid="page-header">
            <h1>{title}</h1>
            {subtitle && <span data-testid="page-subtitle">{subtitle}</span>}
            {action}
        </div>
    ),
}));

jest.mock('@/core/ui/components/navigation/SearchHeader', () => ({
    SearchHeader: ({ totalCount, filteredCount, onSearchQueryChange, onRefresh }: any) => (
        <div data-testid="search-header">
            <span data-testid="total-count">{totalCount}</span>
            <span data-testid="filtered-count">{filteredCount}</span>
            <input
                aria-label="Filter integrations"
                onChange={(e) => onSearchQueryChange(e.target.value)}
            />
            <button onClick={onRefresh}>refresh</button>
        </div>
    ),
}));

jest.mock('@/core/ui/components/feedback', () => ({
    LoadingDisplay: ({ message }: any) => <div data-testid="loading">{message}</div>,
    StatusDisplay: ({ title, actions }: any) => (
        <div data-testid="empty-state">
            {title}
            {actions?.map((a: any) => (
                <button key={a.label} onClick={a.onPress}>
                    {a.label}
                </button>
            ))}
        </div>
    ),
}));

jest.mock('@adobe/react-spectrum', () => ({
    Button: ({ children, onPress, ...p }: any) => (
        <button onClick={onPress} {...p}>
            {children}
        </button>
    ),
    Flex: ({ children }: any) => <div>{children}</div>,
    View: ({ children }: any) => <div>{children}</div>,
    ProgressCircle: (p: any) => <div data-testid="spinner" aria-label={p['aria-label']} />,
}));

// The grid and add modal have their own suites; stub to keep this focused on
// WHAT the screen hands down.
jest.mock('@/features/dashboard/ui/components/integrations/IntegrationsGrid', () => ({
    IntegrationsGrid: ({ cards, onAddRequest }: any) => (
        <div data-testid="grid">
            {cards.map((c: any) => (
                <div key={c.id} data-testid={`card-${c.id}`}>
                    {c.name} · {c.statusLabel}
                </div>
            ))}
            <button onClick={onAddRequest}>grid-add</button>
        </div>
    ),
}));

// The adapter renders the WIZARD's real flow modal, which needs Spectrum
// internals this suite deliberately does not mock. Its own behaviour (the
// commit callbacks, the mesh rule, reservedIds) is pinned in
// AddIntegrationFlowAdapter.test.tsx.
jest.mock('@/features/dashboard/ui/integrationsSurface/AddIntegrationFlowAdapter', () => ({
    // `mode` is surfaced so the destination-control suite can assert WHICH
    // journey opened — add vs destination is the whole point of that control.
    AddIntegrationFlowAdapter: ({ isOpen, mode }: any) =>
        isOpen ? <div data-testid="add-modal" data-mode={mode ?? 'add'} /> : null,
}));

// Deliberately below the jest.mock calls: babel-plugin-jest-hoist lifts them
// above every import, so the screen always loads against the mocks.
import {
    formatDestination,
    formatHeaderSubtitle,
    IntegrationsScreen,
} from '@/features/dashboard/ui/integrationsSurface/IntegrationsScreen';

function getClient() {
    const { webviewClient } = require('@/core/ui/utils/WebviewClient');
    return webviewClient as { postMessage: jest.Mock; onMessage: jest.Mock };
}

/**
 * Capture push subscriptions so tests can drive the live channels.
 *
 * Fans out to EVERY subscriber of a type, matching the real client
 * (`Map<type, Set<handler>>`). A single-handler map silently dropped the first
 * subscriber: both `useLiveAppBuilderComponents` and `useRowStatusOverrides`
 * listen on `appBuilderComponentsSnapshot`, so the later registration displaced
 * the map updater and snapshots stopped landing — in the TEST only, which is the
 * kind of mock drift that reads as a product bug.
 */
function captureHandlers(): Map<string, (data: unknown) => void> {
    const subscribers = new Map<string, Array<(data: unknown) => void>>();
    getClient().onMessage.mockImplementation((type: string, handler: (d: unknown) => void) => {
        const list = subscribers.get(type) ?? [];
        list.push(handler);
        subscribers.set(type, list);
        return jest.fn();
    });
    // Present the same Map-like read the tests already use, but dispatching to all.
    return {
        get: (type: string) => (data: unknown) =>
            subscribers.get(type)?.forEach((handler) => handler(data)),
    } as unknown as Map<string, (data: unknown) => void>;
}

/** Resolve the status gate so the screen leaves its loading state. */
function settleStatus(handlers: Map<string, (data: unknown) => void>) {
    act(() => {
        handlers.get('statusUpdate')?.({ name: 'p', path: '/p', status: 'ready' });
    });
}

const DEPLOYED: AppBuilderComponentState = {
    kind: 'integration',
    status: 'deployed',
    source: { owner: 'acme', repo: 'erp-sync' },
};

beforeEach(() => {
    jest.clearAllMocks();
    getClient().onMessage.mockImplementation(() => jest.fn());
});

describe('IntegrationsScreen', () => {
    describe('render states', () => {
        it('shows the house loading view until status resolves', () => {
            // LoadingDisplay, not a bare ProgressCircle — the same full-block
            // treatment ProjectsDashboard's gate uses.
            captureHandlers();
            render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} />);

            expect(screen.getByTestId('loading')).toHaveTextContent('Loading integrations');
            expect(screen.queryByTestId('grid')).not.toBeInTheDocument();
        });

        it('shows the empty state when there is nothing to render', () => {
            const handlers = captureHandlers();
            render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{}} />);
            settleStatus(handlers);

            expect(screen.getByTestId('empty-state')).toBeInTheDocument();
            expect(screen.queryByTestId('grid')).not.toBeInTheDocument();
        });

        // LIVE 2026-08-04: removing the last integration dropped the user onto a
        // full-screen takeover with no title, no project · destination subtitle,
        // and no Project Dashboard button — no context and no way back. The empty
        // state belongs INSIDE the page chrome, not instead of it.
        it('keeps the project context and the way back in the empty state', () => {
            const handlers = captureHandlers();
            render(
                <IntegrationsScreen
                    hasAdobeContext
                    appBuilderComponents={{}}
                    projectName="demo-builder-test"
                    destination={{ projectTitle: 'Kukla Mesh', workspaceTitle: 'Stage' }}
                />
            );
            settleStatus(handlers);

            expect(screen.getByTestId('empty-state')).toBeInTheDocument();
            expect(screen.getByText('Integrations')).toBeInTheDocument();
            expect(screen.getByTestId('page-subtitle')).toHaveTextContent(
                'demo-builder-test · Kukla Mesh · Stage'
            );
            expect(screen.getByRole('button', { name: 'Project Dashboard' })).toBeInTheDocument();
            // Exactly ONE Add integration: the empty state's CTA. The band's copy
            // is withheld while empty rather than doubling it.
            expect(screen.getAllByRole('button', { name: 'Add integration' })).toHaveLength(1);
        });

        it('opens the add modal from the empty state CTA', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const handlers = captureHandlers();
            render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{}} />);
            settleStatus(handlers);

            await user.click(screen.getByRole('button', { name: 'Add integration' }));

            expect(screen.getByTestId('add-modal')).toBeInTheDocument();
        });

        it('renders the grid once there are cards', () => {
            const handlers = captureHandlers();
            render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} />);
            settleStatus(handlers);

            expect(screen.getByTestId('grid')).toBeInTheDocument();
            expect(screen.getByTestId('card-a')).toBeInTheDocument();
        });
    });

    describe('formatDestination', () => {
        it('joins project and workspace', () => {
            expect(formatDestination({ projectTitle: 'Kukla Mesh', workspaceTitle: 'Stage' })).toBe(
                'Kukla Mesh · Stage'
            );
        });

        it('returns the project alone when there is no workspace', () => {
            expect(formatDestination({ projectTitle: 'Kukla Mesh' })).toBe('Kukla Mesh');
        });

        // Undefined, not an empty string — the caller hides the line on undefined,
        // so returning '' here would render an empty labelled row.
        it('returns undefined when neither part is known', () => {
            expect(formatDestination({})).toBeUndefined();
            expect(formatDestination(undefined)).toBeUndefined();
        });
    });

    describe('formatHeaderSubtitle', () => {
    it('joins the project name and the destination', () => {
        expect(
            formatHeaderSubtitle('demo-builder-test', {
                projectTitle: 'Kukla Mesh',
                workspaceTitle: 'Stage',
            })
        ).toBe('demo-builder-test · Kukla Mesh · Stage');
    });

    it('returns the project alone when there is no destination', () => {
        expect(formatHeaderSubtitle('demo-builder-test', undefined)).toBe('demo-builder-test');
    });

    it('returns the destination alone when the project is unnamed', () => {
        expect(formatHeaderSubtitle(undefined, { projectTitle: 'Kukla Mesh' })).toBe('Kukla Mesh');
    });

    // Undefined, not '' — PageHeader omits the crumb element entirely on undefined
    // rather than rendering an empty one.
    it('returns undefined when neither is known', () => {
        expect(formatHeaderSubtitle(undefined, undefined)).toBeUndefined();
    });
});

describe('header', () => {
        it('names the project', () => {
            const handlers = captureHandlers();
            render(
                <IntegrationsScreen
                    hasAdobeContext
                    projectName="demo-builder-test"
                    appBuilderComponents={{ a: DEPLOYED }}
                    destination={{ projectTitle: 'Kukla Mesh', workspaceTitle: 'Stage' }}
                />
            );
            settleStatus(handlers);

            expect(screen.getByTestId('page-subtitle')).toHaveTextContent('demo-builder-test');
        });

        // Every integration deploys to ONE Adobe project + workspace, so the
        // destination is a property of the PROJECT — it rides the header crumb
        // beside the project name rather than sitting in the action band, which
        // is otherwise about acting on the list.
        //
        // The band placement this replaced was itself a replacement for two tests
        // that asserted `queryByTestId('destination-row')` was absent. Those
        // protected nothing: `destination-row` is this suite's mock of StatusCard,
        // which this screen has never rendered, so both passed regardless.
        describe('destination', () => {
            it('follows the project name in the header crumb', () => {
                const handlers = captureHandlers();
                render(
                    <IntegrationsScreen
                        hasAdobeContext
                        projectName="demo-builder-test"
                        appBuilderComponents={{ a: DEPLOYED }}
                        destination={{ projectTitle: 'Kukla Mesh', workspaceTitle: 'Stage' }}
                    />
                );
                settleStatus(handlers);

                expect(screen.getByTestId('page-subtitle')).toHaveTextContent(
                    'demo-builder-test · Kukla Mesh · Stage'
                );
            });

            // The case the original band tests were really reaching for: a project
            // with no Adobe target must not leave a dangling separator.
            it('leaves the crumb as the project alone when there is no Adobe target', () => {
                const handlers = captureHandlers();
                render(
                    <IntegrationsScreen
                        hasAdobeContext
                        projectName="demo-builder-test"
                        appBuilderComponents={{ a: DEPLOYED }}
                    />
                );
                settleStatus(handlers);

                expect(screen.getByTestId('page-subtitle')).toHaveTextContent('demo-builder-test');
                expect(screen.getByTestId('page-subtitle').textContent).not.toContain('·');
            });

            it('renders no destination line in the action band', () => {
                const handlers = captureHandlers();
                render(
                    <IntegrationsScreen
                        hasAdobeContext
                        appBuilderComponents={{ a: DEPLOYED }}
                        destination={{ projectTitle: 'Kukla Mesh', workspaceTitle: 'Stage' }}
                    />
                );
                settleStatus(handlers);

                expect(screen.queryByTestId('page-destination')).not.toBeInTheDocument();
            });
        });

        it('renders the back button in the action band, NOT the page header', () => {
            const handlers = captureHandlers();
            render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} />);
            settleStatus(handlers);

            // DashboardStatusHeader trails "All Projects" after its status badges,
            // in the band BELOW the title — this surface mirrors that, so the
            // button must NOT be inside the page header.
            const header = screen.getByTestId('page-header');
            const back = screen.getByRole('button', { name: 'Project Dashboard' });
            expect(header).not.toContainElement(back);
        });

        it('routes the back button to the project dashboard', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const handlers = captureHandlers();
            render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} />);
            settleStatus(handlers);

            await user.click(screen.getByRole('button', { name: 'Project Dashboard' }));

            expect(getClient().postMessage).toHaveBeenCalledWith('showProjectDashboard');
        });

        it('refresh re-requests status', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const handlers = captureHandlers();
            render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} />);
            settleStatus(handlers);

            await user.click(screen.getByRole('button', { name: 'refresh' }));

            expect(getClient().postMessage).toHaveBeenCalledWith('requestStatus');
        });
    });

    describe('count and filtering', () => {
        function twoCards() {
            return {
                'erp-sync': { ...DEPLOYED },
                'order-flow': { ...DEPLOYED, source: { owner: 'acme', repo: 'order-flow' } },
            };
        }

        it('reports the card count in the header', () => {
            const handlers = captureHandlers();
            render(<IntegrationsScreen hasAdobeContext appBuilderComponents={twoCards()} />);
            settleStatus(handlers);

            expect(screen.getByTestId('total-count')).toHaveTextContent('2');
        });

        it('filters the grid and the filtered count together', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const handlers = captureHandlers();
            render(<IntegrationsScreen hasAdobeContext appBuilderComponents={twoCards()} />);
            settleStatus(handlers);

            await user.type(screen.getByLabelText('Filter integrations'), 'order');

            // Header count and rendered cards cannot disagree — one source.
            expect(screen.getByTestId('filtered-count')).toHaveTextContent('1');
            expect(screen.getByTestId('card-order-flow')).toBeInTheDocument();
            expect(screen.queryByTestId('card-erp-sync')).not.toBeInTheDocument();
            expect(screen.getByTestId('total-count')).toHaveTextContent('2');
        });
    });

    describe('live push channels (moved here with the data)', () => {
        it('flips ONLY the addressed card via appBuilderComponentStatusUpdate', () => {
            const handlers = captureHandlers();
            render(
                <IntegrationsScreen
                    hasAdobeContext
                    appBuilderComponents={{
                        'erp-sync': { ...DEPLOYED },
                        'other-app': { ...DEPLOYED },
                    }}
                />
            );
            settleStatus(handlers);

            act(() => {
                handlers.get('appBuilderComponentStatusUpdate')?.({
                    id: 'erp-sync',
                    status: 'deploying',
                });
            });

            expect(screen.getByTestId('card-erp-sync')).toHaveTextContent('Deploying…');
            expect(screen.getByTestId('card-other-app')).toHaveTextContent('Deployed');
        });

        it('applies an update-borne display name (rename refreshes the label live)', () => {
            const handlers = captureHandlers();
            render(
                <IntegrationsScreen
                    hasAdobeContext
                    appBuilderComponents={{ 'erp-sync': { ...DEPLOYED, name: 'ERP Sync' } }}
                />
            );
            settleStatus(handlers);

            act(() => {
                handlers.get('appBuilderComponentStatusUpdate')?.({
                    id: 'erp-sync',
                    status: 'deployed',
                    name: 'Order Sync',
                });
            });

            expect(screen.getByTestId('card-erp-sync')).toHaveTextContent('Order Sync');
        });

        it('LANDS a card added after the initial seed (snapshot)', () => {
            const handlers = captureHandlers();
            render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} />);
            settleStatus(handlers);

            act(() => {
                handlers.get('appBuilderComponentsSnapshot')?.({
                    components: { a: DEPLOYED, b: { ...DEPLOYED, status: 'not-deployed' } },
                });
            });

            expect(screen.getByTestId('card-b')).toBeInTheDocument();
        });

        it('DROPS a card removed from the persisted map (snapshot)', () => {
            const handlers = captureHandlers();
            render(
                <IntegrationsScreen
                    hasAdobeContext
                    appBuilderComponents={{ a: DEPLOYED, b: DEPLOYED }}
                />
            );
            settleStatus(handlers);

            act(() => {
                handlers.get('appBuilderComponentsSnapshot')?.({ components: { a: DEPLOYED } });
            });

            expect(screen.getByTestId('card-a')).toBeInTheDocument();
            expect(screen.queryByTestId('card-b')).not.toBeInTheDocument();
        });

        it('ignores a malformed snapshot rather than blanking the grid', () => {
            const handlers = captureHandlers();
            render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} />);
            settleStatus(handlers);

            act(() => {
                handlers.get('appBuilderComponentsSnapshot')?.({});
            });

            expect(screen.getByTestId('card-a')).toBeInTheDocument();
        });
    });
});

/**
 * The destination CONTROL (2026-08-07).
 *
 * The display half shipped 2026-08-03 in the header crumb. The control joins it
 * there rather than in the action band: splitting a fact from the affordance that
 * changes it reads worse, and the destination is a property of the PROJECT while
 * the band is about acting on the list.
 */
describe('IntegrationsScreen — destination control', () => {
    const DEST = { projectTitle: 'Kukla Mesh', workspaceTitle: 'Stage' };

    it('offers Change beside the destination in the header', () => {
        const handlers = captureHandlers();
        render(
            <IntegrationsScreen
                hasAdobeContext
                appBuilderComponents={{ a: DEPLOYED }}
                projectName="demo-builder-test"
                destination={DEST}
            />,
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
                projectName="demo-builder-test"
            />,
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
                projectName="demo-builder-test"
                destination={DEST}
            />,
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
    it('opts into the left-anchored page layout, like the project dashboard', () => {
        // Must settle status first — the screen renders a full-height loading
        // gate until it arrives, and that branch has no page chrome at all.
        const handlers = captureHandlers();
        const { container } = render(
            <IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} />
        );
        settleStatus(handlers);

        expect(container.querySelector('.page-left-anchored')).toBeInTheDocument();
    });
});
