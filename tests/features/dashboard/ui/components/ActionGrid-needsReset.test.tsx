/**
 * The Reset tile is the remedy for a storefront behind how Demo Builder builds storefronts
 * now (`storefrontChanges.ts`): it wears the "Needs reset" dot with the status's one line,
 * and pressing it is the dashboard's own reset, with its confirmation.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ActionGrid, edsProps, getZone } from './ActionGrid.testUtils';

describe('Build zone — the Reset tile wears the "Needs reset" dot', () => {
    // No "Needs reset" beside the word Reset: it said reset twice (owner, 2026-10-26).
    it('wears a warning dot and the one line, without repeating the word, when the storefront is behind', () => {
        const { container } = render(<ActionGrid {...edsProps} needsReset />);
        const build = within(getZone(container, 'build'));

        expect(screen.getByTestId('reset-tile-dot')).toHaveAttribute('data-variant', 'warning');
        expect(build.queryByText('Needs reset')).not.toBeInTheDocument();
        expect(
            build.getByText(
                "Demo Builder has fixes this storefront doesn't have yet.",
            ),
        ).toBeInTheDocument();
    });

    it('runs the reset when pressed', () => {
        const handleResetProject = jest.fn();
        const { container } = render(<ActionGrid {...edsProps} needsReset handleResetProject={handleResetProject} />);

        within(getZone(container, 'build')).getByText('Reset').click();
        expect(handleResetProject).toHaveBeenCalledTimes(1);
    });

    it('wears no dot when the storefront is current', () => {
        render(<ActionGrid {...edsProps} />);

        expect(screen.queryByTestId('reset-tile-dot')).not.toBeInTheDocument();
        expect(screen.queryByText('Needs reset')).not.toBeInTheDocument();
    });
});
