/**
 * The integrations surface — render states, live channels and row actions.
 *
 * Mocks and helpers live in `IntegrationsScreen.testUtils.tsx`; the destination control
 * has its own suite. Split 2026-09-02 at the 750-line CI limit.
 */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import {
    DEPLOYED,
    IntegrationsScreen,
    asDisplayName,
    formatDestination,
    captureHandlers,
    getClient,
    resetIntegrationsScreenMocks,
    settleStatus,
} from './IntegrationsScreen.testUtils';

beforeEach(() => {
    resetIntegrationsScreenMocks();
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
                    projectName={asDisplayName('demo-builder-test')}
                    destination={{ projectTitle: 'Kukla Mesh', workspaceTitle: 'Stage' }}
                />
            );
            settleStatus(handlers);

            expect(screen.getByTestId('empty-state')).toBeInTheDocument();
            expect(screen.getByText('Integrations')).toBeInTheDocument();
            expect(screen.getByTestId('page-subtitle')).toHaveTextContent('demo-builder-test');
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

    describe('header', () => {
        it('names the project', () => {
            const handlers = captureHandlers();
            render(
                <IntegrationsScreen
                    hasAdobeContext
                    projectName={asDisplayName('demo-builder-test')}
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
                        projectName={asDisplayName('demo-builder-test')}
                        appBuilderComponents={{ a: DEPLOYED }}
                        destination={{ projectTitle: 'Kukla Mesh', workspaceTitle: 'Stage' }}
                    />
                );
                settleStatus(handlers);

                // The crumb is the LOCAL project only; the remote destination
                // moved to the band's context row.
                expect(screen.getByTestId('page-subtitle')).toHaveTextContent('demo-builder-test');
                expect(screen.getByTestId('page-destination')).toHaveTextContent('Kukla Mesh');
            });

            // The case the original band tests were really reaching for: a project
            // with no Adobe target must not leave a dangling separator.
            it('leaves the crumb as the project alone when there is no Adobe target', () => {
                const handlers = captureHandlers();
                render(
                    <IntegrationsScreen
                        hasAdobeContext
                        projectName={asDisplayName('demo-builder-test')}
                        appBuilderComponents={{ a: DEPLOYED }}
                    />
                );
                settleStatus(handlers);

                expect(screen.getByTestId('page-subtitle')).toHaveTextContent('demo-builder-test');
                expect(screen.getByTestId('page-subtitle').textContent).not.toContain('·');
            });

            /**
             * The destination moved OUT of the header and INTO the band.
             *
             * It used to ride in the subtitle as a third crumb —
             * "demo-builder-test · Kukla Mesh · Stage" — on the reasoning that
             * the band was "otherwise about acting on the list". The band's left
             * side is not actions: it holds the count, with most of its width
             * empty. It is context-left / actions-right, exactly like the project
             * dashboard's status band.
             *
             * Moving it also fixes an ambiguity the old docblock admitted to and
             * could not solve in place: the LOCAL project name and the REMOTE
             * Adobe project/workspace read as peers in one dot-separated run.
             * Split across header and band, the distinction is structural.
             */
            it('puts the destination in the band, not the header subtitle', () => {
                const handlers = captureHandlers();
                render(
                    <IntegrationsScreen
                        hasAdobeContext
                        appBuilderComponents={{ a: DEPLOYED }}
                        projectName={asDisplayName('demo-builder-test')}
                        destination={{ projectTitle: 'Kukla Mesh', workspaceTitle: 'Stage' }}
                    />
                );
                settleStatus(handlers);

                const band = screen.getByTestId('page-destination');
                expect(band).toHaveTextContent('Kukla Mesh');
                expect(band).toHaveTextContent('Stage');
                // The header keeps the LOCAL project name and nothing else.
                expect(screen.getByTestId('page-subtitle')).toHaveTextContent('demo-builder-test');
                expect(screen.getByTestId('page-subtitle')).not.toHaveTextContent('Kukla Mesh');
            });

            /**
             * It sits BELOW the controls and the count, not above them.
             *
             * Third placement, and the reasoning for each rejection is worth
             * keeping. Top of the band: handed the most prominent slot to the
             * least-used fact and pushed the primary actions down a row. Its own
             * row beneath the count: same total height for something that fits in
             * space the count row already wastes.
             *
             * Not back in the header either: that is where it started, as a third
             * crumb, and it is why the LOCAL project name and the REMOTE Adobe
             * destination were indistinguishable.
             */
            it('rides the count row rather than taking a row of its own', () => {
                const handlers = captureHandlers();
                render(
                    <IntegrationsScreen
                        hasAdobeContext
                        appBuilderComponents={{ a: DEPLOYED }}
                        destination={{ projectTitle: 'Kukla Mesh', workspaceTitle: 'Stage' }}
                    />
                );
                settleStatus(handlers);

                // The count row is space-between with an empty right half once a
                // search field shows; the destination fills it instead of costing
                // the band another line.
                const controls = screen.getByTestId('search-header');
                expect(controls).toContainElement(screen.getByTestId('page-destination'));
            });

            it('labels it, the way the dashboard band labels its rows', () => {
                const handlers = captureHandlers();
                render(
                    <IntegrationsScreen
                        hasAdobeContext
                        appBuilderComponents={{ a: DEPLOYED }}
                        destination={{ projectTitle: 'Kukla Mesh', workspaceTitle: 'Stage' }}
                    />
                );
                settleStatus(handlers);

                expect(screen.getByTestId('page-destination')).toHaveTextContent(/deploys to/i);
            });

            it('renders no destination row when there is none — control', () => {
                // DestinationContext returns null on a half-known destination, so
                // the row must not appear as an empty labelled shell.
                const handlers = captureHandlers();
                render(
                    <IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} />
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
