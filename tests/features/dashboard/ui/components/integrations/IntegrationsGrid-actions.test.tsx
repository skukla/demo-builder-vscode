/**
 * IntegrationsGrid Tests — detail panel, dispatch, dialogs, rename, add
 * (integrations grid, Step 7 — the cutover)
 *
 * The interaction half of the grid: the detail panel it opens, the ONE handleAction
 * switch that turns a card model into an id-scoped message or a mesh callback,
 * the two dialogs it hosts as single shared instances (remove-confirm and
 * Manage APIs — both ported from the retired AppBuilderComponentsList suite),
 * in-panel rename, and the add flow.
 *
 * Composition and the live push channels live in IntegrationsGrid.test.tsx;
 * the shared harness in IntegrationsGrid.testUtils.tsx.
 *
 * Strict TDD: written BEFORE the component exists.
 */

import { screen, within, waitFor } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import {
    card,
    DEPLOYED_INTEGRATION,
    getClient,
    MESH_COMPONENT,
    openPanel,
    renderGrid,
    resetGridMocks,
    setupUser,
    twoDeployed,
} from './IntegrationsGrid.testUtils';

/** One deployed custom integration (non-catalog id ⇒ renamable). */
function oneDeployed() {
    return { 'custom-app': { ...DEPLOYED_INTEGRATION } };
}

beforeEach(() => {
    resetGridMocks();
});

