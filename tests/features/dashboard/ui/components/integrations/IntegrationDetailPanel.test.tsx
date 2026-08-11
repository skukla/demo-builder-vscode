/**
 * IntegrationDetailPanel Tests (integrations surface)
 *
 * The detail FLYOUT's content, hosted by the Drawer primitive over the grid
 * (the grid renders one `<IntegrationDetailPanel model={selected | undefined} …/>`;
 * it stays mounted when closed so `.open` can drive the slide):
 *   - header: InlineRenameField only when `canRename` (commit → onRename,
 *     an error string stays visible inline), quiet ✕ → onClose
 *   - body: key/value rows that render ONLY when their datum exists
 *     (Status + message, Source, Destination, URL, APIs, Last deploy, then the
 *     Endpoints group LAST); the integration URL is a Link → onAction(model,'open'),
 *     while the mesh endpoint and every deployed endpoint are click-to-copy
 *     (a GraphQL POST endpoint is not browsable, and an action URL's use is to
 *     leave the panel). Kind is NOT its own row — it is a prefix on Source.
 *   - actions: ONE kebab (model.menuActions), no face button — deploying
 *     offers nothing at all, since every item would race the runner
 *
 * Uses the REAL InlineRenameField (the inline-error pin needs the
 * real field); Spectrum primitives are mocked per the directory convention.
 *
 * Strict TDD: written BEFORE the component exists.
 */

import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { IntegrationDetailPanel } from '@/features/dashboard/ui/components/integrations/IntegrationDetailPanel';
import type { IntegrationCardModel } from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import '@testing-library/jest-dom';

jest.mock('@adobe/react-spectrum', () => ({
    ActionButton: ({ children, onPress, isQuiet: _q, UNSAFE_className, ...props }: any) => (
        <button onClick={onPress} className={UNSAFE_className} {...props}>
            {children}
        </button>
    ),
    Button: ({ children, onPress, isDisabled, variant, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} data-variant={variant} {...props}>
            {children}
        </button>
    ),
    Link: ({ children, onPress, isQuiet, ...props }: any) => (
        <span role="link" tabIndex={0} data-quiet={isQuiet} onClick={onPress} {...props}>
            {children}
        </span>
    ),
    MenuTrigger: ({ children }: any) => <div data-testid="menu-trigger">{children}</div>,
    Menu: ({ children, onAction }: any) => (
        <ul data-testid="card-menu">
            {require('react').Children.map(children, (child: any) =>
                child ? (
                    <li>
                        <button onClick={() => onAction?.(child.key)}>
                            {child.props.children}
                        </button>
                    </li>
                ) : null
            )}
        </ul>
    ),
    Item: ({ children }: any) => <>{children}</>,
    Text: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@spectrum-icons/workflow/More', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-more" />,
}));

jest.mock('@spectrum-icons/workflow/Edit', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-edit" />,
}));

jest.mock('@spectrum-icons/workflow/Close', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-close" />,
}));

/** A deployed custom integration (renamable, full row set). */
function makeModel(overrides: Partial<IntegrationCardModel> = {}): IntegrationCardModel {
    return {
        id: 'custom-app',
        isMesh: false,
        name: 'Custom App',
        kindLabel: 'Imported repo',
        sourceLine: 'acme/custom-app',
        sourceIsAi: false,
        status: 'deployed',
        statusLabel: 'Deployed',
        dotVariant: 'success',
        url: 'https://example.com/app',
        urlLabel: 'App URL',
        deployedUrls: { Frontend: 'https://example.com/front' },
        apis: ['I/O Events', 'I/O Management'],
        lastDeployed: '6/1/2026, 10:00:00 AM',
        menuActions: ['manage-apis', 'remove'],
        canRename: true,
        ...overrides,
    };
}

