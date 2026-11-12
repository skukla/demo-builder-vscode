/**
 * What sits under a run's rows (plan step-03 S1; overview Phase 4, "Took …"): the clock while it
 * runs, its line held from the first frame; once it ends, the sentence, the lines left to know, and
 * "Took …" in the quiet note, only for a run of a minute or more.
 */

import '@testing-library/jest-dom';

import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { RunFoot } from '@/core/ui/components/feedback/RunFoot';

const STARTED = 1_000_000;

describe('RunFoot while the run goes', () => {
    beforeEach(() => {
        jest.setSystemTime(STARTED);
    });

    it('holds the clock’s line from the first frame, before the clock has anything to say', () => {
        const { container } = render(<RunFoot running={{ startedAt: STARTED }} />);

        expect(container.querySelector('.dialog-note')).toBeInTheDocument();
    });

    it('counts the run on that line', () => {
        render(<RunFoot running={{ startedAt: STARTED }} />);

        act(() => {
            jest.advanceTimersByTime(8_000);
        });

        expect(screen.getByText('8 seconds')).toHaveClass('dialog-note');
    });

    it('shows no Took while it runs', () => {
        render(<RunFoot running={{ startedAt: STARTED }} tookMs={240_000} />);

        expect(screen.queryByText(/^Took /u)).not.toBeInTheDocument();
    });
});

describe('RunFoot once the run has ended', () => {
    it('says the sentence, then each line, then how long a long run took', () => {
        const { container } = render(
            <RunFoot
                lead="Saved a new version of My Luma."
                lines={['Kept 2 things you changed.']}
                tookMs={192_000}
            />
        );

        expect(screen.getByText('Saved a new version of My Luma.')).toHaveClass('lead-text');
        expect(screen.getByText('Kept 2 things you changed.')).toHaveClass('dialog-line');
        expect(screen.getByText('Took 3 minutes, 12 seconds')).toHaveClass('dialog-note');
        expect(container.firstElementChild?.lastElementChild).toHaveTextContent(
            'Took 3 minutes, 12 seconds'
        );
    });

    it('says nothing of how long a run under a minute took', () => {
        render(<RunFoot lead="Saved." tookMs={59_000} />);

        expect(screen.queryByText(/^Took /u)).not.toBeInTheDocument();
    });

    it('draws what else the run left above the Took line', () => {
        const { container } = render(
            <RunFoot tookMs={60_000}>
                <div data-testid="extra">An Admin step</div>
            </RunFoot>
        );

        const foot = container.firstElementChild;
        expect(foot?.children[0]).toHaveAttribute('data-testid', 'extra');
        expect(foot?.children[1]).toHaveTextContent('Took 1 minute');
    });

    it('renders nothing when there is nothing left to say', () => {
        const { container } = render(<RunFoot tookMs={5_000} lines={[]} />);

        expect(container).toBeEmptyDOMElement();
    });

    it('carries the host’s class, beside its own stack', () => {
        const { container } = render(<RunFoot className="projects-batch-took" tookMs={125_000} />);

        expect(container.firstElementChild).toHaveClass('dialog-stack', 'projects-batch-took');
    });
});