describe('IntegrationsGrid actions', () => {
    describe('detail panel open/close', () => {
        it('opens the detail panel on card click', async () => {
            const user = setupUser();
            renderGrid({ appBuilderComponents: oneDeployed() });

            const panel = await openPanel(user, 'custom-app', 'Deployed');
            expect(panel).toBeInTheDocument();
        });

        it('closes the panel on ✕', async () => {
            const user = setupUser();
            renderGrid({ appBuilderComponents: oneDeployed() });

            const panel = await openPanel(user, 'custom-app', 'Deployed');
            await user.click(within(panel).getByRole('button', { name: /close details/i }));

            expect(
                screen.queryByLabelText('custom-app details'),
            ).not.toBeInTheDocument();
        });

        it('a face affordance does NOT open the panel (stop-propagation containment)', async () => {
            const user = setupUser();
            renderGrid({
                appBuilderComponents: {
                    'custom-app': { ...DEPLOYED_INTEGRATION, status: 'not-deployed' },
                },
            });

            const tile = card('custom-app', 'Not deployed');
            await user.click(within(tile).getByRole('button', { name: /^deploy$/i }));

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(getClient().postMessage).toHaveBeenCalledWith('deployAppBuilderComponent', {
                id: 'custom-app',
            });
        });
    });

    describe('action dispatch (the ONE handleAction switch)', () => {
        it('routes the card-face Deploy to deployAppBuilderComponent', async () => {
            const user = setupUser();
            renderGrid({
                appBuilderComponents: {
                    'custom-app': { ...DEPLOYED_INTEGRATION, status: 'not-deployed' },
                },
            });

            const tile = card('custom-app', 'Not deployed');
            await user.click(within(tile).getByRole('button', { name: /^deploy$/i }));

            expect(getClient().postMessage).toHaveBeenCalledWith('deployAppBuilderComponent', {
                id: 'custom-app',
            });
        });

        it('routes panel Redeploy to redeployAppBuilderComponent', async () => {
            const user = setupUser();
            renderGrid({ appBuilderComponents: oneDeployed() });

            const panel = await openPanel(user, 'custom-app', 'Deployed');
            await user.click(within(panel).getByRole('button', { name: /^redeploy$/i }));

            expect(getClient().postMessage).toHaveBeenCalledWith('redeployAppBuilderComponent', {
                id: 'custom-app',
            });
        });

        it('routes an error card Retry to deployAppBuilderComponent', async () => {
            const user = setupUser();
            renderGrid({
                appBuilderComponents: {
                    'custom-app': { ...DEPLOYED_INTEGRATION, status: 'error' },
                },
            });

            const tile = card('custom-app', 'Deploy failed');
            await user.click(within(tile).getByRole('button', { name: /^retry$/i }));

            expect(getClient().postMessage).toHaveBeenCalledWith('deployAppBuilderComponent', {
                id: 'custom-app',
            });
        });

        it('routes a stale card Update to redeployAppBuilderComponent', async () => {
            const user = setupUser();
            renderGrid({
                appBuilderComponents: {
                    'custom-app': { ...DEPLOYED_INTEGRATION, status: 'stale' },
                },
            });

            const tile = card('custom-app', 'Update available');
            await user.click(within(tile).getByRole('button', { name: /^update$/i }));

            expect(getClient().postMessage).toHaveBeenCalledWith('redeployAppBuilderComponent', {
                id: 'custom-app',
            });
        });

        // Open moved from the card FACE to the kebab (a healthy card is calm), so
        // this is a menu item scoped to the tile now.
        it('routes the deployed card Open to openLiveSite with the primary url', async () => {
            const user = setupUser();
            renderGrid({ appBuilderComponents: oneDeployed() });

            const tile = card('custom-app', 'Deployed');
            await user.click(within(tile).getByRole('button', { name: /^open$/i }));

            expect(getClient().postMessage).toHaveBeenCalledWith('openLiveSite', {
                url: 'https://custom-app.example.com',
            });
        });
    });

    describe('mesh card routing (mesh callbacks, never keyed messages)', () => {
        it('routes the mesh panel Redeploy to onDeployMesh', async () => {
            const user = setupUser();
            const { onDeployMesh } = renderGrid({ withMesh: true });

            const panel = await openPanel(user, 'API Mesh', 'Deployed');
            await user.click(within(panel).getByRole('button', { name: /^redeploy$/i }));

            expect(onDeployMesh).toHaveBeenCalled();
            expect(getClient().postMessage).not.toHaveBeenCalledWith(
                'redeployAppBuilderComponent',
                expect.anything(),
            );
        });

        // No mesh COMPONENT exists here (withMesh renders the peer card from mesh
        // status alone). removeAppBuilderComponent looks the entry up by id, so
        // offering Remove without one would confirm a guaranteed "not found".
        it('offers no Manage APIs, and no Remove without a mesh component', async () => {
            const user = setupUser();
            renderGrid({ withMesh: true });

            const panel = await openPanel(user, 'API Mesh', 'Deployed');

            expect(
                within(panel).queryByRole('button', { name: /manage apis/i }),
            ).not.toBeInTheDocument();
            expect(
                within(panel).queryByRole('button', { name: /^remove$/i }),
            ).not.toBeInTheDocument();
        });

        // The mesh's card id is the literal 'mesh'; the component it tears down is
        // keyed by its real id. Remove has to address the latter.
        it('removes the mesh by its REAL component id, not the card id', async () => {
            const user = setupUser();
            const { onDeployMesh } = renderGrid({
                withMesh: true,
                appBuilderComponents: {
                    'eds-accs-mesh': { ...MESH_COMPONENT },
                },
            });

            const panel = await openPanel(user, 'API Mesh', 'Deployed');
            await user.click(within(panel).getByRole('button', { name: /^remove$/i }));
            const dialog = screen.getByRole('dialog', { name: /remove app builder component/i });
            await user.click(within(dialog).getByRole('button', { name: /^remove$/i }));

            expect(getClient().postMessage).toHaveBeenCalledWith('removeAppBuilderComponent', {
                id: 'eds-accs-mesh',
            });
            // THE landmine: handleMeshAction treats every verb as "deploy", so a
            // Remove routed into the mesh branch would deploy the mesh instead.
            expect(onDeployMesh).not.toHaveBeenCalled();
        });

        it('warns that removing the mesh costs the storefront its endpoint', async () => {
            const user = setupUser();
            renderGrid({
                withMesh: true,
                appBuilderComponents: { 'eds-accs-mesh': { ...MESH_COMPONENT } },
            });

            const panel = await openPanel(user, 'API Mesh', 'Deployed');
            await user.click(within(panel).getByRole('button', { name: /^remove$/i }));

            expect(
                screen.getByText(/storefront loses its API Mesh endpoint/i),
            ).toBeInTheDocument();
        });

        it('routes the needs-auth mesh Sign in to onReAuthenticate', async () => {
            const user = setupUser();
            const { onReAuthenticate } = renderGrid({
                withMesh: true,
                meshStatus: 'needs-auth',
                meshStatusText: 'Sign in required',
            });

            const tile = card('API Mesh', 'Sign in required');
            await user.click(within(tile).getByRole('button', { name: /sign in/i }));

            expect(onReAuthenticate).toHaveBeenCalled();
        });

        it('disables the mesh face affordance while a mesh operation is in flight', () => {
            renderGrid({
                withMesh: true,
                meshStatus: 'needs-auth',
                meshStatusText: 'Sign in required',
                isMeshActionDisabled: true,
            });

            const tile = card('API Mesh', 'Sign in required');
            expect(within(tile).getByRole('button', { name: /sign in/i })).toBeDisabled();
        });
    });

    describe('remove confirmation guard (ported)', () => {
        async function openRemove(user: ReturnType<typeof userEvent.setup>) {
            const panel = await openPanel(user, 'custom-app', 'Deployed');
            await user.click(within(panel).getByRole('button', { name: /^remove$/i }));
        }

        it('opens a confirm dialog on Remove WITHOUT posting removeAppBuilderComponent', async () => {
            const user = setupUser();
            renderGrid({ appBuilderComponents: oneDeployed() });

            await openRemove(user);

            expect(
                screen.getByRole('dialog', { name: /remove app builder component/i }),
            ).toBeInTheDocument();
            expect(getClient().postMessage).not.toHaveBeenCalledWith(
                'removeAppBuilderComponent',
                expect.anything(),
            );
        });

        it('posts removeAppBuilderComponent with the card id when confirmed', async () => {
            const user = setupUser();
            renderGrid({ appBuilderComponents: oneDeployed() });

            await openRemove(user);
            const dialog = screen.getByRole('dialog', { name: /remove app builder component/i });
            await user.click(within(dialog).getByRole('button', { name: /^remove$/i }));

            expect(getClient().postMessage).toHaveBeenCalledWith('removeAppBuilderComponent', {
                id: 'custom-app',
            });
        });

        it('SAFETY: cancelling the dialog never posts removeAppBuilderComponent', async () => {
            const user = setupUser();
            renderGrid({ appBuilderComponents: oneDeployed() });

            await openRemove(user);
            const dialog = screen.getByRole('dialog', { name: /remove app builder component/i });
            await user.click(within(dialog).getByRole('button', { name: /^close$/i }));

            expect(getClient().postMessage).not.toHaveBeenCalledWith(
                'removeAppBuilderComponent',
                expect.anything(),
            );
        });
    });

    describe('Manage APIs shared modal (ported)', () => {
        it('renders the shared modal closed by default', () => {
            renderGrid({ appBuilderComponents: twoDeployed() });

            expect(screen.queryByTestId('manage-apis-modal')).not.toBeInTheDocument();
        });

        it('opens the ONE shared modal scoped to the acting card id', async () => {
            const user = setupUser();
            renderGrid({ appBuilderComponents: twoDeployed() });

            const panel = await openPanel(user, 'other-app', 'Deployed');
            await user.click(within(panel).getByRole('button', { name: /manage apis/i }));

            const modals = screen.getAllByTestId('manage-apis-modal');
            expect(modals).toHaveLength(1);
            expect(modals[0]).toHaveTextContent('other-app');
        });

        it('clears the modal when its onClose fires', async () => {
            const user = setupUser();
            renderGrid({ appBuilderComponents: twoDeployed() });

            const panel = await openPanel(user, 'custom-app', 'Deployed');
            await user.click(within(panel).getByRole('button', { name: /manage apis/i }));
            await user.click(screen.getByRole('button', { name: /close-manage-apis/i }));

            expect(screen.queryByTestId('manage-apis-modal')).not.toBeInTheDocument();
        });
    });

    describe('in-panel rename', () => {
        it('requests renameAppBuilderComponent with the id AND the inline name', async () => {
            const user = setupUser();
            renderGrid({ appBuilderComponents: oneDeployed() });

            const panel = await openPanel(user, 'custom-app', 'Deployed');
            await user.click(within(panel).getByRole('button', { name: /rename custom-app/i }));
            const input = within(panel).getByRole('textbox');
            await user.clear(input);
            await user.type(input, 'Renamed App{Enter}');

            await waitFor(() => {
                expect(getClient().request).toHaveBeenCalledWith('renameAppBuilderComponent', {
                    id: 'custom-app',
                    name: 'Renamed App',
                });
            });
        });

        it('surfaces a rejected rename inline without closing the panel', async () => {
            const user = setupUser();
            getClient().request.mockResolvedValue({ success: false, error: 'Name already taken' });
            renderGrid({ appBuilderComponents: oneDeployed() });

            const panel = await openPanel(user, 'custom-app', 'Deployed');
            await user.click(within(panel).getByRole('button', { name: /rename custom-app/i }));
            const input = within(panel).getByRole('textbox');
            await user.clear(input);
            await user.type(input, 'Taken{Enter}');

            expect(await within(panel).findByRole('alert')).toHaveTextContent('Name already taken');
            expect(panel).toBeInTheDocument();
        });

        it('offers no rename for a CATALOG integration (id is a bundled catalog id)', async () => {
            const user = setupUser();
            // 'app-builder-shell' is the real bundled integration catalog id —
            // canRename keys off the BUNDLED catalog, not the passed-in one.
            renderGrid({
                appBuilderComponents: {
                    'app-builder-shell': {
                        kind: 'integration',
                        status: 'deployed',
                        source: { owner: 'skukla', repo: 'app-builder-shell' },
                    },
                },
            });

            const panel = await openPanel(user, 'app-builder-shell', 'Deployed');

            expect(
                within(panel).queryByRole('button', { name: /^rename/i }),
            ).not.toBeInTheDocument();
        });
    });

    describe('add flow', () => {
        // The MODAL is hosted by the screen so the header button and this tile
        // open one instance; the grid's only job is to ask for it.
        it('asks the screen to open the add picker', async () => {
            const user = setupUser();
            const { onAddRequest } = renderGrid();

            await user.click(screen.getByTestId('integration-add-tile'));

            expect(onAddRequest).toHaveBeenCalledTimes(1);
        });

        it('renders the add tile as the last cell', () => {
            renderGrid({ appBuilderComponents: twoDeployed() });

            const tile = screen.getByTestId('integration-add-tile');
            const cards = screen.getAllByRole('button', { name: /, Deployed$/ });
            expect(
                cards[cards.length - 1].compareDocumentPosition(tile) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
        });
    });
});
