/**
 * The progress window while it runs: the room for three lines is kept, and what is there sits
 * level, so nothing blank rides under the spinner (measured in a browser, 42 above and 73 below
 * on "Starting", before row 3 stopped being a blank). A browser measures the levelling; this pins
 * the markup it depends on, over the real LoadingDisplay.
 */

import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';
import React from 'react';
import { OperationProgressBody } from '@/core/ui/components/feedback/OperationProgressBody';
import type { OperationRow } from '@/types/webviewPayloads';

const STARTED = 1_000_000;

function renderRunning(extra: Partial<React.ComponentProps<typeof OperationProgressBody>> = {}) {
    return render(<OperationProgressBody failed={false} succeeded={false} onTyped={jest.fn()} {...extra} />);
}

describe('OperationProgressBody, running', () => {
    beforeEach(() => {
        jest.setSystemTime(STARTED);
    });

    it('holds no blank row under "Starting", with no word from the run yet', () => {
        const { container } = renderRunning();

        expect(screen.getByText('Starting')).toBeInTheDocument();
        expect(container.querySelector('.text-xs')).toBeNull();
    });

    it('holds no blank row under a step that has no expectation or clock yet', () => {
        const { container } = renderRunning({ progress: { id: 'x', state: 'running', stage: 'Clearing products', step: '240 of 1,284' } });

        expect(screen.getByText('240 of 1,284')).toBeInTheDocument();
        expect(container.querySelector('.text-xs')).toBeNull();
    });

    it('CONTROL: draws the third row once it has words', () => {
        const { container } = renderRunning({ progress: { id: 'x', state: 'running', stage: 'Deploying', expectation: 'Usually about 2 minutes' } });

        expect(container.querySelector('.text-xs')).toHaveTextContent('Usually about 2 minutes');
    });

    it('draws what the run acts on inside the wait, so the spinner levels around it', () => {
        const { container } = renderRunning({ subject: 'Justrite Test Store US' });

        expect(container.querySelector('.modal-wait-progress-subject > .modal-progress-subject')).toHaveTextContent('Justrite Test Store US');
    });

    it('CONTROL: without a subject the wait is the plain one', () => {
        const { container } = renderRunning();

        expect(container.querySelector('.modal-wait-progress')).not.toBeNull();
        expect(container.querySelector('.modal-wait-progress-subject')).toBeNull();
    });
});

// Walk F91: a run that sends its parts as rows (a datapack save) shows the import window's rows.
describe('OperationProgressBody, a run with rows', () => {
    const ROWS: OperationRow[] = [
        { kind: 'categories', label: 'Categories', status: 'success', line: 'Done' },
        { kind: 'products', label: 'Products', status: 'checking', line: 'Reading' },
    ];

    it('shows the rows in place of the one spinner while it runs', () => {
        renderRunning({ progress: { id: 'x', state: 'running', stage: 'Reading from Commerce', step: '0 of 1 data type', rows: ROWS } });

        expect(screen.getByTestId('operation-rows')).toBeInTheDocument();
        expect(screen.getByText('Products')).toBeInTheDocument();
        expect(screen.getByText('Reading')).toBeInTheDocument();
        expect(screen.queryByText('0 of 1 data type')).not.toBeInTheDocument();
    });

    // Review, 2026-11-10: a clean run ends small, its sentence alone, no rows and no "Took …".
    it('ends a clean run small: the sentence, no rows, no Took', () => {
        const ended = ROWS.map((row) => ({ ...row, status: 'success' as const, line: 'Done' }));
        render(<OperationProgressBody failed={false} succeeded onTyped={jest.fn()} successMessage="Saved a new version of My Luma." progress={{ id: 'x', state: 'succeeded', rows: ended, tookMs: 240_000 }} />);

        expect(screen.getByText('Saved a new version of My Luma.')).toBeInTheDocument();
        expect(screen.queryByText('Products')).not.toBeInTheDocument();
        expect(screen.queryByText(/^Took /u)).not.toBeInTheDocument();
    });

    it('CONTROL: a run that ends with a warning keeps its rows', () => {
        const ended = ROWS.map((row) => ({ ...row, status: 'success' as const, line: 'Done' }));
        render(<OperationProgressBody failed={false} succeeded onTyped={jest.fn()} successMessage="Saved, with a gap." progress={{ id: 'x', state: 'succeeded', warning: 'Saved, with a gap.', rows: ended }} />);

        expect(screen.getByText('Products')).toBeInTheDocument();
    });

    it('CONTROL: a run with no rows keeps its one spinner and its line', () => {
        renderRunning({ progress: { id: 'x', state: 'running', stage: 'Reading from Commerce', step: '0 of 1 data type' } });

        expect(screen.queryByTestId('operation-rows')).not.toBeInTheDocument();
        expect(screen.getByText('0 of 1 data type')).toBeInTheDocument();
    });
});
