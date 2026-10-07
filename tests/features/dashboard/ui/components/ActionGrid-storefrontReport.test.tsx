/**
 * The Storefront Report tile: it opens the report, and wears a dot when the
 * report has something to read — links in the content to pages that do not
 * exist (2026-10-07). They used to be a pop-up on every create and reset.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ActionGrid, edsProps, getZone } from './ActionGrid.testUtils';

describe('Storefront zone — the Storefront Report tile', () => {
    it('opens the report when pressed', () => {
        const handleOpenStorefrontReport = jest.fn();
        const { container } = render(
            <ActionGrid {...edsProps} handleOpenStorefrontReport={handleOpenStorefrontReport} />,
        );

        within(getZone(container, 'storefront')).getByText('Storefront Report').click();
        expect(handleOpenStorefrontReport).toHaveBeenCalledTimes(1);
    });

    it('wears an info dot, with words, when the content has broken links', () => {
        const { container } = render(
            <ActionGrid {...edsProps} handleOpenStorefrontReport={jest.fn()} brokenLinkCount={2} />,
        );

        expect(screen.getByTestId('storefront-report-dot')).toHaveAttribute('data-variant', 'info');
        expect(within(getZone(container, 'storefront')).getByText('Broken links')).toBeInTheDocument();
        expect(within(getZone(container, 'storefront')).getByText(/2 links go to pages that don't exist/)).toBeInTheDocument();
    });

    it('wears no dot when there is nothing to read', () => {
        render(<ActionGrid {...edsProps} handleOpenStorefrontReport={jest.fn()} brokenLinkCount={0} />);

        expect(screen.queryByTestId('storefront-report-dot')).not.toBeInTheDocument();
    });

    it('is not offered without a handler (a project with no storefront)', () => {
        const { container } = render(<ActionGrid {...edsProps} />);

        expect(within(getZone(container, 'storefront')).queryByText('Storefront Report')).not.toBeInTheDocument();
    });
});
