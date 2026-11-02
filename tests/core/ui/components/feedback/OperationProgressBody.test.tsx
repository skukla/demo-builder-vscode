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
