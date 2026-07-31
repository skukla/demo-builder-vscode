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
import { render, screen, fireEvent, act } from '@testing-library/react';
import { IntegrationDetailPanel } from '@/features/dashboard/ui/components/integrations/IntegrationDetailPanel';
import type { IntegrationCardModel } from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import '@testing-library/jest-dom';

jest.mock('@adobe/react-spectrum', () => ({
    ActionButton: ({ children, onPress, isQuiet: _isQuiet, UNSAFE_className, ...props }: any) => (
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
            { action: 'verify', label: 'Verify', emphasis: 'secondary' },
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

function renderPanel(model: IntegrationCardModel | undefined) {
    const onClose = jest.fn();
    const onAction = jest.fn();
    const onRename = jest.fn<Promise<string | null>, [string, string]>(() => Promise.resolve(null));
    const view = render(
        <IntegrationDetailPanel
            model={model}
            onClose={onClose}
            onAction={onAction}
            onRename={onRename}
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

    describe('action bar', () => {
        it('maps emphasis to button variants and fires onAction', () => {
            const model = makeModel({
                barActions: [
                    { action: 'deploy', label: 'Deploy', emphasis: 'primary' },
                    { action: 'manage-apis', label: 'Manage APIs', emphasis: 'secondary' },
                    { action: 'remove', label: 'Remove', emphasis: 'danger' },
                ],
                status: 'not-deployed',
                statusLabel: 'Not deployed',
            });
            const { onAction } = renderPanel(model);

            const deploy = screen.getByRole('button', { name: 'Deploy' });
            const manage = screen.getByRole('button', { name: 'Manage APIs' });
            const remove = screen.getByRole('button', { name: 'Remove' });
            expect(deploy).toHaveAttribute('data-variant', 'accent');
            expect(manage).toHaveAttribute('data-variant', 'secondary');
            expect(remove).toHaveAttribute('data-variant', 'negative');

            fireEvent.click(deploy);
            fireEvent.click(manage);
            fireEvent.click(remove);

            expect(onAction).toHaveBeenCalledWith(model, 'deploy');
            expect(onAction).toHaveBeenCalledWith(model, 'manage-apis');
            expect(onAction).toHaveBeenCalledWith(model, 'remove');
        });

        it('honors disabled bar actions', () => {
            renderPanel(
                makeMeshModel({
                    barActions: [
                        {
                            action: 'redeploy',
                            label: 'Redeploy',
                            emphasis: 'secondary',
                            disabled: true,
                        },
                    ],
                })
            );

            expect(screen.getByRole('button', { name: 'Redeploy' })).toBeDisabled();
        });

        it('shows a single disabled Deploying… while deploying', () => {
            renderPanel(
                makeModel({
                    status: 'deploying',
                    statusLabel: 'Deploying…',
                    faceAction: undefined,
                    barActions: [],
                })
            );

            const button = screen.getByRole('button', { name: 'Deploying…' });
            expect(button).toBeDisabled();
        });
    });

    describe('rows that would only restate', () => {
        // `sourceLine` is the CARD's face line, and the card sits scrimmed behind
        // this flyout the whole time it is open — so the row printed it twice and
        // carried nothing of its own. Universal, not per-variant: there is no
        // model shape that brings it back.
        it.each([
            ['imported', makeModel({ sourceLine: 'acme/custom-app' })],
            ['pre-built', makeModel({ kindLabel: 'Pre-built', sourceLine: 'acme/erp-sync' })],
            [
                'AI-built',
                makeModel({
                    kindLabel: 'Custom · built with AI',
                    sourceLine: 'Built with AI',
                    sourceIsAi: true,
                }),
            ],
            ['mesh', makeMeshModel()],
        ])('never renders Source (%s)', (_label, model) => {
            renderPanel(model);

            expect(screen.queryByText('Source')).not.toBeInTheDocument();
            // The mesh has no sourceLine at all, so there is nothing to look for.
            if (model.sourceLine) {
                expect(screen.queryByText(model.sourceLine)).not.toBeInTheDocument();
            }
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
            renderPanel(makeMeshModel());

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
