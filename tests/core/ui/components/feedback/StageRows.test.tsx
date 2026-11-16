/**
 * StageRows — the centred lines a wait or a run shows: what it does, the part under way, the time.
 *
 * Owner walk, 2026-11-16: in a run, the lines shifted when the time line arrived a second in. A run's
 * rows hold their room from the first frame (`hold`); a dialog's short wait keeps only the rows it
 * has words for, so its spinner does not sit high over blank rows.
 */

import { render } from '@testing-library/react';
import React from 'react';
import { StageRows } from '@/core/ui/components/feedback/StageWait';

const rows = (container: HTMLElement): number =>
    container.querySelectorAll('.loading-display-row').length;

describe('StageRows', () => {
    it('holds all three rows from the first frame when asked, before the count or the first second', () => {
        const { container } = render(
            <StageRows size="L" hold lines={{ label: 'Installing in Commerce' }} />
        );

        expect(rows(container)).toBe(3);
    });

    it('CONTROL: without hold, only the rows it has words for', () => {
        const { container } = render(
            <StageRows size="L" lines={{ label: 'Installing in Commerce' }} />
        );

        expect(container).toHaveTextContent('Installing in Commerce');
        expect(rows(container)).toBeLessThan(3);
    });
});
