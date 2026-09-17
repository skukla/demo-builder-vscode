/**
 * IntegrationsGrid — Reinstall in Commerce (AB-13, step 4): a confirm that
 * opens by itself when an update ends in a refused upgrade, and a menu item for
 * as long as the reinstall is still needed.
 */

import { act, screen, within } from '@testing-library/react';
import { getClient, openPanel, renderCards, resetGridMocks, setupUser } from './IntegrationsGrid.testUtils';
import type { IntegrationCardModel } from '@/core/ui/components/integrations/integrationCardModel.types';

function erpCard(needsReinstall: boolean): IntegrationCardModel {
    return {
        id: 'erp-integration',
        isMesh: false,
        name: 'ERP integration',
        kindLabel: 'Pre-built',
        sourceIsAi: false,
        status: 'deployed',
        statusLabel: 'Deployed',
        dotVariant: 'success',
        urlLabel: 'App URL',
        menuActions: needsReinstall ? ['reinstall', 'redeploy', 'remove'] : ['redeploy', 'remove'],
        canRename: false,
        installation: needsReinstall
            ? { label: 'Needs reinstall', failed: true, needsReinstall: true }
            : { label: 'Installed', failed: false },
    };
}

const reinstallDialog = () => screen.queryByRole('dialog', { name: /reinstall in commerce/i });

beforeEach(() => {
    resetGridMocks();
});

describe('IntegrationsGrid — reinstall', () => {
    it('opens the confirm by itself when an update ends in a refused upgrade', () => {
        const { setCards } = renderCards([erpCard(false)]);
        expect(reinstallDialog()).toBeNull();

        act(() => setCards([erpCard(true)]));

        const dialog = reinstallDialog();
        expect(dialog).not.toBeNull();
        expect(dialog).toHaveTextContent('Commerce would not upgrade ERP integration in place.');
        expect(getClient().postMessage).not.toHaveBeenCalledWith('reinstallAppBuilderComponent', expect.anything());
    });

    it('stays quiet for a refusal that was already there when the screen opened', () => {
        const { setCards } = renderCards([erpCard(true)]);

        act(() => setCards([erpCard(true)]));

        expect(reinstallDialog()).toBeNull();
    });

    it('confirming posts reinstallAppBuilderComponent with the id', async () => {
        const user = setupUser();
        const { setCards } = renderCards([erpCard(false)]);
        act(() => setCards([erpCard(true)]));

        await user.click(within(reinstallDialog()!).getByRole('button', { name: /^reinstall$/i }));

        expect(getClient().postMessage).toHaveBeenCalledWith('reinstallAppBuilderComponent', {
            id: 'erp-integration',
        });
    });

    it('SAFETY: closing the confirm posts nothing', async () => {
        const user = setupUser();
        const { setCards } = renderCards([erpCard(false)]);
        act(() => setCards([erpCard(true)]));

        await user.click(within(reinstallDialog()!).getByRole('button', { name: /^close$/i }));

        expect(getClient().postMessage).not.toHaveBeenCalledWith('reinstallAppBuilderComponent', expect.anything());
    });

    it('the menu item opens the same confirm while the reinstall is needed', async () => {
        const user = setupUser();
        renderCards([erpCard(true)]);
        const panel = await openPanel(user, 'ERP integration', 'Deployed');

        await user.click(within(panel).getByRole('button', { name: /^reinstall in commerce$/i }));

        expect(reinstallDialog()).not.toBeNull();
        expect(getClient().postMessage).not.toHaveBeenCalledWith('reinstallAppBuilderComponent', expect.anything());
    });
});

function stoppedCard(reason?: string): IntegrationCardModel {
    const card = { ...erpCard(false), componentId: 'erp-integration-key' };
    return reason
        ? { ...card, removalStopped: reason, statusLabel: 'Removal stopped', menuActions: ['redeploy', 'remove', 'remove-anyway'] }
        : card;
}

const REASON = 'Nothing was removed. ERP integration could not be uninstalled from Commerce (timed out).';
const removeAnywayDialog = () => screen.queryByRole('dialog', { name: /removal stopped/i });

describe('IntegrationsGrid — remove anyway', () => {
    it('opens the confirm by itself when a removal stops, with its reason', () => {
        const { setCards } = renderCards([stoppedCard()]);

        act(() => setCards([stoppedCard(REASON)]));

        expect(removeAnywayDialog()).toHaveTextContent(REASON);
        expect(getClient().postMessage).not.toHaveBeenCalled();
    });

    it('confirming removes with force, by the component id', async () => {
        const user = setupUser();
        const { setCards } = renderCards([stoppedCard()]);
        act(() => setCards([stoppedCard(REASON)]));

        await user.click(within(removeAnywayDialog()!).getByRole('button', { name: /^remove anyway$/i }));

        expect(getClient().postMessage).toHaveBeenCalledWith('removeAppBuilderComponent', {
            id: 'erp-integration-key',
            force: true,
        });
    });

    it('the menu opens it for a stop that predates the screen; closing posts nothing', async () => {
        const user = setupUser();
        renderCards([stoppedCard(REASON)]);
        expect(removeAnywayDialog()).toBeNull();
        const panel = await openPanel(user, 'ERP integration', 'Removal stopped');

        await user.click(within(panel).getByRole('button', { name: /^remove anyway$/i }));
        await user.click(within(removeAnywayDialog()!).getByRole('button', { name: /^close$/i }));

        expect(removeAnywayDialog()).toBeNull();
        expect(getClient().postMessage).not.toHaveBeenCalled();
    });
});
