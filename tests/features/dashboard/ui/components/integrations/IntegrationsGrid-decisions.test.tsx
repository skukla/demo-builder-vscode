/**
 * IntegrationsGrid — the decisions the other suites ran past (PL-70).
 *
 * Each case names one choice the grid makes on its own: which card a tile press
 * is about, whether a handled verb stops there, what a confirm does once its card
 * is gone, and that every dialog the grid hosts actually closes.
 *
 * The shared harness in IntegrationsGrid.testUtils.tsx owns the component import.
 */

import { screen, within } from '@testing-library/react';
import type { ComponentOperationControls } from '@/features/dashboard/ui/hooks/useComponentOperation';
import type {
    IntegrationCardModel,
    LinkedCard,
} from '@/core/ui/components/integrations/integrationCardModel.types';
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

const INTEGRATION_LINK: LinkedCard = {
    id: 'erp-integration',
    name: 'ERP integration',
    status: 'deployed',
    statusLabel: 'Deployed',
    dotVariant: 'success',
};
const SYSTEM_LINK: LinkedCard = { ...INTEGRATION_LINK, id: 'demo-erp', name: 'Nordwind' };

function base(over: Partial<IntegrationCardModel>): IntegrationCardModel {
    return {
        id: 'x',
        isMesh: false,
        name: 'x',
        kindLabel: 'Pre-built',
        status: 'deployed',
        statusLabel: 'Deployed',
        dotVariant: 'success',
        urlLabel: 'App URL',
        menuActions: [],
        canRename: false,
        ...over,
    };
}

const integrationCard = (): IntegrationCardModel =>
    base({
        id: 'erp-integration',
        name: 'ERP integration',
        menuActions: ['open', 'add-erp', 'reset-records', 'remove'],
        linked: { cards: [SYSTEM_LINK] },
    });

const systemCard = (): IntegrationCardModel =>
    base({
        id: 'demo-erp',
        name: 'Nordwind',
        isSystem: true,
        typeBadge: 'ERP',
        kindLabel: 'ERP',
        urlLabel: 'Screen',
        menuActions: ['open', 'simulate-downtime', 'remove'],
        linked: { cards: [INTEGRATION_LINK] },
    });

/** Operation controls that claim every id as theirs, so a reopen always succeeds. */
function claimingOperations(): ComponentOperationControls & { reopen: jest.Mock } {
    return {
        open: null,
        start: jest.fn(),
        startWhenItBegins: jest.fn(),
        show: jest.fn(),
        reopen: jest.fn(() => true),
        retry: jest.fn(),
        close: jest.fn(),
        run: jest.fn(() => true),
        started: jest.fn(),
        resetErp: jest.fn(),
        loadErpData: jest.fn(),
        addErp: jest.fn(),
    };
}

const oneDeployed = () => ({ 'custom-app': { ...DEPLOYED_INTEGRATION } });

beforeEach(() => {
    resetGridMocks();
});

describe('IntegrationsGrid — which card a tile press is about', () => {
    // The first card is mid-deploy with a running operation; pressing the SECOND
    // must be judged by the second card's own status, and open its flyout.
    it('judges the pressed card, not the first one in the grid', async () => {
        const user = setupUser();
        const operations = claimingOperations();
        const [first, second] = cardsFor({ appBuilderComponents: twoDeployed() });
        renderCards([{ ...first, status: 'deploying', statusLabel: 'Deploying' }, second], {
            operations,
        });

        await user.click(card(second.name, 'Deployed'));

        expect(screen.getByLabelText(`${second.name} details`)).toBeInTheDocument();
        expect(operations.reopen).not.toHaveBeenCalled();
    });

    // An operation can still be held for a card that is no longer deploying; its
    // tile opens the flyout, and the runner is never asked to reopen.
    it('asks to reopen only for a card that is deploying', async () => {
        const user = setupUser();
        const operations = claimingOperations();
        renderCards(cardsFor({ appBuilderComponents: oneDeployed() }), { operations });

        await openPanel(user, 'custom-app', 'Deployed');

        expect(operations.reopen).not.toHaveBeenCalled();
    });
});

describe('IntegrationsGrid — a verb handled by the ERP routing stops there', () => {
    it("opening an ERP's screen does not also open the Developer Console", async () => {
        const user = setupUser();
        renderCards([integrationCard(), systemCard()]);
        const panel = await openPanel(user, 'Nordwind', 'Deployed');

        await user.click(within(panel).getByRole('button', { name: 'Open Nordwind' }));

        expect(getClient().postMessage).toHaveBeenCalledTimes(1);
        expect(getClient().postMessage).toHaveBeenCalledWith('openErpScreen', {
            id: 'erp-integration',
            erp: 'demo-erp',
        });
    });
});

describe('IntegrationsGrid — a setup guide nobody holds', () => {
    it('does nothing when the screen handed no guide opener', async () => {
        const user = setupUser();
        const [only] = cardsFor({ appBuilderComponents: oneDeployed() });
        renderCards([{ ...only, menuActions: ['setup-guide'] }], { onOpenGuide: undefined });

        const menu = within(card('custom-app', 'Deployed')).getByTestId('card-menu');
        await user.click(within(menu).getByRole('button'));

        expect(getClient().postMessage).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog', { name: /^Demo setup:/ })).not.toBeInTheDocument();
    });
});

