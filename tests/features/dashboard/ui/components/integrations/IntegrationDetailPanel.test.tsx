/**
 * IntegrationDetailPanel Tests (integrations surface)
 *
 * The detail panel content, rendered beside the grid (the grid
 * renders one `<IntegrationDetailPanel model={selected | undefined} …/>`):
 *   - header: InlineRenameField only when `canRename` (commit → onRename,
 *     an error string stays visible inline), mesh "Data layer" role tag,
 *     quiet ✕ → onClose
 *   - body: key/value rows that render ONLY when their datum exists
 *     (Status + message, Kind, Source, URL(s), APIs, Last deploy); the
 *     integration URL is a Link → onAction(model,'open'); the mesh endpoint
 *     is mono TEXT (GraphQL POST endpoint — not browsable)
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
        sourceLine: 'GraphQL bridge · Adobe I/O',
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
    const panel = view.container.querySelector('.integration-panel') as HTMLElement;
    return { onClose, onAction, onRename, panel };
}

describe('IntegrationDetailPanel', () => {
    // The panel is non-modal and page-scoped: with no selection it renders
    // NOTHING at all, rather than staying mounted-but-hidden the way the
    // superseded viewport drawer did (it needed a mounted node to slide).
    it('renders nothing without a model', () => {
        const { panel } = renderPanel(undefined);

        expect(panel).toBeNull();
    });

    it('renders with the model name in the header', () => {
        const { panel } = renderPanel(makeModel());

        expect(panel).toBeInTheDocument();
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

        it('renders Kind and Source (mono when not AI)', () => {
            renderPanel(makeModel());

            expect(screen.getByText('Imported repo')).toBeInTheDocument();
            expect(screen.getByText('acme/custom-app')).toHaveClass(
                'integration-panel-row-value--mono'
            );
        });

        it('drops the mono modifier for the AI source caption', () => {
            renderPanel(makeModel({ sourceLine: 'Built with AI', sourceIsAi: true }));

            expect(screen.getByText('Built with AI')).not.toHaveClass(
                'integration-panel-row-value--mono'
            );
        });

        it('renders the integration URL as a link firing onAction(open)', () => {
            const model = makeModel();
            const { onAction } = renderPanel(model);

            expect(screen.getByText('App URL')).toBeInTheDocument();
            const link = screen.getByRole('link', { name: 'https://example.com/app' });
            fireEvent.click(link);

            expect(onAction).toHaveBeenCalledWith(model, 'open');
        });

        it('renders each deployed URL row', () => {
            renderPanel(makeModel());

            expect(screen.getByText('Frontend')).toBeInTheDocument();
            expect(screen.getByText('https://example.com/front')).toBeInTheDocument();
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

    describe('mesh asymmetry', () => {
        it('shows the Data layer role tag, no rename field, no Manage APIs/Remove', () => {
            renderPanel(makeMeshModel());

            expect(screen.getByText('Data layer')).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Manage APIs' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
        });

        it('renders the mesh endpoint as mono TEXT, never a link', () => {
            renderPanel(makeMeshModel());

            expect(screen.getByText('Endpoint')).toBeInTheDocument();
            const value = screen.getByText('https://mesh.example.com/graphql');
            expect(value).toHaveClass('integration-panel-row-value--mono');
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        });
    });
});
