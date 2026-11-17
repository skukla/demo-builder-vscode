/**
 * The run window (step 03, S4 and S7), drawn from what it is handed: while an install or an
 * uninstall starts and runs, the centred lines (what it is doing now and how far, owner 2026-11-16);
 * once it ended with a problem, its steps as rows. The window draws its tallest states hidden
 * (`reserve`), so every query here reads the step on screen, not the ghosts.
 *
 * Ported from `ImportDatapackModalBody-confirm.test.tsx` ("the running view", "an import's ending,
 * on its steps"), whose cases drew the same steps through the old window's body; its CONTROL that a
 * removal waits on a spinner is now the opposite (decisions J5-2: Uninstall is drawn as steps).
 */

import { mockPostMessage } from '../../../../../helpers/webviewClientMock';
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ImportJobRecord, InstallCheck } from '@/features/data-installer/types';
import type { ResultContent } from '@/features/data-installer/ui/components/importResult';
import {
    DatapackRunWindow,
    type DatapackRunWindowProps,
} from '@/features/data-installer/ui/components/job/DatapackRunWindow';
import { plain } from '@/features/data-installer/plainFailure';

const NONE_FOUND = { count: 0, examples: [] as string[] };
const CHECK: InstallCheck = {
    verdict: 'matches',
    checked: 2046,
    compared: { values: 120, prices: 40, configurables: 6 },
    missing: NONE_FOUND,
    configurablesWithoutOptions: NONE_FOUND,
    configurablesDiffer: { count: 0, examples: [] },
    valuesDiffer: { count: 0, examples: [] },
    pricesDiffer: { count: 0, examples: [] },
};

const RECORD: ImportJobRecord = {
    activationId: 'a-1',
    datapackName: 'zz-test-root-db12',
    version: '1',
    commerceInstance: 'inst',
    dataTypes: ['products', 'categories'],
    startedAt: '2026-11-02T00:00:00.000Z',
    outcome: 'watching',
    perType: {},
};

function renderRun(over: Partial<DatapackRunWindowProps> = {}) {
    render(
        <DatapackRunWindow
            title="Installing ZZ Test Root DB12"
            record={null}
            ended={null}
            types={['products', 'categories']}
            installing={{ name: 'ZZ Test Root DB12', version: '1' }}
            columns={2}
            opensRunning={false}
            actionButtons={[]}
            onClose={jest.fn()}
            {...over}
        />
    );
    const shown = document.querySelector(
        '.modal-steps > div:not(.modal-steps-ghost)'
    );
    if (!shown) throw new Error('no step on screen');
    return within(shown as HTMLElement);
}

type Shown = ReturnType<typeof renderRun>;
const rowOf = (shown: Shown, text: string) => shown.getByText(text).closest('.work-row');
beforeEach(() => mockPostMessage.mockClear());

// Owner, 2026-11-16: one project's run is the wizard's centred view while it runs, what it is doing
// now and how far, moving from step to step (`runStage`); rows are for a run over several projects.
describe('an install while it runs', () => {
    it('starts a first install on the centred lines, not a list of steps', () => {
        const shown = renderRun({ record: RECORD });

        expect(shown.queryByTestId('import-run')).toBeNull();
        expect(shown.getByText('Preparing to install')).toBeInTheDocument();
    });

    it('says the comparison before the first type, in the step’s words', () => {
        const shown = renderRun({
            record: { ...RECORD, phase: 'Comparing Commerce with the datapack' },
        });

        expect(shown.getByText('Reading from Commerce')).toBeInTheDocument();
    });

    it('names the type in progress and says how far it has got', () => {
        const record: ImportJobRecord = {
            ...RECORD,
            perType: { categories: 'success', products: 'processing' },
            detail: '450 of 2,046 products',
        };
        const shown = renderRun({ record });

        // Line 1 the job, line 2 the type and its count (owner, 2026-11-16).
        expect(shown.getByText('Installing in Commerce')).toBeInTheDocument();
        expect(shown.getByText('Products, 450 of 2,046')).toBeInTheDocument();
    });

    it('says Linking product options during the slow part of Products, with its count', () => {
        const record: ImportJobRecord = {
            ...RECORD,
            perType: { categories: 'success', products: 'processing' },
            detail: '2,044 of 2,046 products, linking product options',
        };
        const shown = renderRun({ record });

        expect(shown.getByText('Installing in Commerce')).toBeInTheDocument();
        expect(shown.getByText('Products: linking product options, 2,044 of 2,046')).toBeInTheDocument();
    });

    it('shows Starting while the import starts, before its job is recorded, and the clock once a second is up', () => {
        const shown = renderRun();

        expect(shown.queryByTestId('import-run')).toBeNull();
        expect(shown.getByText('Preparing to install')).toBeInTheDocument();
        act(() => {
            jest.advanceTimersByTime(1000);
        });
        expect(shown.getByText('1 second')).toBeInTheDocument();
    });

    it('starts a switch on its save’s stage', () => {
        const shown = renderRun({
            switching: { replaces: 'Bodea, main', savingStage: 'Saving to the library' },
        });

        expect(shown.queryByTestId('import-run')).toBeNull();
        expect(shown.getByText('Saving Your Changes')).toBeInTheDocument();
        expect(shown.getByText('Saving to the library')).toBeInTheDocument();
    });
});

