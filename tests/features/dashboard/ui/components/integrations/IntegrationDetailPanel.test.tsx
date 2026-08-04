/**
 * IntegrationDetailPanel Tests (integrations surface)
 *
 * The detail FLYOUT's content, hosted by the Drawer primitive over the grid
 * (the grid renders one `<IntegrationDetailPanel model={selected | undefined} …/>`;
 * it stays mounted when closed so `.open` can drive the slide):
 *   - header: InlineRenameField only when `canRename` (commit → onRename,
 *     an error string stays visible inline), quiet ✕ → onClose
 *   - body: key/value rows that render ONLY when their datum exists
 *     (Status + message, Kind, Destination, URL(s), APIs, Last deploy); the
 *     integration URL is a Link → onAction(model,'open'); the mesh endpoint
 *     is click-to-copy mono TEXT (GraphQL POST endpoint — not browsable).
 *     There is NO Source row — it reprinted the card's own face line.
 *   - action bar: model.barActions with emphasis→variant mapping and
 *     disabled honored; deploying → a single disabled "Deploying…"
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
        faceAction: { kind: 'open', url: 'https://example.com/app' },
        barActions: [
            { action: 'redeploy', label: 'Redeploy', emphasis: 'secondary' },
            { action: 'manage-apis', label: 'Manage APIs', emphasis: 'secondary' },
            { action: 'remove', label: 'Remove', emphasis: 'danger' },
        ],
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
        faceAction: undefined,
        barActions: [{ action: 'redeploy', label: 'Redeploy', emphasis: 'secondary' }],
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

        it('renders Kind', () => {
            renderPanel(makeModel());

            expect(screen.getByText('Kind')).toBeInTheDocument();
            expect(screen.getByText('Imported repo')).toBeInTheDocument();
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

        it('renders each deployed URL row (mono)', () => {
            renderPanel(makeModel());

            expect(screen.getByText('Frontend')).toBeInTheDocument();
            expect(screen.getByText('https://example.com/front')).toHaveClass(
                'integration-panel-row-value--mono'
            );
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
        });
    });

    // The flyout MIRRORS the card: the at-most-one attention verb as a button,
    // everything deliberate behind the same kebab the card uses. It used to carry
    // a row of Buttons holding those same actions — a third control for them,
    // which is what made the three surfaces disagree.
    describe('actions', () => {
        it('renders the attention verb as a button and fires onAction', () => {
            const model = makeModel({
                status: 'not-deployed',
                statusLabel: 'Not deployed',
                faceAction: { kind: 'deploy' },
                menuActions: ['manage-apis', 'remove'],
            });
            const { onAction } = renderPanel(model);

            fireEvent.click(screen.getByRole('button', { name: 'Deploy' }));

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
            renderPanel(makeModel({ faceAction: undefined, menuActions: ['redeploy'] }));

            expect(screen.queryByRole('button', { name: 'Deploy' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Update' })).not.toBeInTheDocument();
            expect(within(screen.getByTestId('card-menu')).getByText('Redeploy')).toBeInTheDocument();
        });

        it('offers nothing at all mid-deploy — every action would race the runner', () => {
            renderPanel(
                makeModel({
                    status: 'deploying',
                    statusLabel: 'Deploying…',
                    faceAction: undefined,
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
        it('renders the blank-starter caption WITHOUT the mono treatment', () => {
            renderPanel(
                makeModel({
                    kindLabel: 'Custom · blank starter',
                    sourceLine: 'Blank starter — build it out',
                    sourceIsAi: true,
                })
            );

            const value = screen.getByText('Blank starter — build it out');
            expect(value).toBeInTheDocument();
            expect(value.className).not.toContain('mono');
        });

        it('omits Source for the mesh, which has no owner/repo', () => {
            renderPanel(makeMeshModel());

            expect(screen.queryByText('Source')).not.toBeInTheDocument();
        });

        it('KEEPS Kind for catalog vs imported — it is now the ONLY thing telling them apart', () => {
            // With Source gone, a pre-built entry and an imported repo differ by
            // this row alone. Cutting Kind too would make them identical.
            renderPanel(makeModel({ kindLabel: 'Pre-built' }));

            expect(screen.getByText('Kind')).toBeInTheDocument();
            expect(screen.getByText('Pre-built')).toBeInTheDocument();
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
