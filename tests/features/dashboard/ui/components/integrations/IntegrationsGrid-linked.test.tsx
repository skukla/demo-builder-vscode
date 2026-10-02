/**
 * IntegrationsGrid — linked cards (the ERP integration and the ERP it uses).
 * The system card's screen and reset go through its integration's id; its
 * redeploy uses its own; each flyout opens the other card; removing either
 * names both.
 */

import { screen, within } from '@testing-library/react';
import {
    getClient,
    openPanel,
    renderCards,
    resetGridMocks,
    setupUser,
} from './IntegrationsGrid.testUtils';
import type {
    IntegrationCardModel,
    LinkedCard,
} from '@/core/ui/components/integrations/integrationCardModel.types';

const INTEGRATION_LINK: LinkedCard = {
    id: 'erp-integration',
    name: 'ERP integration',
    status: 'deployed',
    statusLabel: 'Deployed',
    dotVariant: 'success',
};
const SYSTEM_LINK: LinkedCard = {
    id: 'demo-erp',
    name: 'Nordwind',
    status: 'deployed',
    statusLabel: 'Deployed',
    dotVariant: 'success',
};

function integrationCard(): IntegrationCardModel {
    return {
        id: 'erp-integration',
        isMesh: false,
        name: 'ERP integration',
        kindLabel: 'Pre-built',
        sourceLine: 'skukla/commerce-erp-integration',
        status: 'deployed',
        statusLabel: 'Deployed',
        dotVariant: 'success',
        url: 'https://ns.adobeioruntime.net/api/v1/web/erp/status',
        urlLabel: 'App URL',
        menuActions: [
            'open',
            'redeploy',
            'manage-apis',
            'add-erp',
            'load-demo-data',
            'reset-records',
            'remove',
        ],
        canRename: false,
        linked: { cards: [SYSTEM_LINK] },
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
        status: 'deployed',
        statusLabel: 'Deployed',
        dotVariant: 'success',
        url: 'https://ns.adobeio-static.net/index.html',
        urlLabel: 'Screen',
        menuActions: [
            'open',
            'load-demo-data',
            'appearance',
            'simulate-downtime',
            'redeploy',
            'remove',
        ],
        canRename: false,
        linked: { cards: [INTEGRATION_LINK] },
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

async function openIntegration() {
    const user = setupUser();
    renderCards([integrationCard(), systemCard()]);
    const panel = await openPanel(user, 'ERP integration', 'Deployed');
    return { user, panel };
}

describe('IntegrationsGrid — the card faces', () => {
    it('the system card carries its type badge; both name the other behind a link icon', () => {
        renderCards([integrationCard(), systemCard()]);

        const system = screen.getByRole('button', { name: 'Nordwind, Deployed' });
        expect(within(system).getByTestId('type-badge')).toHaveTextContent('ERP');
        expect(within(system).getByTitle('Connected to ERP integration')).toBeInTheDocument();
        const integration = screen.getByRole('button', { name: 'ERP integration, Deployed' });
        expect(within(integration).queryByTestId('type-badge')).toBeNull();
        expect(within(integration).getByTitle('Connected to Nordwind')).toBeInTheDocument();
    });
});

describe('IntegrationsGrid — the system card verbs', () => {
    it("Open <ERP> opens the ERP screen through the integration's id", async () => {
        const { user, panel } = await openSystem();

        await user.click(within(panel).getByRole('button', { name: 'Open Nordwind' }));

        expect(getClient().postMessage).toHaveBeenCalledWith('openErpScreen', {
            id: 'erp-integration',
            erp: 'demo-erp',
        });
        expect(getClient().postMessage).not.toHaveBeenCalledWith('openLiveSite', expect.anything());
    });

    it("Redeploy posts the system's OWN id", async () => {
        const { user, panel } = await openSystem();

        await user.click(within(panel).getByRole('button', { name: /^redeploy$/i }));

        expect(getClient().postMessage).toHaveBeenCalledWith('redeployAppBuilderComponent', {
            id: 'demo-erp',
            progress: 'modal',
        });
    });

    it("Fill from Commerce fills THIS ERP, through the INTEGRATION's id, straight into the modal", async () => {
        const { user, panel } = await openSystem();

        await user.click(within(panel).getByRole('button', { name: /^fill from commerce$/i }));

        // No confirm: it adds and updates records, and removes nothing.
        expect(screen.queryByRole('dialog', { name: /reset erps/i })).toBeNull();
        expect(getClient().postMessage).toHaveBeenCalledWith('loadErpDemoData', {
            id: 'erp-integration',
            // This ERP, by its own id: an integration can serve several (AB-16).
            erp: 'demo-erp',
            progress: 'modal',
        });
    });

    // The demo controls (AB-59): through the INTEGRATION's id, naming THIS ERP, in a modal
    // that reads the ERP as it opens.
    it.each([
        ['Appearance', 'Nordwind: demo appearance'],
        ['Simulate downtime', 'Nordwind: simulate downtime'],
    ])('%s opens its modal on THIS ERP', async (label, title) => {
        const { user, panel } = await openSystem();

        await user.click(within(panel).getByRole('button', { name: label }));

        expect(await screen.findByText(title)).toBeInTheDocument();
        expect(getClient().request).toHaveBeenCalledWith('getErpDemoControls', {
            id: 'erp-integration',
            erp: 'demo-erp',
        });
    });

    // The reset covers every ERP (an order can span several), so it is the
    // integration's verb, not an ERP's (owner, 2026-10-01).
    it('offers no reset on an ERP', async () => {
        const { panel } = await openSystem();

        expect(within(panel).queryByRole('button', { name: /reset/i })).toBeNull();
    });
});

describe("IntegrationsGrid — the integration's ERP verbs", () => {
    it('Fill ERPs from Commerce fills every ERP it serves — no ERP named', async () => {
        const { user, panel } = await openIntegration();

        await user.click(within(panel).getByRole('button', { name: /^fill erps from commerce$/i }));

        expect(getClient().postMessage).toHaveBeenCalledWith('loadErpDemoData', {
            id: 'erp-integration',
            progress: 'modal',
        });
    });

    it('Reset ERPs opens a confirm naming every ERP, and posts NOTHING until confirmed', async () => {
        const { user, panel } = await openIntegration();

        await user.click(within(panel).getByRole('button', { name: /^reset erps$/i }));

        const dialog = screen.getByRole('dialog', { name: /reset erps/i });
        expect(dialog).toHaveTextContent('Resets Nordwind: wipes their records');
        expect(dialog).toHaveTextContent('A cancelled order cannot be reopened.');
        expect(getClient().postMessage).not.toHaveBeenCalledWith(
            'resetErpRecords',
            expect.anything()
        );
    });

    it("confirming posts resetErpRecords with the integration's id", async () => {
        const { user, panel } = await openIntegration();
        await user.click(within(panel).getByRole('button', { name: /^reset erps$/i }));

        const dialog = screen.getByRole('dialog', { name: /reset erps/i });
        await user.click(within(dialog).getByRole('button', { name: /^reset$/i }));

        // Through the runner, so it carries `progress: 'modal'` and this screen's
        // modal narrates it (owner, 2026-09-20).
        expect(getClient().postMessage).toHaveBeenCalledWith('resetErpRecords', {
            id: 'erp-integration',
            progress: 'modal',
        });
    });

    it('SAFETY: closing the reset dialog posts nothing', async () => {
        const { user, panel } = await openIntegration();
        await user.click(within(panel).getByRole('button', { name: /^reset erps$/i }));

        const dialog = screen.getByRole('dialog', { name: /reset erps/i });
        await user.click(within(dialog).getByRole('button', { name: /^close$/i }));

        expect(getClient().postMessage).not.toHaveBeenCalledWith(
            'resetErpRecords',
            expect.anything()
        );
    });
});

describe('IntegrationsGrid — the link between them', () => {
    it("the system's Connected to row opens the integration's flyout", async () => {
        const { user, panel } = await openSystem();

        await user.click(within(panel).getByRole('link', { name: 'ERP integration' }));

        expect(screen.getByLabelText('ERP integration details')).toBeInTheDocument();
    });

    it("removing the integration names its system and its system's records", async () => {
        const user = setupUser();
        renderCards([integrationCard(), systemCard()]);
        const panel = await openPanel(user, 'ERP integration', 'Deployed');

        await user.click(within(panel).getByRole('button', { name: /^remove$/i }));

        const dialog = screen.getByRole('dialog', { name: 'Remove ERP integration' });
        expect(dialog).toHaveTextContent('Nordwind will be removed too, with its records.');
    });

    it('removing the system names the integration that goes with it', async () => {
        const { user, panel } = await openSystem();

        await user.click(within(panel).getByRole('button', { name: /^remove$/i }));

        const dialog = screen.getByRole('dialog', { name: 'Remove Nordwind' });
        expect(dialog).toHaveTextContent(
            'Its records will be deleted, and ERP integration will be removed too.'
        );
    });
});