describe('an install that ended with a problem, on its steps', () => {
    const RUN: ImportJobRecord = {
        ...RECORD,
        datapackName: 'luma',
        dataTypes: ['categories', 'products', 'source_items'],
        outcome: 'partial',
        perType: { categories: 'success', products: 'error', source_items: 'error' },
        stoppedAt: 'products',
        // The record keeps Commerce's words for agents; the row says it plainly (walk F221).
        reason: 'Commerce did not respond to V1/products: timed out',
    };
    const ALL_IN: ImportJobRecord = {
        ...RUN,
        outcome: 'success',
        perType: { categories: 'success', products: 'success', source_items: 'success' },
        stoppedAt: undefined,
        reason: undefined,
    };
    const ended = (result: ResultContent) => renderRun({ ended: result, types: RUN.dataTypes });

    it('says where Install stopped, keeps the reason on the type, and leaves Verify not run', () => {
        const shown = ended({
            variant: 'error',
            title: "Couldn't Install Luma",
            run: RUN,
            tookMs: 182_000,
        });

        expect(rowOf(shown, 'Stopped')).toHaveTextContent('Install ZZ Test Root DB12, 1');
        const reason = shown.getByText('Commerce stopped answering while products were installing.');
        expect(reason).toHaveClass('dialog-problem', 'text-negative');
        expect(reason.closest('.work-row')).toHaveTextContent('Products');
        expect(rowOf(shown, 'Not run')).toHaveTextContent('Verify Installation');
        expect(shown.getByText('Took 3 minutes, 2 seconds')).toBeInTheDocument();
    });

    it('puts a problem that did not stop it on its type, orange, and the sentence under the steps', () => {
        const run: ImportJobRecord = {
            ...ALL_IN,
            rowNotes: { products: plain('Commerce refused 3 rows.') },
            scLines: [plain('Kept 2 things you had changed in the Admin.')],
        };
        const shown = ended({
            variant: 'warning',
            title: 'Luma Installed',
            run,
            lead: plain('Luma is in Tailspin Test Store.'),
        });

        expect(shown.getByText('Commerce refused 3 rows.')).toHaveClass(
            'dialog-problem',
            'text-notice'
        );
        expect(rowOf(shown, 'Installed')).toHaveTextContent('Install ZZ Test Root DB12, 1');
        expect(rowOf(shown, 'Done')).toHaveTextContent('Verify Installation');
        expect(shown.getByText('Luma is in Tailspin Test Store.')).toBeInTheDocument();
        expect(shown.getByText('Kept 2 things you had changed in the Admin.')).toBeInTheDocument();
    });

    it('ends Verify on what the check found when the record has one', () => {
        const shown = ended({
            variant: 'warning',
            title: 'Luma Installed',
            run: { ...ALL_IN, check: CHECK },
        });

        expect(rowOf(shown, '2,046 products match the datapack')).toHaveTextContent(
            'Verify Installation'
        );
    });

    it('puts the reason on Install when it stopped before any data type and nothing was replaced', () => {
        const run: ImportJobRecord = {
            ...RUN,
            perType: { categories: 'error', products: 'error', source_items: 'error' },
            stoppedAt: undefined,
            reason: 'Choose the website and store view to install into first.',
        };
        const shown = ended({ variant: 'error', title: "Couldn't Install Luma", run });

        const reason = shown.getByText('Choose the website and store view to install into first.');
        expect(reason.closest('.work-row')).toHaveTextContent('Install ZZ Test Root DB12, 1');
        expect(rowOf(shown, 'Not run')).toHaveTextContent('Verify Installation');
    });
});