describe('IntegrationsGrid — the remove confirm', () => {
    it('is closed until a Remove is pressed', () => {
        renderCards(cardsFor({ appBuilderComponents: twoDeployed() }));

        expect(screen.queryByRole('dialog', { name: /^Remove/ })).not.toBeInTheDocument();
    });

    // The modal is titled with the card's NAME; the message carries its id.
    it('runs the removal under the display name, not the component id', async () => {
        const user = setupUser();
        renderCards(
            cardsFor({
                withMesh: true,
                appBuilderComponents: { 'eds-accs-mesh': { ...MESH_COMPONENT } },
            })
        );
        const panel = await openPanel(user, 'API Mesh', 'Deployed');
        await user.click(within(panel).getByRole('button', { name: /^remove$/i }));

        const confirm = screen.getByRole('dialog', { name: 'Remove API Mesh' });
        await user.click(within(confirm).getByRole('button', { name: /^remove$/i }));

        expect(screen.getByRole('dialog', { name: 'Removing API Mesh' })).toBeInTheDocument();
    });

    // A push can take the card away while the confirm is up. The confirm still
    // names the component by its id, and confirming still removes it.
    it('still removes by id when its card left while the confirm was open', async () => {
        const user = setupUser();
        const { setCards } = renderCards(cardsFor({ appBuilderComponents: oneDeployed() }));
        const panel = await openPanel(user, 'custom-app', 'Deployed');
        await user.click(within(panel).getByRole('button', { name: /^remove$/i }));

        setCards([]);
        const confirm = screen.getByRole('dialog', { name: 'Remove custom-app' });
        await user.click(within(confirm).getByRole('button', { name: /^remove$/i }));

        expect(getClient().postMessage).toHaveBeenCalledWith('removeAppBuilderComponent', {
            progress: 'modal',
            id: 'custom-app',
        });
    });
});

describe('IntegrationsGrid — the ERP dialogs close', () => {
    it('closes the reset confirm on Close', async () => {
        const user = setupUser();
        renderCards([integrationCard(), systemCard()]);
        const panel = await openPanel(user, 'ERP integration', 'Deployed');
        await user.click(within(panel).getByRole('button', { name: /^reset erps$/i }));

        const dialog = screen.getByRole('dialog', { name: /reset erps/i });
        await user.click(within(dialog).getByRole('button', { name: /^close$/i }));

        expect(screen.queryByRole('dialog', { name: /reset erps/i })).not.toBeInTheDocument();
    });

    it('closes the Add another ERP prompt on Close', async () => {
        const user = setupUser();
        renderCards([integrationCard(), systemCard()]);
        const panel = await openPanel(user, 'ERP integration', 'Deployed');
        await user.click(within(panel).getByRole('button', { name: /^add another erp$/i }));

        const dialog = screen.getByRole('dialog', { name: 'Add another ERP' });
        await user.click(within(dialog).getByRole('button', { name: /^close$/i }));

        expect(screen.queryByRole('dialog', { name: 'Add another ERP' })).not.toBeInTheDocument();
    });

    it('closes the simulated-downtime modal on Close', async () => {
        const user = setupUser();
        renderCards([integrationCard(), systemCard()]);
        const panel = await openPanel(user, 'Nordwind', 'Deployed');
        await user.click(within(panel).getByRole('button', { name: 'Simulate downtime' }));

        const dialog = await screen.findByRole('dialog', { name: 'Nordwind: simulate downtime' });
        await user.click(within(dialog).getByRole('button', { name: /^close$/i }));

        expect(
            screen.queryByRole('dialog', { name: 'Nordwind: simulate downtime' })
        ).not.toBeInTheDocument();
    });
});

describe('IntegrationsGrid — the names an added ERP may not take', () => {
    // The prompt saves a typed name with "ERP" on the end, so both cards end in it.
    const orderIntegration = (): IntegrationCardModel => ({ ...integrationCard(), name: 'Order ERP' });
    const nordwindErp = (): IntegrationCardModel => ({ ...systemCard(), name: 'Nordwind ERP' });

    async function openPrompt(user: ReturnType<typeof setupUser>) {
        const panel = await openPanel(user, 'Order ERP', 'Deployed');
        await user.click(within(panel).getByRole('button', { name: /^add another erp$/i }));
        return screen.getByRole('dialog', { name: 'Add another ERP' });
    }

    // Only ERPs are taken names: an ERP may share a name with an integration.
    it("does not count an integration's name as taken", async () => {
        const user = setupUser();
        renderCards([orderIntegration(), nordwindErp()]);
        const dialog = await openPrompt(user);

        await user.type(within(dialog).getByRole('textbox', { name: 'ERP name' }), 'Order');

        expect(within(dialog).queryByText(/is already in this project/)).not.toBeInTheDocument();
    });

    it('counts an ERP that arrived after the grid first rendered', async () => {
        const user = setupUser();
        const { setCards } = renderCards([orderIntegration()]);
        setCards([orderIntegration(), nordwindErp()]);
        const dialog = await openPrompt(user);

        await user.type(within(dialog).getByRole('textbox', { name: 'ERP name' }), 'Nordwind');

        expect(within(dialog).getByText(/is already in this project/)).toBeInTheDocument();
    });
});
