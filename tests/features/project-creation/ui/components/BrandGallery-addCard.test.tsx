/**
 * The plus card at the end of the grid: "Add a demo package".
 */

import { fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { cards, renderGallery } from './BrandGallery.testUtils';

function addCard(): HTMLElement | null {
    return screen.queryByTestId('add-demo-card');
}

describe('BrandGallery — the Add a demo package card', () => {
    it('is rendered last, with the accepted words, only when a handler is given', () => {
        const first = renderGallery();
        expect(addCard()).not.toBeInTheDocument();
        first.unmount();

        renderGallery({ onAddDemo: jest.fn() });
        const card = addCard();
        expect(card).toHaveAccessibleName("Add a demo package: Use a colleague's storefront or your own, from a link or a zip file.");
        expect(card!.parentElement!.lastElementChild).toBe(card);
        expect(cards()).toHaveLength(3);
    });

    it('opens the dialog on click and on Enter', () => {
        const onAddDemo = jest.fn();
        renderGallery({ onAddDemo });
        fireEvent.click(addCard()!);
        fireEvent.keyDown(addCard()!, { key: 'Enter' });
        expect(onAddDemo).toHaveBeenCalledTimes(2);
    });

    it('dims with the other cards once a package is selected', () => {
        renderGallery({ onAddDemo: jest.fn(), selectedPackage: 'active-brand' });
        expect(addCard()).toHaveClass('dimmed');
    });

    it('steps aside while the grid is being filtered', () => {
        renderGallery({ onAddDemo: jest.fn() });
        fireEvent.change(screen.getByPlaceholderText('Filter packages'), { target: { value: 'Other' } });
        expect(addCard()).not.toBeInTheDocument();
    });
});
