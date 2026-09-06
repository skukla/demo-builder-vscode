/**
 * IntegrationsGrid Tests — the wiring the card models cannot show
 * (integrations grid, Step 7)
 *
 * The grid is presentational: `cards` in, messages and callbacks out. These are
 * the decisions it makes on its own — what it does with a rename answer it did
 * not expect, when it drops a selection, which callback it holds after the
 * parent hands over a new one, and the guards in front of the dispatch switch.
 *
 * Scenarios here render card MODELS directly (`renderCards`), because the
 * defensive branches are reachable from the prop contract even where today's
 * derivation happens not to produce them.
 *
 * Composition lives in IntegrationsGrid.test.tsx, the action surface in
 * IntegrationsGrid-actions.test.tsx, the shared harness in
 * IntegrationsGrid.testUtils.tsx — which owns the component import, so nothing
 * here reaches for IntegrationsGrid itself.
 */

import { screen, within } from '@testing-library/react';
import type { CardAction } from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import {
    card,
    cardsFor,
    DEPLOYED_INTEGRATION,
    getClient,
    MESH_COMPONENT,
    openPanel,
    renderCards,
    resetGridMocks,
    setupUser,
    twoDeployed,
} from './IntegrationsGrid.testUtils';

function oneDeployed() {
    return { 'custom-app': { ...DEPLOYED_INTEGRATION } };
}

beforeEach(() => {
    resetGridMocks();
});

