/**
 * IntegrationsGrid — an integration's Settings (AB-21).
 *
 * A component with settings gains "Settings" in its menu and a Settings row in
 * the flyout, with an "Edit settings" link; both open the one shared modal. A
 * component without settings shows neither.
 */

import { screen, within } from '@testing-library/react';
import {
    cardsFor,
    openPanel,
    renderCards,
    resetGridMocks,
    setupUser,
    twoDeployed,
} from './IntegrationsGrid.testUtils';
import type { ComponentSettings } from '@/types/appBuilderComponents';

const SETTINGS: ComponentSettings = {
    fields: [
        { name: 'ERP_DISPLAY_NAME', label: 'ERP name', type: 'text', required: false, value: 'Acme ERP' },
        { name: 'ERP_API_KEY', label: 'API key', type: 'secret', required: true, isSet: false },
    ],
    connected: [],
};

function renderWithSettings() {
    return renderCards(cardsFor({ appBuilderComponents: twoDeployed() }), {
        componentSettings: { 'other-app': SETTINGS },
    });
}

beforeEach(() => {
    resetGridMocks();
});

describe('IntegrationsGrid settings', () => {
    // The values are in the modal, not restated in the flyout (owner, 2026-10-01: "What
    // is the value of the 'Settings' block to the SC?").
    it("the flyout restates no settings, and its Settings action opens that card's modal", async () => {
        const user = setupUser();
        renderWithSettings();

        const panel = await openPanel(user, 'other-app', 'Deployed');
        expect(within(panel).queryByText(/ERP name: Acme ERP/)).not.toBeInTheDocument();
        expect(within(panel).queryByRole('link', { name: 'Edit settings' })).not.toBeInTheDocument();
        await user.click(within(panel).getByRole('button', { name: /^settings$/i }));

        const modal = screen.getByTestId('settings-modal');
        expect(modal).toHaveAttribute('data-component-id', 'other-app');
        expect(modal).toHaveTextContent('settings: other-app (ERP name, API key)');
    });

    it("the menu's Settings item opens the same modal, and closing it closes it", async () => {
        const user = setupUser();
        renderWithSettings();

        const panel = await openPanel(user, 'other-app', 'Deployed');
        await user.click(within(panel).getByRole('button', { name: /^settings$/i }));
        expect(screen.getAllByTestId('settings-modal')).toHaveLength(1);

        await user.click(screen.getByRole('button', { name: 'close-settings' }));
        expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument();
    });

    it('a component without settings has no Settings item and no Settings row', async () => {
        const user = setupUser();
        renderWithSettings();

        const panel = await openPanel(user, 'custom-app', 'Deployed');

        expect(within(panel).queryByText('Edit settings')).not.toBeInTheDocument();
        expect(within(panel).queryByRole('button', { name: /^settings$/i })).not.toBeInTheDocument();
    });
});
