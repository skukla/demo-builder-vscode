/**
 * IntegrationsGrid — the bound system's verbs (plan step 05): Open ERP, Reset ERP
 * records (confirmed, posted with the INTEGRATION's id), Redeploy ERP (posted
 * with the ERP's own id), and the pair's remove consequence.
 */

import { screen, within } from '@testing-library/react';
import { getClient, openPanel, renderCards, resetGridMocks, setupUser } from './IntegrationsGrid.testUtils';
import type { IntegrationCardModel } from '@/core/ui/components/integrations/integrationCardModel.types';

function pairCard(): IntegrationCardModel {
    return {
        id: 'erp-integration',
        isMesh: false,
        name: 'ERP integration',
        kindLabel: 'Pre-built',
        sourceLine: 'skukla/commerce-erp-integration',
        sourceIsAi: false,
        status: 'deployed',
        statusLabel: 'Deployed',
        dotVariant: 'success',
        url: 'https://ns.adobeioruntime.net/api/v1/web/erp/status',
        urlLabel: 'App URL',
        menuActions: ['open', 'redeploy', 'open-system', 'reset-system', 'redeploy-system', 'manage-apis', 'remove'],
        canRename: false,
        system: {
            id: 'demo-erp',
            name: 'Nordwind',
            status: 'deployed',
            statusLabel: 'Deployed',
            dotVariant: 'success',
            url: 'https://ns.adobeio-static.net/index.html',
        },
    };
}

beforeEach(() => {
    resetGridMocks();
});

describe('IntegrationsGrid — the ERP verbs', () => {
    it('Open ERP opens the ERP screen, not the integration URL', async () => {
        const user = setupUser();
        renderCards([pairCard()]);
        const panel = await openPanel(user, 'ERP integration', 'Deployed');

        await user.click(within(panel).getByRole('button', { name: /^open erp$/i }));

        expect(getClient().postMessage).toHaveBeenCalledWith('openErpScreen', { id: 'erp-integration' });
    });

    it("the flyout's second section names the ERP and its screen link opens it", async () => {
        const user = setupUser();
        renderCards([pairCard()]);
        const panel = await openPanel(user, 'ERP integration', 'Deployed');

        expect(within(panel).getByTestId('system-section')).toHaveTextContent('Nordwind');
        await user.click(within(panel).getByRole('link', { name: 'Open Nordwind' }));

        expect(getClient().postMessage).toHaveBeenCalledWith('openErpScreen', { id: 'erp-integration' });
    });

    it("Redeploy ERP posts the ERP's OWN id", async () => {
        const user = setupUser();
        renderCards([pairCard()]);
        const panel = await openPanel(user, 'ERP integration', 'Deployed');

        await user.click(within(panel).getByRole('button', { name: /^redeploy erp$/i }));

        expect(getClient().postMessage).toHaveBeenCalledWith('redeployAppBuilderComponent', { id: 'demo-erp' });
    });

    it('Reset ERP records opens a confirm naming the ERP, and posts NOTHING until confirmed', async () => {
        const user = setupUser();
        renderCards([pairCard()]);
        const panel = await openPanel(user, 'ERP integration', 'Deployed');

        await user.click(within(panel).getByRole('button', { name: /^reset erp records$/i }));

        const dialog = screen.getByRole('dialog', { name: /reset erp records/i });
        expect(dialog).toHaveTextContent('Wipes every record in Nordwind');
        expect(dialog).toHaveTextContent('Commerce orders lose their ERP order numbers');
        expect(getClient().postMessage).not.toHaveBeenCalledWith('resetErpRecords', expect.anything());
    });

    it("confirming posts resetErpRecords with the INTEGRATION's id (the reset runs through it)", async () => {
        const user = setupUser();
        renderCards([pairCard()]);
        const panel = await openPanel(user, 'ERP integration', 'Deployed');
        await user.click(within(panel).getByRole('button', { name: /^reset erp records$/i }));

        const dialog = screen.getByRole('dialog', { name: /reset erp records/i });
        await user.click(within(dialog).getByRole('button', { name: /^reset$/i }));

        expect(getClient().postMessage).toHaveBeenCalledWith('resetErpRecords', { id: 'erp-integration' });
    });

    it('SAFETY: closing the reset dialog posts nothing', async () => {
        const user = setupUser();
        renderCards([pairCard()]);
        const panel = await openPanel(user, 'ERP integration', 'Deployed');
        await user.click(within(panel).getByRole('button', { name: /^reset erp records$/i }));

        const dialog = screen.getByRole('dialog', { name: /reset erp records/i });
        await user.click(within(dialog).getByRole('button', { name: /^close$/i }));

        expect(getClient().postMessage).not.toHaveBeenCalledWith('resetErpRecords', expect.anything());
    });

    it('Remove on the pair says the ERP goes too and where its records stay', async () => {
        const user = setupUser();
        renderCards([pairCard()]);
        const panel = await openPanel(user, 'ERP integration', 'Deployed');

        await user.click(within(panel).getByRole('button', { name: /^remove$/i }));

        const dialog = screen.getByRole('dialog', { name: /remove app builder component/i });
        expect(dialog).toHaveTextContent('Removes the integration and its Nordwind too.');
        expect(dialog).toHaveTextContent("The ERP's records stay in the workspace's database");
    });
});
