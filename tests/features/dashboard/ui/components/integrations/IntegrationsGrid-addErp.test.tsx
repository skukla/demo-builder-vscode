/**
 * IntegrationsGrid — "Add another ERP" on the ERP integration's card (AB-16). The menu item
 * opens a name prompt; Add sends `addErp` with the integration's id and the typed name,
 * straight into the progress modal. A name the project already has is refused in the prompt.
 * An added ERP's Remove says the integration stays.
 */

import { screen, within } from '@testing-library/react';
import { getClient, openPanel, renderCards, resetGridMocks, setupUser } from './IntegrationsGrid.testUtils';
import type { IntegrationCardModel, LinkedCard } from '@/core/ui/components/integrations/integrationCardModel.types';

const INTEGRATION_LINK: LinkedCard = {
    id: 'erp-integration',
    name: 'Acme ERP Integration',
    status: 'deployed',
    statusLabel: 'Deployed',
    dotVariant: 'success',
};

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

const integrationCard = () =>
    base({ id: 'erp-integration', name: 'Acme ERP Integration', menuActions: ['open', 'redeploy', 'add-erp', 'remove'] });
const erpCard = (id: string, name: string, over: Partial<IntegrationCardModel> = {}) =>
    base({
        id,
        name,
        isSystem: true,
        typeBadge: 'ERP',
        kindLabel: 'ERP',
        urlLabel: 'Screen',
        menuActions: ['open', 'load-demo-data', 'reset-records', 'redeploy', 'remove'],
        linked: { cards: [INTEGRATION_LINK] },
        ...over,
    });

beforeEach(() => {
    resetGridMocks();
});

async function openPrompt() {
    const user = setupUser();
    renderCards([integrationCard(), erpCard('demo-erp', 'Acme ERP')]);
    const panel = await openPanel(user, 'Acme ERP Integration', 'Deployed');
    await user.click(within(panel).getByRole('button', { name: /^add another erp$/i }));
    return { user, dialog: screen.getByRole('dialog', { name: 'Add another ERP' }) };
}

describe('IntegrationsGrid — Add another ERP', () => {
    it('names the new ERP and sends addErp with the integration id, into the modal', async () => {
        const { user, dialog } = await openPrompt();

        await user.type(within(dialog).getByRole('textbox', { name: 'ERP name' }), 'Brand B ERP');
        await user.click(within(dialog).getByRole('button', { name: 'Add' }));

        // The store was not read here (the harness answers requests with a bare success), so the
        // rule is the fallback: the attribute, from the typed name's list id (AB-64).
        expect(getClient().request).toHaveBeenCalledWith('getErpOwnershipOptions', { id: 'erp-integration' });
        expect(getClient().postMessage).toHaveBeenCalledWith('addErp', {
            name: 'Brand B ERP',
            id: 'erp-integration',
            progress: 'modal',
            owns: { mode: 'attribute', attribute: 'erp_owner=brand-b' },
            existingOwns: [],
        });
    });

    it('refuses a name the project already has, without case, and sends nothing', async () => {
        const { user, dialog } = await openPrompt();

        await user.type(within(dialog).getByRole('textbox', { name: 'ERP name' }), 'acme erp');

        expect(within(dialog).getByText('An ERP named "acme ERP" is already in this project. Pick another name.')).toBeInTheDocument();
        await user.click(within(dialog).getByRole('button', { name: 'Add' }));
        expect(getClient().postMessage).not.toHaveBeenCalledWith('addErp', expect.anything());
    });

    it("an added ERP's Remove says the integration stays", async () => {
        const user = setupUser();
        renderCards([integrationCard(), erpCard('demo-erp-2', 'Brand B ERP', { removesAlone: true })]);
        const panel = await openPanel(user, 'Brand B ERP', 'Deployed');

        await user.click(within(panel).getByRole('button', { name: /^remove$/i }));

        const dialog = screen.getByRole('dialog', { name: 'Remove Brand B ERP' });
        expect(dialog).toHaveTextContent('Its records will be deleted, and Acme ERP Integration stops sending it orders.');
    });
});
