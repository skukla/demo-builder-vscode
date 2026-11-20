/**
 * ResultBody: how a run or an action ended, drawn the wizard's way in every result window (owner,
 * 2026-11-17, walk F222): a large status mark, the outcome under it in bold, then the reason. One
 * reason is centred under the outcome; several read left-aligned in a block, which scrolls with a
 * fade so the mark, the outcome and the buttons stay in view. "Took …" stays for a long run.
 */

import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';
import React from 'react';
import { ResultBody } from '@/core/ui/components/feedback/ResultBody';

describe('ResultBody', () => {
    it('draws the status as a large mark, then the outcome under it', () => {
        const { container } = render(<ResultBody status="success" outcome="Up to Date" />);

        const mark = container.querySelector('.result-mark');
        expect(mark).toHaveAttribute('data-status', 'success');
        expect(screen.getByText('Up to Date')).toHaveClass('result-outcome');
        expect(mark?.compareDocumentPosition(screen.getByText('Up to Date'))).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING
        );
    });

    it.each(['error', 'warning'] as const)('marks a %s in its own colour', (status) => {
        const { container } = render(<ResultBody status={status} outcome="Couldn't Install" />);

        expect(container.querySelector('.result-mark')).toHaveAttribute('data-status', status);
    });

    it('centres one reason under the outcome', () => {
        render(
            <ResultBody
                status="error"
                outcome="Couldn't Install"
                lines={['Commerce refused the products.']}
            />
        );

        expect(screen.getByText('Commerce refused the products.')).toHaveClass('result-reason');
        expect(document.querySelector('.result-detail')).toBeNull();
    });

    it('reads several lines left-aligned in a block that scrolls with a fade', () => {
        render(
            <ResultBody
                status="warning"
                outcome="Installed"
                lines={['3 products were skipped.', 'Open the log to see why.']}
            />
        );

        const block = document.querySelector('.result-detail');
        expect(block).toHaveClass('scroll-fade', 'scroll-fade--capped');
        const lines = Array.from(block?.querySelectorAll('.dialog-line') ?? []).map(
            (line) => line.textContent
        );
        expect(lines).toEqual(['3 products were skipped.', 'Open the log to see why.']);
        expect(document.querySelector('.result-reason')).toBeNull();
    });

    it('keeps rows under the outcome, in the same block', () => {
        render(
            <ResultBody status="warning" outcome="Couldn't Reset">
                <ul data-testid="rows" />
            </ResultBody>
        );

        expect(document.querySelector('.result-detail')).toContainElement(
            screen.getByTestId('rows')
        );
    });

    it('says how long a run of a minute or more took, under the rest', () => {
        render(<ResultBody status="success" outcome="Installed" tookMs={185_000} />);

        expect(screen.getByText('Took 3 minutes, 5 seconds')).toBeInTheDocument();
    });

    it('draws no mark when the end is neither good nor bad', () => {
        const { container } = render(<ResultBody outcome="Running in Background" />);

        expect(container.querySelector('.result-mark')).toBeNull();
        expect(screen.getByText('Running in Background')).toHaveClass('result-outcome');
    });
});
