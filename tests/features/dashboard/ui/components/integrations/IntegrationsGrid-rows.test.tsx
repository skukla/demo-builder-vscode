/**
 * The grid's rows mode (owner, 2026-09-24): the same card models rendered one
 * per row, with the same drawer behind a click. The default stays cards, so no
 * surface changes shape without asking for it.
 */

import { fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { cardsFor, renderCards, resetGridMocks, twoDeployed } from './IntegrationsGrid.testUtils';

describe('IntegrationsGrid — rows', () => {
    beforeEach(() => resetGridMocks());

    it('renders one row per card, and no cards, when asked for rows', () => {
        const cards = cardsFor({ appBuilderComponents: twoDeployed() });
        const { container } = renderCards(cards, { viewMode: 'rows' });

        expect(container.querySelectorAll('.integration-row')).toHaveLength(cards.length);
        expect(container.querySelectorAll('.integration-card')).toHaveLength(0);
        for (const card of cards) {
            expect(screen.getByRole('button', { name: new RegExp(`^${card.name},`) })).toBeInTheDocument();
        }
    });

    it('renders cards, and no rows, by default', () => {
        const cards = cardsFor({ appBuilderComponents: twoDeployed() });
        const { container } = renderCards(cards);

        expect(container.querySelectorAll('.integration-card')).toHaveLength(cards.length);
        expect(container.querySelectorAll('.integration-row')).toHaveLength(0);
    });

    it('a row opens the same detail drawer a card does', () => {
        const cards = cardsFor({ appBuilderComponents: twoDeployed() });
        renderCards(cards, { viewMode: 'rows' });

        fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${cards[0].name},`) }));

        expect(screen.getByLabelText(`${cards[0].name} details`)).toBeInTheDocument();
    });

    it('switching modes keeps the cards and changes only their shape', () => {
        const cards = cardsFor({ appBuilderComponents: twoDeployed() });
        const { container, setCards } = renderCards(cards);
        expect(container.querySelectorAll('.integration-card')).toHaveLength(cards.length);

        setCards(cards, { viewMode: 'rows' });

        expect(container.querySelectorAll('.integration-row')).toHaveLength(cards.length);
        expect(container.querySelectorAll('.integration-card')).toHaveLength(0);
    });
});
