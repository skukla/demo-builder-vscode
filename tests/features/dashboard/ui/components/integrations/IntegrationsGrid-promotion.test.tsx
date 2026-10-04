/**
 * The card's repository verbs reach the extension (AB-1c): "Save to GitHub" on a
 * blank-starter app and "Delete its GitHub repository" on one Demo Builder saved,
 * each naming the component; the extension asks and confirms in its own dialogs.
 */

import { within } from '@testing-library/react';
import { card, getClient, renderGrid, resetGridMocks, setupUser } from './IntegrationsGrid.testUtils';

const SHELL = { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' };

beforeEach(() => {
    resetGridMocks();
});

describe('IntegrationsGrid repository verbs', () => {
    it('sends the save for a blank-starter app', async () => {
        const user = setupUser();
        renderGrid({
            appBuilderComponents: {
                'order-sync': { kind: 'integration', status: 'deployed', name: 'Order Sync', source: SHELL },
            },
        });

        const tile = card('Order Sync', 'Deployed');
        await user.click(within(tile).getByRole('button', { name: 'Save to GitHub' }));

        expect(getClient().postMessage).toHaveBeenCalledWith('promoteAppBuilderComponent', {
            id: 'order-sync',
        });
    });

    it('sends the undo for an app Demo Builder saved', async () => {
        const user = setupUser();
        renderGrid({
            appBuilderComponents: {
                'order-sync': {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'Order Sync',
                    source: { owner: 'steve', repo: 'order-sync', branch: 'main' },
                    promotion: { from: SHELL, at: '2026-10-05T00:00:00.000Z' },
                },
            },
        });

        const tile = card('Order Sync', 'Deployed');
        await user.click(within(tile).getByRole('button', { name: 'Delete its GitHub repository' }));

        expect(getClient().postMessage).toHaveBeenCalledWith('unpromoteAppBuilderComponent', {
            id: 'order-sync',
        });
    });
});
