/**
 * The run window's steps (step 03, S4 and S7), drawn from what it is handed: an install's while it
 * starts, while it runs and once it ended with a problem; an uninstall's, Save Your Changes when it
 * saves first, then Uninstall <name>. The window draws its tallest states hidden (`reserve`), so
 * every query here reads the step on screen, not the ghosts.
 *
 * Ported from `ImportDatapackModalBody-confirm.test.tsx` ("the running view", "an import's ending,
 * on its steps"), whose cases drew the same steps through the old window's body; its CONTROL that a
 * removal waits on a spinner is now the opposite (decisions J5-2: Uninstall is drawn as steps).
 */

import { mockPostMessage } from '../../../../../helpers/webviewClientMock';
import React from 'react';
import { render, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ImportJobRecord, InstallCheck } from '@/features/data-installer/types';
import type { ResultContent } from '@/features/data-installer/ui/components/importResult';
import {
    DatapackRunWindow,
    type DatapackRunWindowProps,
} from '@/features/data-installer/ui/components/job/DatapackRunWindow';

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
        '.modal-steps > div:not(.modal-steps-ghost):not(.modal-steps-pending)'
    );
    if (!shown) throw new Error('no step on screen');
    return within(shown as HTMLElement);
}

type Shown = ReturnType<typeof renderRun>;
const rowOf = (shown: Shown, text: string) => shown.getByText(text).closest('.work-row');
const stepNames = (shown: Shown) =>
    Array.from(
        (shown.getByTestId('import-run') as HTMLElement).querySelectorAll(
            '.import-steps > .work-row > .work-row-text > .checkbox-row-label'
        )
    ).map((el) => el.textContent);

beforeEach(() => mockPostMessage.mockClear());

