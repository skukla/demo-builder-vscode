/**
 * The catalog menu's door on the dashboard (EDS-24): a tile in the STOREFRONT zone, beside
 * Republish — it writes storefront pages and the nav, so it belongs with the storefront's
 * other content action. Edge Delivery only, like the zone itself.
 */

import React from 'react';
import { render, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ActionGrid, defaultProps, edsProps, getZone } from './ActionGrid.testUtils';

describe('ActionGrid — the catalog menu tile', () => {
    it('sits in the storefront zone and opens the catalog menu', () => {
        const handleCatalogMenu = jest.fn();
        const { container } = render(<ActionGrid {...edsProps} handleCatalogMenu={handleCatalogMenu} />);

        const storefront = getZone(container, 'storefront');
        const tile = storefront.querySelector('[data-action="catalog-menu-tile"]') as HTMLElement;
        expect(within(tile).getByText('Catalog Menu')).toBeInTheDocument();
        tile.click();
        expect(handleCatalogMenu).toHaveBeenCalledTimes(1);
    });

    it('says what it does before anyone presses it', () => {
        const { container } = render(<ActionGrid {...edsProps} handleCatalogMenu={jest.fn()} />);
        expect(within(getZone(container, 'storefront')).getByText(
            'Build the menu from the Commerce catalog, or remove it',
        )).toBeInTheDocument();
    });

    it('is absent without a handler, and absent on a headless project', () => {
        const eds = render(<ActionGrid {...edsProps} />);
        expect(eds.container.querySelector('[data-action="catalog-menu-tile"]')).not.toBeInTheDocument();
        eds.unmount();

        const headless = render(<ActionGrid {...defaultProps} handleCatalogMenu={jest.fn()} />);
        expect(headless.container.querySelector('[data-action="catalog-menu-tile"]')).not.toBeInTheDocument();
    });
});