// Step 03, S7 (decisions J5-2): an uninstall is drawn as steps, never a spinner.
describe('an uninstall', () => {
    const UNINSTALL = {
        title: 'Uninstalling My Luma',
        installing: { name: 'My Luma', version: 'v1' },
    };
    const RUNNING: ImportJobRecord = {
        ...RECORD,
        datapackName: 'luma',
        version: 'v1',
        operation: 'reset',
        purpose: 'uninstall',
    };

    // Walk F152 (owner, 2026-11-16): a run of one step shows the centred lines, not a list of one.
    it('with nothing to save, is one step: the centred lines, working from the first frame, no list', () => {
        const shown = renderRun({ ...UNINSTALL, uninstalling: { saves: false } });

        expect(shown.queryByTestId('import-run')).toBeNull();
        expect(shown.getByText('Preparing to uninstall')).toBeInTheDocument();
    });

    it('saving first, says the save’s stage', () => {
        const shown = renderRun({
            ...UNINSTALL,
            uninstalling: { saves: true, savingStage: 'Reading Commerce' },
        });

        expect(shown.queryByTestId('import-run')).toBeNull();
        expect(shown.getByText('Reading Commerce')).toBeInTheDocument();
    });

    it('while its job runs, says how far the uninstall has got', () => {
        const shown = renderRun({
            ...UNINSTALL,
            record: { ...RUNNING, detail: '12 of 40 products' },
            uninstalling: { saves: true, savedTo: 'My Luma' },
        });

        expect(shown.getByText('Uninstalling from Commerce')).toBeInTheDocument();
        expect(shown.getByText('Products, 12 of 40')).toBeInTheDocument();
        expect(shown.queryByText(/^Install /u)).toBeNull();
    });

    it('ended with a problem, puts the reason on its row and the clock under it', () => {
        const run: ImportJobRecord = {
            ...RUNNING,
            outcome: 'error',
            reason: 'Commerce refused the category Gear.',
        };
        const shown = renderRun({
            ...UNINSTALL,
            title: "Couldn't Uninstall My Luma",
            ended: {
                variant: 'error',
                title: "Couldn't Uninstall My Luma",
                run,
                action: 'retry',
                tookMs: 61_000,
            },
            uninstalling: { saves: false },
        });

        expect(
            shown.getByText('Commerce refused the category Gear.').closest('.work-row')
        ).toHaveTextContent('Uninstall My Luma');
        expect(shown.getByText('Took 1 minute, 1 second')).toBeInTheDocument();
    });
});

// Walk F150 (2026-11-16): the one Admin step a pack can leave was asked in an untitled notification
// in the corner mid-install. It takes the run window over, as the house progress window's do.
describe('a question the run is paused on', () => {
    const QUESTION = {
        title: "One Step in the Admin to Show Frescopa's Categories",
        message: 'In Stores > All Stores > Tailspin Test Store, set Root Category to Frescopa, then Save Store.',
        actions: ['Open Admin', "I've Done It", 'Skip for Now'],
    };

    function renderAsked() {
        const answer = jest.fn();
        const onClose = jest.fn();
        render(
            <DatapackRunWindow
                title="Switching to Frescopa"
                record={RECORD}
                ended={null}
                types={['products', 'categories']}
                installing={{ name: 'Frescopa', version: 'main' }}
                columns={2}
                opensRunning={false}
                actionButtons={[]}
                onClose={onClose}
                question={{ prompt: QUESTION, answer }}
            />
        );
        return { answer, onClose };
    }

    it('takes the title, says the step, and offers each answer, the one that carries on last', () => {
        renderAsked();

        expect(screen.getByRole('heading', { name: QUESTION.title })).toBeInTheDocument();
        expect(screen.getByText(QUESTION.message)).toBeInTheDocument();
        const labels = screen.getAllByRole('button').map((b) => b.textContent);
        expect(labels).toEqual(expect.arrayContaining(['Cancel', 'Skip for Now', "I've Done It", 'Open Admin']));
        expect(labels.indexOf('Open Admin')).toBeGreaterThan(labels.indexOf('Skip for Now'));
        // A question with no tone is a problem to answer: the warning by its title (the control for the routine case).
        expect(document.querySelector('.modal-status-icon')).not.toBeNull();
    });

    it('hands the answer chosen back to the run', () => {
        const { answer, onClose } = renderAsked();

        fireEvent.click(screen.getByRole('button', { name: "I've Done It" }));

        expect(answer).toHaveBeenCalledWith("I've Done It");
        expect(onClose).not.toHaveBeenCalled();
    });

    it('answers it dismissed when closed, then closes', () => {
        const { answer, onClose } = renderAsked();

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(answer).toHaveBeenCalledWith(undefined);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    // Owner walk, 2026-11-16: Skip for Now drew beside Cancel, two buttons that both dismiss (rule of
    // 2026-10-30), under a warning icon for a routine step.
    it('a question with a dismiss answer makes it the close button, once, with no warning icon for a routine step', () => {
        const answer = jest.fn();
        const onClose = jest.fn();
        render(
            <DatapackRunWindow
                title="Installing Frescopa"
                record={RECORD}
                ended={null}
                types={['categories']}
                installing={{ name: 'Frescopa', version: 'main' }}
                columns={1}
                opensRunning={false}
                actionButtons={[]}
                onClose={onClose}
                question={{ prompt: { ...QUESTION, tone: 'info', dismiss: 'Skip for Now' }, answer }}
            />
        );

        const labels = screen.getAllByRole('button').map((b) => b.textContent);
        expect(labels.filter((l) => l === 'Skip for Now')).toHaveLength(1);
        expect(labels).not.toContain('Cancel');
        expect(document.querySelector('.modal-status-icon')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Skip for Now' }));
        expect(answer).toHaveBeenCalledWith('Skip for Now');
        // An answer, not a close: the run goes on in the window to its result.
        expect(onClose).not.toHaveBeenCalled();
    });
});

