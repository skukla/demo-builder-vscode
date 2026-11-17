/**
 * StageRows — the centred lines a wait or a run shows: what it does, the part under way, the time.
 *
 * Owner walk, 2026-11-16: in a run, the lines shifted when the time line arrived a second in. A run's
 * rows hold their room from the first frame (`hold`); a dialog's short wait keeps only the rows it
 * has words for, so its spinner does not sit high over blank rows.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { StageRows, StageWait } from '@/core/ui/components/feedback/StageWait';

const rows = (container: HTMLElement): number =>
    container.querySelectorAll('.loading-display-row').length;

describe('StageRows', () => {
    it('holds all three rows from the first frame when asked, before the count or the first second', () => {
        const { container } = render(
            <StageRows hold lines={{ label: 'Installing in Commerce' }} />
        );

        expect(rows(container)).toBe(3);
    });

    it('CONTROL: without hold, only the rows it has words for', () => {
        const { container } = render(
            <StageRows lines={{ label: 'Installing in Commerce' }} />
        );

        expect(container).toHaveTextContent('Installing in Commerce');
        expect(rows(container)).toBeLessThan(3);
    });
});

// Walk F217 (owner, 2026-11-17): a dialog's wait and the run after it sat in one place at two sizes.
// One size, large, with no setting a window can pass (the type has none); only a flyout's brief wait
// stays medium, a label alone in a narrow panel.
describe('one spinner size', () => {
    const spinner = (): HTMLElement => screen.getByRole('progressbar');

    it("draws a dialog's wait large, as the run that follows it", () => {
        render(<StageWait lines={{ label: 'Comparing with Commerce', expectation: 'Usually about a minute' }} />);

        expect(spinner()).toHaveAttribute('data-size', 'L');
    });

    it('draws a run large', () => {
        render(<StageRows hold lines={{ label: 'Exporting from Commerce' }} />);

        expect(spinner()).toHaveAttribute('data-size', 'L');
    });

    it("keeps a flyout's brief wait medium", () => {
        render(<StageWait brief lines={{ label: 'Reading the datapack' }} />);

        expect(spinner()).toHaveAttribute('data-size', 'M');
    });
});
