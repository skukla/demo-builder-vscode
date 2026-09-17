/**
 * IntegrationsGrid — linked cards (the ERP integration and the ERP it uses).
 * The system card's screen and reset go through its integration's id; its
 * redeploy uses its own; each flyout opens the other card; removing either
 * names both.
 */

import { screen, within } from '@testing-library/react';
import { getClient, openPanel, renderCards, resetGridMocks, setupUser } from './IntegrationsGrid.testUtils';
import type { IntegrationCardModel, LinkedCard } from '@/core/ui/components/integrations/integrationCardModel.types';

const INTEGRATION_LINK: LinkedCard = {
    id: 'erp-integration',
    name: 'ERP integration',
    status: 'deployed',
    statusLabel: 'Deployed',
    dotVariant: 'success',
};
const SYSTEM_LINK: LinkedCard = { id: 'demo-erp', name: 'Nordwind', status: 'deployed', statusLabel: 'Deployed', dotVariant: 'success' };

function integrationCard(): IntegrationCardModel {
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
        menuActions: ['open', 'redeploy', 'manage-apis', 'remove'],
        canRename: false,
        linked: { label: 'Uses', cards: [SYSTEM_LINK] },
    };
}

function systemCard(): IntegrationCardModel {
    return {
        id: 'demo-erp',
        isMesh: false,
        isSystem: true,
        typeBadge: 'ERP',
        name: 'Nordwind',
        kindLabel: 'ERP',
        sourceLine: 'skukla/demo-erp',
        sourceIsAi: false,
        status: 'deployed',
        statusLabel: 'Deployed',
        dotVariant: 'success',
        url: 'https://ns.adobeio-static.net/index.html',
        urlLabel: 'Screen',
        menuActions: ['open', 'reset-records', 'redeploy', 'remove'],
        canRename: false,
        linked: { label: 'Used by', cards: [INTEGRATION_LINK] },
    };
}

beforeEach(() => {
    resetGridMocks();
});

async function openSystem() {
    const user = setupUser();
    renderCards([integrationCard(), systemCard()]);
    const panel = await openPanel(user, 'Nordwind', 'Deployed');
    return { user, panel };
}

describe('IntegrationsGrid — the card faces', () => {
    it('the system card carries its type badge; both name the other behind a link icon', () => {
        renderCards([integrationCard(), systemCard()]);

        const system = screen.getByRole('button', { name: 'Nordwind, Deployed' });
        expect(within(system).getByTestId('type-badge')).toHaveTextContent('ERP');
        expect(within(system).getByTitle('Used by ERP integration')).toBeInTheDocument();
        const integration = screen.getByRole('button', { name: 'ERP integration, Deployed' });
        expect(within(integration).queryByTestId('type-badge')).toBeNull();
        expect(within(integration).getByTitle('Uses Nordwind')).toBeInTheDocument();
    });
});

describe('IntegrationsGrid — the system card verbs', () => {
    it("Open opens the ERP screen through the integration's id", async () => {
        const { user, panel } = await openSystem();

        await user.click(within(panel).getByRole('button', { name: /^open$/i }));

        expect(getClient().postMessage).toHaveBeenCalledWith('openErpScreen', { id: 'erp-integration' });
        expect(getClient().postMessage).not.toHaveBeenCalledWith('openLiveSite', expect.anything());
    });

    it('the Screen row opens it too', async () => {
        const { user, panel } = await openSystem();

        await user.click(within(panel).getByRole('link', { name: 'Open Nordwind' }));

        expect(getClient().postMessage).toHaveBeenCalledWith('openErpScreen', { id: 'erp-integration' });
    });

    it("Redeploy posts the system's OWN id", async () => {
        const { user, panel } = await openSystem();

        await user.click(within(panel).getByRole('button', { name: /^redeploy$/i }));

        expect(getClient().postMessage).toHaveBeenCalledWith('redeployAppBuilderComponent', { id: 'demo-erp' });
    });

    it('Reset records opens a confirm naming the ERP, and posts NOTHING until confirmed', async () => {
        const { user, panel } = await openSystem();

        await user.click(within(panel).getByRole('button', { name: /^reset records$/i }));

        const dialog = screen.getByRole('dialog', { name: /reset erp records/i });
        expect(dialog).toHaveTextContent('Wipes every record in Nordwind');
        expect(getClient().postMessage).not.toHaveBeenCalledWith('resetErpRecords', expect.anything());
    });

    it("confirming posts resetErpRecords with the INTEGRATION's id (the reset runs through it)", async () => {
        const { user, panel } = await openSystem();
        await user.click(within(panel).getByRole('button', { name: /^reset records$/i }));

        const dialog = screen.getByRole('dialog', { name: /reset erp records/i });
        await user.click(within(dialog).getByRole('button', { name: /^reset$/i }));

        expect(getClient().postMessage).toHaveBeenCalledWith('resetErpRecords', { id: 'erp-integration' });
    });

    it('SAFETY: closing the reset dialog posts nothing', async () => {
        const { user, panel } = await openSystem();
        await user.click(within(panel).getByRole('button', { name: /^reset records$/i }));

        const dialog = screen.getByRole('dialog', { name: /reset erp records/i });
        await user.click(within(dialog).getByRole('button', { name: /^close$/i }));

        expect(getClient().postMessage).not.toHaveBeenCalledWith('resetErpRecords', expect.anything());
    });
});

describe('IntegrationsGrid — the link between them', () => {
    it("the system's Used by row opens the integration's flyout", async () => {
        const { user, panel } = await openSystem();

        await user.click(within(panel).getByRole('link', { name: 'ERP integration · Deployed' }));

        expect(screen.getByLabelText('ERP integration details')).toBeInTheDocument();
    });

    it("removing the integration names its system and its system's records", async () => {
        const user = setupUser();
        renderCards([integrationCard(), systemCard()]);
        const panel = await openPanel(user, 'ERP integration', 'Deployed');

        await user.click(within(panel).getByRole('button', { name: /^remove$/i }));

        const dialog = screen.getByRole('dialog', { name: /remove app builder component/i });
        expect(dialog).toHaveTextContent("Removes the integration and Nordwind too, with Nordwind's records.");
    });

    it('removing the system names the integration that goes with it', async () => {
        const { user, panel } = await openSystem();

        await user.click(within(panel).getByRole('button', { name: /^remove$/i }));

        const dialog = screen.getByRole('dialog', { name: /remove app builder component/i });
        expect(dialog).toHaveTextContent('Removes Nordwind, its records, and ERP integration, the integration that uses it.');
    });
});
