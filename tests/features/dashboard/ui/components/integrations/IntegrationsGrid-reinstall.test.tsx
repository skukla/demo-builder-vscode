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