describe('IntegrationsGrid wiring', () => {
    describe('rename answers the grid did not ask for', () => {
        it('reports the generic failure when the handler answers with nothing', async () => {
            const user = setupUser();
            getClient().request.mockResolvedValue(undefined);
            renderCards(cardsFor({ appBuilderComponents: oneDeployed() }));

            const panel = await openPanel(user, 'custom-app', 'Deployed');
            await user.click(within(panel).getByRole('button', { name: /rename custom-app/i }));
            const input = within(panel).getByRole('textbox');
            await user.clear(input);
            await user.type(input, 'Renamed{Enter}');

            expect(await within(panel).findByRole('alert')).toHaveTextContent('Rename failed');
        });

        it("surfaces a thrown request's own message inline", async () => {
            const user = setupUser();
            getClient().request.mockRejectedValue(new Error('the socket went away'));
            renderCards(cardsFor({ appBuilderComponents: oneDeployed() }));

            const panel = await openPanel(user, 'custom-app', 'Deployed');
            await user.click(within(panel).getByRole('button', { name: /rename custom-app/i }));
            const input = within(panel).getByRole('textbox');
            await user.clear(input);
            await user.type(input, 'Renamed{Enter}');

            expect(await within(panel).findByRole('alert')).toHaveTextContent(
                'the socket went away'
            );
        });
    });

    describe('the open panel tracks the card set', () => {
        it('closes itself when its card leaves, and leaves the survivors alone', async () => {
            const user = setupUser();
            const both = cardsFor({ appBuilderComponents: twoDeployed() });
            const { setCards } = renderCards(both);

            await openPanel(user, 'custom-app', 'Deployed');
            setCards(both.filter((model) => model.id !== 'custom-app'));

            expect(screen.queryByLabelText('custom-app details')).not.toBeInTheDocument();
            expect(card('other-app', 'Deployed')).toBeInTheDocument();
        });

        // Losing the card hides the panel on its own — `selected` is a lookup.
        // What the effect adds is DROPPING the id, so a card that comes back
        // under the same id (remove, then re-add the same catalog entry) does
        // not spring the panel open unbidden.
        it('does not reopen for a card that returns under the same id', async () => {
            const user = setupUser();
            const both = cardsFor({ appBuilderComponents: twoDeployed() });
            const { setCards } = renderCards(both);

            await openPanel(user, 'custom-app', 'Deployed');
            setCards(both.filter((model) => model.id !== 'custom-app'));
            setCards(both);

            expect(screen.queryByLabelText('custom-app details')).not.toBeInTheDocument();
            expect(card('custom-app', 'Deployed')).toBeInTheDocument();
        });

        it('keeps the panel open while its card is still in the set', async () => {
            const user = setupUser();
            const both = cardsFor({ appBuilderComponents: twoDeployed() });
            const { setCards } = renderCards(both);

            await openPanel(user, 'custom-app', 'Deployed');
            setCards(both.filter((model) => model.id !== 'other-app'));

            expect(screen.getByLabelText('custom-app details')).toBeInTheDocument();
        });
    });

    describe('mesh callbacks', () => {
        const meshCards = () =>
            cardsFor({
                withMesh: true,
                meshStatus: 'needs-auth',
                meshStatusText: 'Sign in required',
                appBuilderComponents: { 'eds-accs-mesh': { ...MESH_COMPONENT } },
            });

        it('does nothing when the parent supplied no mesh callbacks at all', async () => {
            const user = setupUser();
            renderCards(meshCards());

            const tile = card('API Mesh', 'Sign in required');
            const menu = within(tile).getByTestId('card-menu');
            await user.click(within(menu).getByRole('button', { name: /^sign in$/i }));

            expect(getClient().postMessage).not.toHaveBeenCalled();
        });

        // Every mesh verb that is not Sign in falls through to the deploy
        // callback, which is just as optional.
        it('does nothing on a deploy verb when no deploy callback was supplied', async () => {
            const user = setupUser();
            renderCards(
                cardsFor({
                    withMesh: true,
                    appBuilderComponents: { 'eds-accs-mesh': { ...MESH_COMPONENT } },
                })
            );

            const tile = card('API Mesh', 'Deployed');
            const menu = within(tile).getByTestId('card-menu');
            await user.click(within(menu).getByRole('button', { name: /^redeploy$/i }));

            expect(getClient().postMessage).not.toHaveBeenCalled();
        });

        it('routes a mesh verb to the callback the parent currently holds', async () => {
            const user = setupUser();
            const first = jest.fn();
            const second = jest.fn();
            const cards = meshCards();
            const { setCards } = renderCards(cards, { onReAuthenticate: first });

            setCards(cards, { onReAuthenticate: second });
            const tile = card('API Mesh', 'Sign in required');
            const menu = within(tile).getByTestId('card-menu');
            await user.click(within(menu).getByRole('button', { name: /^sign in$/i }));

            expect(second).toHaveBeenCalled();
            expect(first).not.toHaveBeenCalled();
        });
    });

    describe('dispatch guards', () => {
        /** A deployed integration card with its offered actions overridden. */
        function withActions(menuActions: CardAction[], overrides = {}) {
            const [base] = cardsFor({ appBuilderComponents: oneDeployed() });
            return [{ ...base, menuActions, ...overrides }];
        }

        it('does not post openLiveSite for a card that carries no URL', async () => {
            const user = setupUser();
            renderCards(withActions(['open'], { url: undefined }));

            const tile = card('custom-app', 'Deployed');
            await user.click(within(tile).getByRole('button', { name: /^open$/i }));

            expect(getClient().postMessage).not.toHaveBeenCalled();
        });

        it('posts nothing for a verb no keyed message covers', async () => {
            const user = setupUser();
            renderCards(withActions(['sign-in']));

            const tile = card('custom-app', 'Deployed');
            await user.click(within(tile).getByRole('button', { name: /^sign in$/i }));

            expect(getClient().postMessage).not.toHaveBeenCalled();
        });
    });

    describe('the remove-confirm dialog', () => {
        it('names the card it will tear down, without the mesh consequence', async () => {
            const user = setupUser();
            renderCards(
                cardsFor({
                    withMesh: true,
                    appBuilderComponents: {
                        ...oneDeployed(),
                        'eds-accs-mesh': { ...MESH_COMPONENT },
                    },
                })
            );

            const panel = await openPanel(user, 'custom-app', 'Deployed');
            await user.click(within(panel).getByRole('button', { name: /^remove$/i }));

            const dialog = screen.getByRole('dialog', { name: /remove app builder component/i });
            expect(dialog).toHaveTextContent('Remove custom-app?');
            expect(
                within(dialog).queryByText(/storefront loses its API Mesh endpoint/i)
            ).not.toBeInTheDocument();
        });

        it('closes on cancel', async () => {
            const user = setupUser();
            renderCards(cardsFor({ appBuilderComponents: oneDeployed() }));

            const panel = await openPanel(user, 'custom-app', 'Deployed');
            await user.click(within(panel).getByRole('button', { name: /^remove$/i }));
            const dialog = screen.getByRole('dialog', { name: /remove app builder component/i });
            await user.click(within(dialog).getByRole('button', { name: /^close$/i }));

            expect(
                screen.queryByRole('dialog', { name: /remove app builder component/i })
            ).not.toBeInTheDocument();
        });
    });
});
