/**
 * IntegrationsGrid — the flyout's "Open setup guide" opens that card's demo setup guide
 * (AB-26x), the way its "Edit settings" opens the Settings modal.
 */

import { screen, within } from '@testing-library/react';
import {
    card,
    cardsFor,
    openPanel,
    renderCards,
    resetGridMocks,
    setupUser,
    twoDeployed,
} from './IntegrationsGrid.testUtils';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

const STEPS: SetupChecklistItem[] = [
    {
        id: 'confirmed-status',
        title: 'Create the "Confirmed in ERP" order status',
        why: 'An order the ERP confirmed looks different in the Orders grid.',
        where: 'Stores > Settings > Order Status',
        state: 'open',
        checkable: false,
    },
];

function renderWithSteps() {
    const cards = cardsFor({ appBuilderComponents: twoDeployed() }).map((card) =>
        card.id === 'other-app' ? { ...card, setupChecklist: STEPS } : card
    );
    return renderCards(cards);
}

beforeEach(() => {
    resetGridMocks();
});

describe('IntegrationsGrid setup guide', () => {
    it("the flyout's link opens that card's guide on its first step, and Close closes it", async () => {
        const user = setupUser();
        renderWithSteps();

        // The card says there is setup left, in its badge and in what a screen reader hears.
        expect(
            within(card('other-app', 'Deployed, Setup: 1 to do')).getByText('Setup: 1 to do')
        ).toBeInTheDocument();
        const panel = await openPanel(user, 'other-app', 'Deployed, Setup: 1 to do');
        expect(within(panel).getByText('0 of 1 done')).toBeInTheDocument();
        await user.click(within(panel).getByRole('link', { name: 'Open setup guide' }));

        const guide = screen.getByRole('dialog', { name: /^Demo setup:/ });
        // The title appears twice by design — in the step list and as the shown step's heading.
        expect(
            within(guide).getByRole('heading', {
                name: 'Create the "Confirmed in ERP" order status',
            })
        ).toBeInTheDocument();
        expect(within(guide).getByRole('tab', { name: /Confirmed in ERP/ })).toHaveAttribute(
            'aria-selected',
            'true'
        );
        expect(within(guide).getByText('To do')).toBeInTheDocument();

        await user.click(within(guide).getByRole('button', { name: 'Close' }));
        expect(screen.queryByRole('dialog', { name: /^Demo setup:/ })).not.toBeInTheDocument();
    });
});
