/**
 * The progress window while it runs: the room for three lines is kept, and what is there sits
 * level, so nothing blank rides under the spinner (measured in a browser, 42 above and 73 below
 * on "Starting", before row 3 stopped being a blank). A browser measures the levelling; this pins
 * the markup it depends on, over the real LoadingDisplay.
 */

import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';
import React from 'react';
import { OperationProgressBody, keepsRows } from '@/core/ui/components/feedback/OperationProgressBody';
import type { OperationRow } from '@/types/webviewPayloads';
import { SAVE_WRITING } from '../../../../helpers/operationRowFixtures';

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

    // Plan step-03 S1: the save's rule looked only at `warning`, so a row's problem with no
    // warning ended small and hid the problem.
    it('keeps the rows of a run that ends with a problem on one row and no warning', () => {
        const ended: OperationRow[] = [
            { kind: 'categories', label: 'Categories', status: 'success', line: 'Done' },
            { kind: 'products', label: 'Products', status: 'warning', problem: { text: '3 products had no price', failed: false } },
        ];
        render(<OperationProgressBody failed={false} succeeded onTyped={jest.fn()} successMessage="Saved a new version of My Luma." progress={{ id: 'x', state: 'succeeded', rows: ended, tookMs: 240_000 }} />);

        expect(screen.getByText('Products')).toBeInTheDocument();
        expect(screen.getByText('Took 4 minutes')).toBeInTheDocument();
    });

    // Decisions Phase 1b (J1-3d growth, owner 2026-11-11): one height from first frame to last. The
    // closing sentence under the rows repeated the row's problem and grew the window; it is gone,
    // and the problem sits on its row, in the room the row's line held.
    it('ends with a row carrying its problem and no closing sentence under the rows', () => {
        const ended: OperationRow[] = [
            { kind: 'products', label: 'Products', status: 'success', line: 'Done' },
            { kind: 'settings', label: 'Website Settings', status: 'warning', problem: { text: '1 list setting needs resetting in the Commerce Admin.', failed: false } },
        ];
        const { container } = render(
            <OperationProgressBody failed={false} succeeded onTyped={jest.fn()} successMessage="Some of it needs the Commerce Admin. Cleared My Luma." progress={{ id: 'x', state: 'succeeded', warning: 'Some of it needs the Commerce Admin.', rows: ended, tookMs: 240_000 }} />,
        );

        expect(screen.queryByText('Some of it needs the Commerce Admin. Cleared My Luma.')).not.toBeInTheDocument();
        expect(container.querySelector('.lead-text')).toBeNull();
        expect(screen.getByText('1 list setting needs resetting in the Commerce Admin.')).toHaveClass('work-row-problem');
        expect(screen.getByText('Took 4 minutes')).toBeInTheDocument();
    });

    it('CONTROL: a warning no row carries still says itself under the rows', () => {
        const ended = ROWS.map((row) => ({ ...row, status: 'success' as const, line: 'Done' }));
        render(<OperationProgressBody failed={false} succeeded onTyped={jest.fn()} successMessage="Saved, with a gap." progress={{ id: 'x', state: 'succeeded', warning: 'Saved, with a gap.', rows: ended }} />);

        expect(screen.getByText('Saved, with a gap.')).toBeInTheDocument();
    });

    it('CONTROL: a run with no rows keeps its one spinner and its line', () => {
        renderRunning({ progress: { id: 'x', state: 'running', stage: 'Reading from Commerce', step: '0 of 1 data type' } });

        expect(screen.queryByTestId('operation-rows')).not.toBeInTheDocument();
        expect(screen.getByText('0 of 1 data type')).toBeInTheDocument();
    });
});

// Phase 7b (decisions.md): the save is two steps, the data types nested under Export from Commerce,
// drawn as the import's window draws its steps (`StepRows`).
describe('OperationProgressBody, a run whose rows are steps with rows under them', () => {
    it('draws each step with its nested rows under it while it runs', () => {
        const { container } = renderRunning({ progress: { id: 'x', state: 'running', rows: SAVE_WRITING } });

        expect(screen.getByText('Export from Commerce')).toBeInTheDocument();
        expect(screen.getByText('Save My Luma')).toBeInTheDocument();
        expect(screen.getByText('Saving to My Datapacks')).toBeInTheDocument();
        expect(container.querySelector('.step-rows-nested')?.textContent).toContain('Categories');
        expect(container.querySelector('[data-testid="operation-rows"] > .work-row-columns')).toBeNull();
    });

    // Decisions Phase 1b (J1-3d growth): the reason was a sentence under the steps, a line nothing
    // held. It takes the stopped step's line instead, once, red.
    it('ends a failed run on its steps, the reason on the stopped step in place of its line', () => {
        const stopped: OperationRow[] = [SAVE_WRITING[0] as OperationRow, { kind: 'save', label: 'Save My Luma', status: 'error', line: 'Stopped' }];
        const { container } = render(<OperationProgressBody failed succeeded={false} onTyped={jest.fn()} progress={{ id: 'x', state: 'failed', error: 'My Luma could not be saved.', rows: stopped }} />);

        expect(screen.queryByText('Stopped')).not.toBeInTheDocument();
        expect(screen.getAllByText('My Luma could not be saved.')).toHaveLength(1);
        expect(screen.getByText('My Luma could not be saved.')).toHaveClass('work-row-problem', 'text-negative');
        expect(container.querySelector('.lead-text')).toBeNull();
    });

    it('CONTROL: a failure a row already says is not said again', () => {
        const stopped: OperationRow[] = [{ kind: 'save', label: 'Save My Luma', status: 'error', problem: { text: 'Commerce refused.', failed: true } }];
        render(<OperationProgressBody failed succeeded={false} onTyped={jest.fn()} progress={{ id: 'x', state: 'failed', error: 'My Luma could not be saved.', rows: stopped }} />);

        expect(screen.getByText('Commerce refused.')).toBeInTheDocument();
        expect(screen.queryByText('My Luma could not be saved.')).not.toBeInTheDocument();
    });

    it('keeps the rows of a run that succeeded with a problem on a nested row', () => {
        const [exported, save] = SAVE_WRITING as [OperationRow, OperationRow];
        const ended: OperationRow[] = [
            { ...exported, types: [{ kind: 'products', label: 'Products', status: 'warning', problem: { text: '3 products had no price', failed: false } }] },
            { ...save, status: 'success', line: 'Saved' },
        ];

        expect(keepsRows({ id: 'x', state: 'succeeded', rows: ended })).toBe(true);
    });

    it('CONTROL: a clean run of steps still ends small', () => {
        const [exported, save] = SAVE_WRITING as [OperationRow, OperationRow];

        expect(keepsRows({ id: 'x', state: 'succeeded', rows: [exported, { ...save, status: 'success', line: 'Saved' }] })).toBe(false);
    });
});