/** The mesh peer model: no rename, no Manage APIs/Remove, endpoint mono. */
function makeMeshModel(overrides: Partial<IntegrationCardModel> = {}): IntegrationCardModel {
    return makeModel({
        id: 'mesh',
        isMesh: true,
        name: 'API Mesh',
        kindLabel: 'API Mesh',
        // The mesh carries no sourceLine at all (it has no owner/repo).
        sourceLine: undefined,
        url: 'https://mesh.example.com/graphql',
        urlLabel: 'Endpoint',
        deployedUrls: undefined,
        apis: undefined,
        canRename: false,
        ...overrides,
    });
}

function renderPanel(
    model: IntegrationCardModel | undefined,
    extra: { destinationLabel?: string } = {}
) {
    const onClose = jest.fn();
    const onAction = jest.fn();
    const onRename = jest.fn<Promise<string | null>, [string, string]>(() => Promise.resolve(null));
    const view = render(
        <IntegrationDetailPanel
            model={model}
            onClose={onClose}
            onAction={onAction}
            onRename={onRename}
            {...extra}
        />
    );
    const panel = view.container.querySelector('.db-drawer') as HTMLElement;
    return { onClose, onAction, onRename, panel };
}

describe('IntegrationDetailPanel', () => {
    // The flyout stays MOUNTED when closed — `.open` drives the slide, which
    // needs a node already in the tree to animate from.
    it('stays mounted but closed without a model', () => {
        const { panel } = renderPanel(undefined);

        expect(panel).toBeInTheDocument();
        expect(panel).not.toHaveClass('open');
        expect(panel).toHaveAttribute('aria-hidden', 'true');
        expect(panel.querySelector('.integration-panel-row')).toBeNull();
    });

    it('opens with the model name in the header', () => {
        const { panel } = renderPanel(makeModel());

        expect(panel).toHaveClass('open');
        expect(panel).toHaveAttribute('aria-label', 'Custom App details');
        expect(screen.getByText('Custom App')).toBeInTheDocument();
    });

    it('closes via the ✕ button', () => {
        const { onClose } = renderPanel(makeModel());

        fireEvent.click(screen.getByRole('button', { name: 'Close details' }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    describe('rename', () => {
        it('shows the rename field only when canRename', () => {
            renderPanel(makeModel());

            expect(screen.getByRole('button', { name: 'Rename Custom App' })).toBeInTheDocument();
        });

        it('hides the rename field when canRename is false', () => {
            renderPanel(makeModel({ canRename: false }));

            expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument();
        });

        it('commits through onRename(id, name)', async () => {
            const { onRename } = renderPanel(makeModel());

            fireEvent.click(screen.getByRole('button', { name: 'Rename Custom App' }));
            const input = screen.getByRole('textbox');
            fireEvent.change(input, { target: { value: 'Renamed App' } });
            fireEvent.keyDown(input, { key: 'Enter' });
            await act(async () => {});

            expect(onRename).toHaveBeenCalledWith('custom-app', 'Renamed App');
        });

        it('keeps a returned error string visible inline', async () => {
            const { onRename } = renderPanel(makeModel());
            onRename.mockResolvedValueOnce('Name already in use');

            fireEvent.click(screen.getByRole('button', { name: 'Rename Custom App' }));
            const input = screen.getByRole('textbox');
            fireEvent.change(input, { target: { value: 'Taken Name' } });
            fireEvent.keyDown(input, { key: 'Enter' });
            await act(async () => {});

            expect(screen.getByRole('alert')).toHaveTextContent('Name already in use');
        });
    });

    describe('body rows', () => {
        it('renders Status with label and message when present', () => {
            renderPanel(makeModel({ message: 'Deploy step 3 of 5' }));

            expect(screen.getByText('Status')).toBeInTheDocument();
            expect(screen.getByText('Deployed')).toBeInTheDocument();
            expect(screen.getByText('Deploy step 3 of 5')).toBeInTheDocument();
        });

        // The flyout is the card's detail view, so the status has to read the same in
        // both. It used to render an 8px dot, a bare JSX space and a sentence-case
        // label; the card renders a 6px dot, a 6px flex gap and the 11px uppercase
        // treatment. The label text stays "Deployed" — the caps are text-transform,
        // which is why asserting the CLASS is the only way to see this from jsdom.
        it('gives Status the same dot + uppercase treatment as the card', () => {
            renderPanel(makeModel());

            const label = screen.getByText('Deployed');
            expect(label).toHaveClass('integration-card-status');

            const statusline = label.closest('.integration-statusline');
            expect(statusline).not.toBeNull();
            // Dot and label are the two children of one flex row (6px gap), not two
            // nodes separated by a bare JSX space. `rounded-full` is what StatusDot
            // actually emits — there is no `.status-dot` class.
            const children = Array.from(statusline?.children ?? []);
            expect(children).toHaveLength(2);
            expect(children[0]).toHaveClass('rounded-full');
            expect(children[1]).toBe(label);
        });

        it('marks a failed Status with the error colour, as the card does', () => {
            renderPanel(makeModel({ status: 'error', statusLabel: 'Deploy failed' }));

            expect(screen.getByText('Deploy failed')).toHaveClass('integration-card-status--error');
        });

        // Kind and Source were two rows printing the same fact in two registers.
        // Merged into one: the kind is a muted prefix on the identifier.
        it('renders the kind as a prefix on the Source row, with no Kind row', () => {
            const { panel } = renderPanel(makeModel());

            expect(screen.queryByText('Kind')).not.toBeInTheDocument();
            expect(screen.getByText('Source')).toBeInTheDocument();
            expect(panel!.querySelector('.integration-panel-row-prefix')?.textContent).toBe(
                'Imported repo · '
            );
            expect(screen.getByText('acme/custom-app')).toBeInTheDocument();
        });

        // The Source row's mono-modifier pin retired with the row itself; the
        // modifier is still exercised by Destination and the deployed-URL rows
        // below. See "rows that would only restate".

        // The Destination row was described in this suite's own header and in
        // the "rows that would only restate" reasoning, but never asserted. It
        // needs a pin now that the same destination ALSO appears in the page's
        // action band: the two are deliberately allowed to coexist (the band is
        // far top-left and dimmed to 42% behind the scrim, unlike the card
        // sitting directly behind this flyout, which is why the Source row went).
        // Without this test, de-duplicating them later would be a silent
        // regression rather than a decision.
        it('renders Destination when the host supplies one', () => {
            renderPanel(makeModel(), { destinationLabel: 'Kukla Mesh · Stage' });

            expect(screen.getByText('Destination')).toBeInTheDocument();
            expect(screen.getByText('Kukla Mesh · Stage')).toBeInTheDocument();
        });

        it('omits Destination when the project has no Adobe target', () => {
            renderPanel(makeModel());

            expect(screen.queryByText('Destination')).not.toBeInTheDocument();
        });

        it('renders the integration URL as a link firing onAction(open)', () => {
            const model = makeModel();
            const { onAction } = renderPanel(model);

            expect(screen.getByText('App URL')).toBeInTheDocument();
            const link = screen.getByRole('link', { name: 'https://example.com/app' });
            fireEvent.click(link);

            expect(onAction).toHaveBeenCalledWith(model, 'open');
        });

        // These rows are the app's deployed endpoint URLs, one per action or web
        // asset. Before 2026-08-04 they were inert mono text sitting directly under
        // an endpoint row that WAS copyable and a URL row that WAS a link — three
        // kinds of URL, three affordances, in one panel. An endpoint's whole use is
        // to leave the panel and land in curl or a browser, so it gets the same
        // click-to-copy the mesh endpoint already had.
        it('renders each deployed URL as click-to-copy under one Endpoints heading', () => {
            const { panel } = renderPanel(
                makeModel({
                    deployedUrls: {
                        Frontend: 'https://example.com/front',
                        'generic/fetch': 'https://example.com/api/fetch',
                    },
                })
            );

            // ONE heading for the group, not one per row: N unlabelled mono rows
            // read as metadata peers of Status and Kind, which is what made the
            // list look like information with nothing to do.
            expect(panel!.querySelectorAll('.integration-panel-group-label')).toHaveLength(1);
            expect(screen.getByText('Endpoints')).toBeInTheDocument();

            expect(screen.getByText('Frontend')).toBeInTheDocument();
            expect(screen.getByText('fetch')).toBeInTheDocument();
            for (const url of ['https://example.com/front', 'https://example.com/api/fetch']) {
                expect(screen.getByText(url, { selector: '.copyable-text' })).toHaveAttribute(
                    'role',
                    'button'
                );
            }
            // The App URL above them stays a navigable link — a browsable page and
            // an endpoint are different things and keep different affordances.
            expect(
                screen.getByRole('link', { name: 'https://example.com/app' })
            ).toBeInTheDocument();
        });

        // `aio app get-url --json` returns ONE flat map, and parseGetUrlOutput picks
        // the primary `url` by finding the first web/ key INSIDE it — so the primary
        // is always also an entry. Verified byte-identical on both live integrations
        // (`runtime/crm-integration/hello`). Printing it twice gives two identical
        // copy targets stacked, and the old fixture hid it by giving `url` and the
        // lone entry different values — a shape production never produces.
        it('omits the entry that merely repeats the primary URL', () => {
            renderPanel(
                makeModel({
                    url: 'https://example.com/api/v1/web/acme/hello',
                    deployedUrls: {
                        'runtime/acme/hello': 'https://example.com/api/v1/web/acme/hello',
                        'runtime/acme/sync': 'https://example.com/api/v1/web/acme/sync',
                    },
                })
            );

            expect(screen.queryByText('hello')).not.toBeInTheDocument();
            expect(screen.getByText('sync')).toBeInTheDocument();
            // One copy target for that URL, not two.
            expect(
                screen.queryAllByText('https://example.com/api/v1/web/acme/hello', {
                    selector: '.copyable-text',
                })
            ).toHaveLength(0);
        });

        // A single-web-action integration is the common case today, and its one
        // entry IS the primary — so the whole group drops out rather than heading a
        // list of nothing.
        it('drops the group entirely when the primary was its only entry', () => {
            renderPanel(
                makeModel({
                    url: 'https://example.com/api/v1/web/acme/hello',
                    deployedUrls: {
                        'runtime/acme/hello': 'https://example.com/api/v1/web/acme/hello',
                    },
                })
            );

            expect(screen.queryByText('Endpoints')).not.toBeInTheDocument();
        });

        // The Endpoints group is the only unbounded thing in the panel — it grows
        // with the app's web actions while every other row is fixed at one. Placed
        // above the metadata it strands `APIs in use` and `Last deploy` below a
        // scroll; placed last, the drawer's own overflow absorbs the length. That
        // ordering is what makes a nested scroll container unnecessary, so a later
        // move back up would quietly reintroduce the problem it solves.
        it('renders the unbounded Endpoints group AFTER the fixed-size rows', () => {
            const { panel } = renderPanel(
                makeModel({
                    url: undefined,
                    deployedUrls: { 'runtime/acme/sync': 'https://example.com/sync' },
                })
            );

            const labels = Array.from(
                panel!.querySelectorAll(
                    '.integration-panel-row-key, .integration-panel-group-label'
                )
            ).map((n) => n.textContent);

            expect(labels.indexOf('Endpoints')).toBeGreaterThan(labels.indexOf('APIs in use'));
            expect(labels.indexOf('Endpoints')).toBeGreaterThan(labels.indexOf('Last deploy'));
            expect(labels[labels.length - 1]).toBe('sync');
        });

        // Keys arrive as `runtime/<package>/<action>` paths, and the package IS the
        // integration id already titling the panel. In an 88px key column the full
        // path wraps to three cramped lines — times N actions, a wall.
        it('labels each endpoint by its last path segment', () => {
            renderPanel(
                makeModel({
                    url: undefined,
                    deployedUrls: {
                        'runtime/crm-integration/hello': 'https://example.com/a',
                        'web/index.html': 'https://example.com/b',
                        Frontend: 'https://example.com/c',
                    },
                })
            );

            expect(screen.getByText('hello')).toBeInTheDocument();
            expect(screen.getByText('index.html')).toBeInTheDocument();
            // A key with no path separator is already short — left alone.
            expect(screen.getByText('Frontend')).toBeInTheDocument();
            expect(screen.queryByText('runtime/crm-integration/hello')).not.toBeInTheDocument();
        });

        it('renders APIs ONE PER LINE and the Last deploy row', () => {
            const { panel } = renderPanel(makeModel());

            expect(screen.getByText('APIs in use')).toBeInTheDocument();
            // One element per API, not a comma-joined run — three long Adobe API
            // names read as noise on one line in a 352px panel.
            const apis = panel!.querySelectorAll('.integration-panel-api');
            expect(Array.from(apis).map((n) => n.textContent)).toEqual([
                'I/O Events',
                'I/O Management',
            ]);
            expect(screen.getByText('Last deploy')).toBeInTheDocument();
            expect(screen.getByText('6/1/2026, 10:00:00 AM')).toBeInTheDocument();
        });

        it('omits every row whose datum is absent', () => {
            renderPanel(
                makeModel({
                    message: undefined,
                    url: undefined,
                    deployedUrls: undefined,
                    apis: undefined,
                    lastDeployed: undefined,
                })
            );

            expect(screen.queryByText('App URL')).not.toBeInTheDocument();
            expect(screen.queryByText('APIs in use')).not.toBeInTheDocument();
            expect(screen.queryByText('Last deploy')).not.toBeInTheDocument();
            expect(screen.queryByText('Frontend')).not.toBeInTheDocument();
            // The heading is part of the group, so it goes with it — an "Endpoints"
            // label over nothing is the empty-label case the row guards prevent.
            expect(screen.queryByText('Endpoints')).not.toBeInTheDocument();
        });
    });

    // The flyout MIRRORS the card: the at-most-one attention verb as a button,
    // everything deliberate behind the same kebab the card uses. It used to carry
    // a row of Buttons holding those same actions — a third control for them,
    // which is what made the three surfaces disagree.
    describe('actions', () => {
        it('renders the status verb as a menu item and fires onAction', () => {
            const model = makeModel({
                status: 'not-deployed',
                statusLabel: 'Not deployed',
                menuActions: ['deploy', 'manage-apis', 'remove'],
            });
            const { onAction } = renderPanel(model);

            fireEvent.click(screen.getByRole('button', { name: /^deploy$/i }));

            expect(onAction).toHaveBeenCalledWith(model, 'deploy');
        });

        it('puts the deliberate actions behind the kebab, not in a button row', () => {
            const model = makeModel({
                menuActions: ['open', 'redeploy', 'manage-apis', 'remove'],
            });
            const { onAction } = renderPanel(model);

            // The kebab mock renders its items as buttons inside `card-menu`;
            // what matters is that they are in the MENU, not loose in the panel.
            const menu = screen.getByTestId('card-menu');
            expect(within(menu).getByText('Redeploy')).toBeInTheDocument();
            expect(within(menu).getByText('Manage APIs')).toBeInTheDocument();
            expect(within(menu).getByText('Remove')).toBeInTheDocument();

            fireEvent.click(within(menu).getByRole('button', { name: 'Redeploy' }));
            expect(onAction).toHaveBeenCalledWith(model, 'redeploy');
        });

        // A healthy card is calm — no verb. Redeploy is reachable, but only
        // through the kebab, which is the whole point of moving it there.
        it('shows no attention verb on a deployed integration', () => {
            renderPanel(makeModel({ menuActions: ['redeploy'] }));

            expect(screen.queryByRole('button', { name: 'Deploy' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Update' })).not.toBeInTheDocument();
            expect(
                within(screen.getByTestId('card-menu')).getByText('Redeploy')
            ).toBeInTheDocument();
        });

        it('offers nothing at all mid-deploy — every action would race the runner', () => {
            renderPanel(
                makeModel({
                    status: 'deploying',
                    statusLabel: 'Deploying…',
                    menuActions: [],
                })
            );

            expect(screen.queryByTestId('card-menu')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Deploy' })).not.toBeInTheDocument();
        });
    });

    describe('rows that would only restate', () => {
        // Source RETURNED here (2026-08-03) when the card face stopped carrying it.
        // The row was cut originally because the scrimmed card behind this flyout
        // already showed the line — that reason went with the line.
        it.each([
            ['imported', makeModel({ sourceLine: 'acme/custom-app' }), 'acme/custom-app'],
            [
                'pre-built',
                makeModel({ kindLabel: 'Pre-built', sourceLine: 'acme/erp-sync' }),
                'acme/erp-sync',
            ],
        ])('renders Source as a mono identifier (%s)', (_label, model, line) => {
            renderPanel(model);

            expect(screen.getByText('Source')).toBeInTheDocument();
            expect(screen.getByText(line)).toBeInTheDocument();
        });

        // The blank starter's line is prose, not an identifier — it must not be
        // typeset as one.
        // The blank starter is where the duplication was loudest: its kind and its
        // source line were the same sentence twice. It has no repo, so the kind
        // stands alone as the value — prose, never typeset as an identifier.
        it('shows the blank starter its kind alone, unmonospaced and unprefixed', () => {
            const { panel } = renderPanel(
                makeModel({
                    kindLabel: 'Custom · blank starter',
                    sourceLine: 'Blank starter — build it out',
                    sourceIsAi: true,
                })
            );

            const value = screen.getByText('Custom · blank starter');
            expect(value.className).not.toContain('mono');
            expect(panel!.querySelector('.integration-panel-row-prefix')).toBeNull();
            expect(screen.queryByText('Blank starter — build it out')).not.toBeInTheDocument();
        });

        it('omits Source for the mesh, which has no owner/repo', () => {
            renderPanel(makeMeshModel());

            expect(screen.queryByText('Source')).not.toBeInTheDocument();
        });

        it('KEEPS catalog vs imported apart — now via the prefix', () => {
            // A pre-built entry and an imported repo can carry the same owner/repo.
            // The kind is the only thing distinguishing them, so merging the rows
            // had to preserve it rather than drop it.
            const { panel } = renderPanel(makeModel({ kindLabel: 'Pre-built' }));

            expect(panel!.querySelector('.integration-panel-row-prefix')?.textContent).toBe(
                'Pre-built · '
            );
            expect(screen.getByText('acme/custom-app')).toBeInTheDocument();
        });

        // Status restates the card too but is deliberately KEPT: `model.message`
        // (live deploy progress / failure detail) exists nowhere else, and the
        // action bar's verbs read as arbitrary without it.
        it('keeps Status, whose message has no other home', () => {
            renderPanel(makeModel({ status: 'error', statusLabel: 'Failed', message: 'exit 1' }));

            expect(screen.getByText('Status')).toBeInTheDocument();
            expect(screen.getByText('exit 1')).toBeInTheDocument();
        });
    });

    describe('mesh asymmetry', () => {
        it('omits Kind — it would read "API Mesh" under a title reading "API Mesh"', () => {
            renderPanel(makeMeshModel());

            expect(screen.queryByText('Kind')).not.toBeInTheDocument();
        });

        it('shows no role tag, no rename field, no Manage APIs/Remove', () => {
            renderPanel(makeMeshModel({ menuActions: [] }));

            // The "Data layer" tag was jargon carrying no actionable information —
            // removed rather than restyled.
            expect(screen.queryByText('Data layer')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Manage APIs' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
        });

        it('renders the mesh endpoint as CLICK-TO-COPY, never a navigable link', () => {
            renderPanel(makeMeshModel());

            expect(screen.getByText('Endpoint')).toBeInTheDocument();
            // A GraphQL endpoint answers POSTs, so it must never navigate — but it
            // IS the value a user needs to get out, hence copy-on-click.
            const value = screen.getByText('https://mesh.example.com/graphql', {
                selector: '.copyable-text',
            });
            expect(value).toHaveAttribute('role', 'button');
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        });
    });
});