describe('an install while it runs', () => {
    it('draws a first install as Install and Verify, the data types under Install in install order', () => {
        const shown = renderRun({ record: RECORD });

        expect(stepNames(shown)).toStrictEqual([
            'Install ZZ Test Root DB12, 1',
            'Verify Installation',
        ]);
        const types = Array.from(
            document.querySelectorAll(
                '.modal-steps > div:not(.modal-steps-ghost) .work-row--dense .checkbox-row-label'
            )
        ).map((el) => el.textContent);
        expect(types).toStrictEqual(['Categories', 'Products']);
        expect(shown.getAllByText('Waiting')).toHaveLength(1);
        expect(shown.getByText('Starting')).toBeInTheDocument();
    });

    it('puts the comparison before the first type on Install, in the step’s words', () => {
        const shown = renderRun({
            record: { ...RECORD, phase: 'Comparing Commerce with the datapack' },
        });

        expect(rowOf(shown, 'Reading from Commerce')).toHaveTextContent(
            'Install ZZ Test Root DB12, 1'
        );
    });

    it('shows the type in progress with a second line, and Install how many are in', () => {
        const record: ImportJobRecord = {
            ...RECORD,
            perType: { categories: 'success', products: 'processing' },
            detail: '450 of 2,046 products',
        };
        const shown = renderRun({ record });

        const doing = shown.getByText('Installing 450 of 2,046');
        expect(doing).toHaveClass('work-row-doing');
        expect(doing.closest('.work-row')?.querySelector('.checkbox-row-label')).toHaveTextContent(
            /^Products$/u
        );
        expect(rowOf(shown, '1 of 2 data types')).toHaveTextContent('Install ZZ Test Root DB12, 1');
    });

    it('says Linking product options on the Products row during the slow part', () => {
        const record: ImportJobRecord = {
            ...RECORD,
            perType: { categories: 'success', products: 'processing' },
            detail: '2,044 of 2,046 products, linking product options',
        };
        const shown = renderRun({ record });

        expect(rowOf(shown, 'Linking product options 2,044 of 2,046')).toHaveTextContent(
            'Products'
        );
    });

    // The window never changes height on its own (walk F133): every column holds room for the second
    // line, and the column with the working row has it in the row instead.
    it('holds room for the second line in every column, the working row’s column filling it', () => {
        const dataTypes = ['attribute_sets', 'categories', 'products', 'customers'];
        const working: ImportJobRecord = { ...RECORD, dataTypes, perType: { attribute_sets: 'success', categories: 'success', products: 'processing' }, detail: '1,200 of 2,046 products' };
        const shown = renderRun({ record: working });

        const columns = Array.from((shown.getByTestId('import-run') as HTMLElement).querySelectorAll('.work-row-column'));
        expect(columns.map((c) => c.className)).toStrictEqual(['work-row-column', 'work-row-column work-row-column--working']);
        expect(columns[1]).toHaveTextContent('Installing 1,200 of 2,046');
    });

    it('draws the data types in one column when the window chose one', () => {
        const record: ImportJobRecord = {
            ...RECORD,
            dataTypes: ['attribute_sets', 'categories', 'products', 'customers'],
        };
        const shown = renderRun({ record, columns: 1 });

        expect(
            (shown.getByTestId('import-run') as HTMLElement).querySelectorAll('.work-row-column')
        ).toHaveLength(1);
    });

    it('shows the steps while the import starts, before its job is recorded, and the clock’s line at once', () => {
        const shown = renderRun();

        expect(stepNames(shown)).toStrictEqual([
            'Install ZZ Test Root DB12, 1',
            'Verify Installation',
        ]);
        expect(
            (shown.getByTestId('import-run') as HTMLElement).parentElement?.querySelector(
                '.dialog-note'
            )
        ).not.toBeNull();
    });

    it('starts a switch with its save spinning first, then Uninstall, Install and Verify waiting', () => {
        const shown = renderRun({
            switching: { replaces: 'Bodea, main', savingStage: 'Saving to the library' },
        });

        expect(stepNames(shown)).toStrictEqual([
            'Save Your Changes',
            'Uninstall Bodea, main',
            'Install ZZ Test Root DB12, 1',
            'Verify Installation',
        ]);
        expect(rowOf(shown, 'Saving to the library')).toHaveTextContent('Save Your Changes');
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
        reason: 'Commerce did not respond.',
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
        const reason = shown.getByText('Commerce did not respond.');
        expect(reason).toHaveClass('dialog-problem', 'text-negative');
        expect(reason.closest('.work-row')).toHaveTextContent('Products');
        expect(rowOf(shown, 'Not run')).toHaveTextContent('Verify Installation');
        expect(shown.getByText('Took 3 minutes, 2 seconds')).toBeInTheDocument();
    });

    it('puts a problem that did not stop it on its type, orange, and the sentence under the steps', () => {
        const run: ImportJobRecord = {
            ...ALL_IN,
            rowNotes: { products: 'Commerce refused 3 rows.' },
            scLines: ['Kept 2 things you had changed in the Admin.'],
        };
        const shown = ended({
            variant: 'warning',
            title: 'Luma Installed',
            run,
            lead: 'Luma is in Justrite Test Store.',
        });

        expect(shown.getByText('Commerce refused 3 rows.')).toHaveClass(
            'dialog-problem',
            'text-notice'
        );
        expect(rowOf(shown, 'Installed')).toHaveTextContent('Install ZZ Test Root DB12, 1');
        expect(rowOf(shown, 'Done')).toHaveTextContent('Verify Installation');
        expect(shown.getByText('Luma is in Justrite Test Store.')).toBeInTheDocument();
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

    it('starts as one step, Uninstall My Luma, working from the first frame', () => {
        const shown = renderRun({ ...UNINSTALL, uninstalling: { saves: false } });

        expect(stepNames(shown)).toStrictEqual(['Uninstall My Luma']);
        expect(rowOf(shown, 'Uninstalling from Commerce')).toHaveTextContent('Uninstall My Luma');
    });

    it('saving first, draws Save Your Changes on its stage, then the uninstall waiting', () => {
        const shown = renderRun({
            ...UNINSTALL,
            uninstalling: { saves: true, savingStage: 'Reading Commerce' },
        });

        expect(stepNames(shown)).toStrictEqual(['Save Your Changes', 'Uninstall My Luma']);
        expect(rowOf(shown, 'Reading Commerce')).toHaveTextContent('Save Your Changes');
        expect(rowOf(shown, 'Waiting')).toHaveTextContent('Uninstall My Luma');
    });

    it('while its job runs, says where the save went and how far the uninstall has got', () => {
        const shown = renderRun({
            ...UNINSTALL,
            record: { ...RUNNING, detail: '12 of 40 products' },
            uninstalling: { saves: true, savedTo: 'My Luma' },
        });

        expect(rowOf(shown, 'Saved to My Luma')).toHaveTextContent('Save Your Changes');
        expect(rowOf(shown, 'Uninstalling 12 of 40')).toHaveTextContent('Uninstall My Luma');
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
