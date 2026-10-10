/**
 * IntegrationDetailPanel Tests (integrations surface)
 *
 * The detail FLYOUT's content, hosted by the Drawer primitive over the grid
 * (the grid renders one `<IntegrationDetailPanel model={selected | undefined} …/>`;
 * it stays mounted when closed so `.open` can drive the slide):
 *   - header: InlineRenameField only when `canRename` (commit → onRename,
 *     an error string stays visible inline), quiet ✕ → onClose
 *   - a health line under the title: the status (dot + uppercase label), and the
 *     live message under it; no "Status" key (owner, 2026-10-01)
 *   - body: rows that render ONLY when their datum exists — Connected to, the
 *     mesh's Commerce scope and its click-to-copy endpoint. Source, URL, APIs and
 *     endpoints are not on screen at all. There is no Destination row.
 *   - actions: a visible list of quiet rows (model.menuActions), removal last
 *     behind a divider; no kebab in the flyout. Deploying offers nothing at all,
 *     since every item would race the runner
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
        it('renders the health line with label and message when present, and no Status key', () => {
            const { panel } = renderPanel(makeModel({ message: 'Deploy step 3 of 5' }));

            const health = panel.querySelector('.integration-panel-health') as HTMLElement;
            expect(within(health).getByText('Deployed')).toBeInTheDocument();
            expect(screen.queryByText('Status')).not.toBeInTheDocument();
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
        it("puts an ERP's screen first in the actions, by the ERP's name, and no Screen row", () => {
            const model = makeModel({
                id: 'demo-erp',
                name: 'Justrite ERP',
                isSystem: true,
                url: 'https://erp.example.com/screen',
                urlLabel: 'Screen',
                canRename: false,
                menuActions: ['open', 'load-demo-data', 'redeploy', 'remove'],
            });
            const { onAction, panel } = renderPanel(model);

            const rows = Array.from(panel.querySelectorAll('.integration-panel-action'));
            expect(rows.map((row) => row.textContent)).toStrictEqual([
                'Open Justrite ERP',
                'Fill from Commerce',
                'Redeploy',
                'Remove',
            ]);
            fireEvent.click(screen.getByRole('button', { name: 'Open Justrite ERP' }));

            expect(onAction).toHaveBeenCalledWith(model, 'open');
            expect(screen.queryByText('Screen')).not.toBeInTheDocument();
        });

        it("names an integration's open by where it goes — the control", () => {
            renderPanel(makeModel({ menuActions: ['open'] }));

            expect(
                screen.getByRole('button', { name: 'Open in Developer Console' })
            ).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Open Custom App' })).not.toBeInTheDocument();
        });
    });

    // The flyout lists the card's own verbs, named by the same function the card's
    // menu uses, so the two cannot disagree. Visible rather than behind a kebab
    // (owner, 2026-10-01: "three dots menus are hard to see and easy to miss").
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

        it('lists the actions visibly, with no kebab, and Remove last behind a divider', () => {
            const model = makeModel({
                menuActions: ['open', 'redeploy', 'manage-apis', 'remove'],
            });
            const { onAction, panel } = renderPanel(model);

            expect(screen.queryByTestId('card-menu')).not.toBeInTheDocument();
            const list = panel.querySelector('.integration-panel-actions') as HTMLElement;
            const items = Array.from(list.children);
            expect(items.map((item) => item.textContent)).toStrictEqual([
                'Open in Developer Console',
                'Redeploy',
                'Manage APIs',
                '',
                'Remove',
            ]);
            expect(items[3]).toHaveClass('integration-panel-actions-divider');
            expect(within(list).getByRole('button', { name: 'Remove' })).toHaveClass('is-danger');

            fireEvent.click(within(list).getByRole('button', { name: 'Redeploy' }));
            expect(onAction).toHaveBeenCalledWith(model, 'redeploy');
        });

        // A healthy card is calm — no attention verb, and no divider with nothing
        // destructive after it.
        it('shows no attention verb on a deployed integration', () => {
            const { panel } = renderPanel(makeModel({ menuActions: ['redeploy'] }));

            expect(screen.queryByRole('button', { name: 'Deploy' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Update' })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Redeploy' })).toBeInTheDocument();
            expect(panel.querySelector('.integration-panel-actions-divider')).toBeNull();
        });

        // The Demo setup section's link is the flyout's own way into the guide; the
        // grid opens it, as it opens every other action.
        it('opens the setup guide through onAction, for the integration on screen', () => {
            const model = makeModel({
                setupChecklist: [
                    {
                        id: 'confirmed-status',
                        title: 'Create the order status',
                        why: 'why',
                        where: 'Stores > Settings > Order Status',
                        state: 'open',
                        checkable: false,
                    },
                ],
            });
            const { onAction, panel } = renderPanel(model);

            const section = within(panel).getByRole('region', { name: 'Demo setup' });
            fireEvent.click(within(section).getByText('Open setup guide'));

            expect(onAction).toHaveBeenCalledTimes(1);
            expect(onAction).toHaveBeenCalledWith(model, 'setup-guide');
        });

        it('offers nothing at all mid-deploy — every action would race the runner', () => {
            renderPanel(
                makeModel({
                    status: 'deploying',
                    statusLabel: 'Deploying',
                    menuActions: [],
                })
            );

            expect(screen.queryByText('Actions')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Deploy' })).not.toBeInTheDocument();
        });
    });

    describe('rows that would only restate', () => {
        // The status restates the card too but is deliberately KEPT: `model.message`
        // (live deploy progress / failure detail) exists nowhere else, and the
        // actions read as arbitrary without it.
        it('keeps the health line, whose message has no other home', () => {
            const { panel } = renderPanel(
                makeModel({ status: 'error', statusLabel: 'Failed', message: 'exit 1' })
            );

            const health = panel.querySelector('.integration-panel-health') as HTMLElement;
            expect(within(health).getByText('Failed')).toBeInTheDocument();
            expect(within(health).getByText('exit 1')).toBeInTheDocument();
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
