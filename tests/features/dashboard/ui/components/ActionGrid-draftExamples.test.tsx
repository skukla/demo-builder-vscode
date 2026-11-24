/**
 * Storefront zone — the Draft Examples tile (EDS-71 step 4c).
 *
 * A remedy tile: always there on an EDS storefront, wearing an amber dot while the last block
 * list build left blocks with no example, its words on hover ("13 blocks have no example").
 * Pressing it opens the SC's AI with the Draft Block Examples prompt (the press handler is the
 * screen's, `useDashboardActions`; here it is a fake whose call is asserted).
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ActionGrid, defaultProps, edsProps, getZone } from './ActionGrid.testUtils';

const storefront = (container: HTMLElement) => within(getZone(container, 'storefront'));
const tile = (count: number, onPress: () => void = jest.fn()) => ({ count, onPress });

describe('Storefront zone — the Draft Examples tile', () => {
    it('is a tile in the Storefront zone of an EDS project', () => {
        const { container } = render(<ActionGrid {...edsProps} draftExamples={tile(0)} />);

        expect(storefront(container).getByText('Draft Examples')).toBeInTheDocument();
    });

    it('is not offered on a project with no storefront', () => {
        render(<ActionGrid {...defaultProps} draftExamples={tile(3)} />);

        expect(screen.queryByText('Draft Examples')).not.toBeInTheDocument();
    });

    it('wears an amber dot, its words on hover, while blocks have no example', () => {
        const { container } = render(<ActionGrid {...edsProps} draftExamples={tile(13)} />);

        expect(screen.getByTestId('draft-examples-tile-dot')).toHaveAttribute('data-variant', 'warning');
        expect(storefront(container).getByRole('button', { name: 'Draft Examples, 13 blocks have no example' }))
            .toBeInTheDocument();
    });

    it('says "1 block" for one', () => {
        const { container } = render(<ActionGrid {...edsProps} draftExamples={tile(1)} />);

        expect(storefront(container).getByRole('button', { name: 'Draft Examples, 1 block has no example' }))
            .toBeInTheDocument();
    });

    it('wears no dot when every block has an example, and says so on hover', () => {
        const { container } = render(<ActionGrid {...edsProps} draftExamples={tile(0)} />);

        expect(screen.queryByTestId('draft-examples-tile-dot')).not.toBeInTheDocument();
        expect(storefront(container).getByText('Every block has an example')).toBeInTheDocument();
    });

    // Review F3: a project made before the record has never been checked; it must not claim
    // every block has an example.
    it('wears no dot and asks for Refresh Blocks when the project has no record yet', () => {
        const { container } = render(
            <ActionGrid {...edsProps} draftExamples={{ count: undefined, onPress: jest.fn() }} />,
        );

        expect(screen.queryByTestId('draft-examples-tile-dot')).not.toBeInTheDocument();
        expect(storefront(container).getByText('Refresh Blocks to check which blocks have no example'))
            .toBeInTheDocument();
        expect(screen.queryByText('Every block has an example')).not.toBeInTheDocument();
    });

    it("opens the SC's AI when pressed", () => {
        const onPress = jest.fn();
        const { container } = render(<ActionGrid {...edsProps} draftExamples={tile(3, onPress)} />);

        storefront(container).getByText('Draft Examples').click();

        expect(onPress).toHaveBeenCalledTimes(1);
    });
});
