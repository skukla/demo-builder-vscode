/**
 * IntegrationDetailPanel Tests (integrations surface)
 *
 * The detail FLYOUT's content, hosted by the Drawer primitive over the grid
 * (the grid renders one `<IntegrationDetailPanel model={selected | undefined} …/>`;
 * it stays mounted when closed so `.open` can drive the slide):
 *   - header: InlineRenameField only when `canRename` (commit → onRename,
 *     an error string stays visible inline), quiet ✕ → onClose
 *   - body: key/value rows that render ONLY when their datum exists. Two tiers
 *     since 2026-10-01: Status (with the last deploy time on the same line, and
 *     the message under it) stays open; Source, URL, APIs and the Endpoints group
 *     (LAST) fold under one collapsed "Details" disclosure. There is no
 *     Destination row — the page band names it. The integration URL is a Link →
 *     onAction(model,'open-url'), while the mesh endpoint and every deployed
 *     endpoint are click-to-copy (a GraphQL POST endpoint is not browsable, and
 *     an action URL's use is to leave the panel). Kind is NOT its own row — it is
 *     a prefix on Source.
 *   - actions: ONE kebab (model.menuActions), no face button — deploying
 *     offers nothing at all, since every item would race the runner
 *
 * Uses the REAL InlineRenameField (the inline-error pin needs the
 * real field); Spectrum primitives are mocked per the directory convention.
 *
 * Strict TDD: written BEFORE the component exists.
 */

import { IntegrationDetailPanel } from './IntegrationDetailPanel.testUtils';
import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import type { IntegrationCardModel } from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import '@testing-library/jest-dom';

/** A deployed custom integration (renamable, full row set). */
function makeModel(overrides: Partial<IntegrationCardModel> = {}): IntegrationCardModel {
    return {
        id: 'custom-app',
        isMesh: false,
        name: 'Custom App',
        kindLabel: 'Imported repo',
        sourceLine: 'acme/custom-app',
        status: 'deployed',
        statusLabel: 'Deployed',
        dotVariant: 'success',
        url: 'https://example.com/app',
        urlLabel: 'App URL',
        apis: ['I/O Events', 'I/O Management'],
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
        apis: undefined,
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
            onOpenLinked={jest.fn()}
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
            // Dot and label are the children of one flex row (6px gap), not nodes
            // separated by a bare JSX space. `rounded-full` is what StatusDot actually
            // emits — there is no `.status-dot` class. No deploy time: it left the
            // screen with the other technical details (owner, 2026-10-01).
            const children = Array.from(statusline?.children ?? []);
            expect(children).toHaveLength(2);
            expect(children[0]).toHaveClass('rounded-full');
            expect(children[1]).toBe(label);
        });

        it('shows no deploy time beside a status other than Deployed', () => {
            const { panel } = renderPanel(
                makeModel({ status: 'error', statusLabel: 'Deploy failed', dotVariant: 'error' })
            );

            expect(panel!.querySelector('.integration-panel-status-aside')).toBeNull();
        });

        it('marks a failed Status with the error colour, as the card does', () => {
            renderPanel(makeModel({ status: 'error', statusLabel: 'Deploy failed' }));

            expect(screen.getByText('Deploy failed')).toHaveClass('integration-card-status--error');
        });

        // The Destination row went on 2026-10-01: the page's action band already
        // names the destination once, above the grid, and the flyout was the
        // overloaded surface. This pin is the decision, so a return is deliberate.
        it('has no Destination row', () => {
            renderPanel(makeModel());

            expect(screen.queryByText('Destination')).not.toBeInTheDocument();
        });

        it('leaves a healthy Status without the error treatment', () => {
            renderPanel(makeModel());

            expect(screen.getByText('Deployed')).not.toHaveClass('integration-card-status--error');
        });

        it('renders no status-message line at all when the model carries no message', () => {
            // An always-rendered span would leave an empty element under Status
            // holding the row open for nothing.
            const { panel } = renderPanel(makeModel({ message: undefined }));

            expect(panel!.querySelectorAll('.integration-panel-status-message')).toHaveLength(0);
        });

        it('omits every row whose datum is absent', () => {
            renderPanel(
                makeModel({
                    message: undefined,
                    url: undefined,
                    apis: undefined,
                })
            );

            expect(document.querySelectorAll('.integration-panel-status-message')).toHaveLength(0);
            expect(screen.queryByText('Settings')).not.toBeInTheDocument();
            expect(screen.queryByText('Demo setup')).not.toBeInTheDocument();
        });
    });

    /**
     * What the flyout leaves off the screen (owner, 2026-10-01: "consider what items in
     * each are truly useful for an SC" — not a Details accordion). Source, the app URL,
     * the APIs and the deployed endpoints are developer facts: an agent reads them
     * through the extension's tools, support works from Diagnostics and the Debug Logs.
     */
    describe('what the flyout leaves out', () => {
        it('shows no Source, App URL, APIs or Endpoints even when the model carries them', () => {
            renderPanel(
                makeModel({
                    kindLabel: 'Pre-built',
                    sourceLine: 'acme/erp-sync',
                    url: 'https://example.com/app',
                    apis: ['I/O Events'],
                })
            );

            for (const gone of ['Source', 'App URL', 'APIs in use', 'Endpoints', 'Details']) {
                expect(screen.queryByText(gone)).not.toBeInTheDocument();
            }
            expect(screen.queryByText('acme/erp-sync')).not.toBeInTheDocument();
            expect(screen.queryByText('https://example.com/app')).not.toBeInTheDocument();
            expect(screen.queryByText('I/O Events')).not.toBeInTheDocument();
        });

        // An ERP's flyout exists to get the SC into the ERP: its own home screen shows
        // what it holds and its work, so the flyout does not repeat any of it.
        it("puts an ERP's screen first, as the main button, and no Screen row", () => {
            const model = makeModel({
                id: 'demo-erp',
                name: 'Justrite ERP',
                isSystem: true,
                url: 'https://erp.example.com/screen',
                urlLabel: 'Screen',
                canRename: false,
            });
            const { onAction } = renderPanel(model);

            fireEvent.click(screen.getByRole('button', { name: 'Open Justrite ERP' }));

            expect(onAction).toHaveBeenCalledWith(model, 'open');
            expect(screen.queryByText('Screen')).not.toBeInTheDocument();
        });

        it('offers no such button on an integration — the control', () => {
            renderPanel(makeModel());

            expect(screen.queryByRole('button', { name: /^Open / })).not.toBeInTheDocument();
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
                    statusLabel: 'Deploying',
                    menuActions: [],
                })
            );

            expect(screen.queryByTestId('card-menu')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Deploy' })).not.toBeInTheDocument();
        });
    });

    describe('rows that would only restate', () => {
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
