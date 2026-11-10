/**
 * The armed removal, as the dialog design rules' confirm (owner, 2026-10-31): the question is the
 * dialog's title, naming the store (`viewFrame`, tested with `importModalView`), and the body is
 * one sentence with the warning a word in it. It was the question again, Store and Data rows and a
 * muted "can't be undone" line, which read as machine-made.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { type BodyContext, ImportDatapackModalBody, typesInSentence } from '@/features/data-installer/ui/components/ImportDatapackModalBody';
import type { ImportJobRecord, InstallCheck } from '@/features/data-installer/types';
import type { ImportScopes } from '@/features/data-installer/ui/hooks/useImportScopes';

const NONE_FOUND = { count: 0, examples: [] as string[] };

/** The engine's install check, as the record carries it: nothing found wrong. */
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

const SCOPE: ImportScopes = {
    websites: [
        { code: 'justrite_test_website', name: 'Justrite Test', storeViews: [{ code: 'justrite_test_store_us', name: 'Justrite Test Store US' }] },
    ],
    loading: false,
    websiteCode: 'justrite_test_website',
    storeCode: 'justrite_test_store_us',
    chooseWebsite: jest.fn(),
    chooseStore: jest.fn(),
    targetFields: () => ({ websiteCode: 'justrite_test_website', storeCode: 'justrite_test_store_us' }),
    locked: false,
    lockTo: jest.fn(),
};

function ctx(over: Partial<BodyContext> = {}): BodyContext {
    return {
        displayName: 'ZZ Test Root DB12',
        commerceInstance: 'UoGYsHrcxMyeoVd2zUktZi',
        availableTypes: ['categories'],
        selected: ['categories'],
        changes: { lines: null, failed: false },
        replacement: { confirming: false },
        allSelected: true,
        record: null,
        result: null,
        busyMessage: { label: '' },
        scope: SCOPE,
        removal: { content: { kind: 'plain' }, choice: { always: false }, onToggleAlways: jest.fn(), onSaveAsName: jest.fn() },
        toggle: jest.fn(),
        toggleAll: jest.fn(),
        installing: { name: 'ZZ Test Root DB12', version: '1' },
        columns: 2,
        ...over,
    };
}

describe('a project with no instance', () => {
    it('says what to do, and draws no status icon or heading of its own: the title has them', () => {
        render(<ImportDatapackModalBody view="no-instance" ctx={ctx()} />);

        expect(screen.getByText('Connect a Commerce backend on the project dashboard, then import from here.')).toBeInTheDocument();
        expect(screen.queryByText(/no commerce instance/i)).not.toBeInTheDocument();
    });
});

describe('the removal confirmation', () => {
    it('says what goes in one sentence, the warning a word in it, and no rows', () => {
        render(<ImportDatapackModalBody view="confirm-reset" ctx={ctx()} />);

        expect(screen.getByText('Permanently deletes ZZ Test Root DB12’s categories.')).toBeInTheDocument();
        expect(screen.queryByText('Store')).not.toBeInTheDocument();
        expect(screen.queryByText(/can.t be undone/)).not.toBeInTheDocument();
        expect(screen.queryByText('UoGYsHrcxMyeoVd2zUktZi')).not.toBeInTheDocument();
    });
});

describe('the removal confirmation for a pack Demo Builder installed', () => {
    it('names what its record lists in words, whichever types are ticked', () => {
        render(<ImportDatapackModalBody view="confirm-reset" ctx={ctx({ selected: ['categories'], recordedKinds: ['attribute_sets', 'categories', 'products', 'store_config'] })} />);

        // One consequence per line (dialog design rules), so each is its own element.
        expect(screen.getByText('Permanently deletes what ZZ Test Root DB12 installed: attribute sets, categories and products.')).toBeInTheDocument();
        expect(screen.getByText('Puts back the store settings it changed.')).toBeInTheDocument();
        expect(screen.getByText('Selected data types apply to Import only.')).toBeInTheDocument();
    });

    it('CONTROL: names the ticks when there is no record, as the service removes those', () => {
        render(<ImportDatapackModalBody view="confirm-reset" ctx={ctx({ selected: ['categories'], recordedKinds: null })} />);

        expect(screen.getByText('Permanently deletes ZZ Test Root DB12’s categories.')).toBeInTheDocument();
    });
});

describe('typesInSentence', () => {
    it.each([
        [['Categories'], 'categories'],
        [['Categories', 'Products'], 'categories and products'],
        [['Attribute Sets', 'Categories', 'Products'], 'attribute sets, categories and products'],
    ])('joins %j as a sentence joins them', (labels, sentence) => {
        expect(typesInSentence(labels)).toBe(sentence);
    });

    it('keeps the capitals of a label that starts with an acronym', () => {
        expect(typesInSentence(['B2B Companies', 'ACO catalog'])).toBe('B2B companies and ACO catalog');
    });

    it('names three and counts the rest past seven', () => {
        const eight = ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'].map((code) => `Type ${code}`);
        expect(typesInSentence(eight)).toBe('type A1, type B1, type C1 and 5 more data types');
    });

    it('names all seven when there are seven — control', () => {
        const seven = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((code) => `Kind ${code}`);
        expect(typesInSentence(seven)).toBe('kind A, kind B, kind C, kind D, kind E, kind F and kind G');
    });
});

/** A step's row: the closest work row to its line (a data type's row is its own, nested). */
function stepRow(text: string): HTMLElement | null {
    return screen.getByText(text).closest('.work-row');
}

/** The steps' names, in order: the top-level rows, not the data types nested under Install. */
function stepNames(): (string | null)[] {
    return Array.from(document.querySelectorAll('.import-steps > .work-row > .work-row-text > .checkbox-row-label')).map((el) => el.textContent);
}

describe('the running view', () => {
    const RECORD: ImportJobRecord = {
        activationId: 'a-1',
        datapackName: 'zz-test-root-db12',
        version: '1',
        commerceInstance: 'UoGYsHrcxMyeoVd2zUktZi',
        dataTypes: ['products', 'categories'],
        startedAt: '2026-11-02T00:00:00.000Z',
        outcome: 'watching',
        perType: {},
    };

    // Steps named for what they do (owner, 2026-11-09): a first install is Install and Verify, the
    // data types under Install in the order the engine installs them.
    it('draws a first install as Install and Verify, the data types under Install in install order', () => {
        render(<ImportDatapackModalBody view="watching" ctx={ctx({ record: RECORD })} />);

        expect(stepNames()).toStrictEqual(['Install ZZ Test Root DB12, 1', 'Verify the Import']);
        const types = Array.from(document.querySelectorAll('.work-row--dense .checkbox-row-label')).map((el) => el.textContent);
        expect(types).toStrictEqual(['Categories', 'Products']);
        // Install is in hand from the first frame ("Starting"), Verify waits; a waiting data type says so by its icon alone.
        expect(screen.getAllByText('Waiting')).toHaveLength(1);
        expect(screen.getByText('Starting')).toBeInTheDocument();
        expect(screen.queryByText('Preparing Import')).not.toBeInTheDocument();
        expect(screen.queryByText('Finishing Import')).not.toBeInTheDocument();
    });

    // Preparing Import is gone: reading and comparing are the first lines of the step they serve.
    it('puts the comparison before the first type on Install, in the step’s words', () => {
        render(<ImportDatapackModalBody view="watching" ctx={ctx({ record: { ...RECORD, phase: 'Comparing Commerce with the datapack' } })} />);

        expect(stepRow('Reading from Commerce')).toHaveTextContent('Install ZZ Test Root DB12, 1');
    });

    // Only the type in progress has a second line, under its name, the word first (walk F133).
    it('shows the type in progress with a second line, and Install how many are in', () => {
        const record: ImportJobRecord = { ...RECORD, perType: { categories: 'success', products: 'processing' }, detail: '450 of 2,046 products' };
        render(<ImportDatapackModalBody view="watching" ctx={ctx({ record })} />);

        const doing = screen.getByText('Installing 450 of 2,046');
        expect(doing).toHaveClass('work-row-doing');
        expect(doing.closest('.work-row')).toHaveClass('work-row--dense');
        // The name line carries no count: the label is the name alone.
        expect(doing.closest('.work-row')?.querySelector('.checkbox-row-label')).toHaveTextContent(/^Products$/u);
        expect(screen.queryByText('Done')).not.toBeInTheDocument();
        expect(stepRow('1 of 2 data types')).toHaveTextContent('Install ZZ Test Root DB12, 1');
    });

    it('says Linking product options on the Products row during the slow part, Install a plain count', () => {
        const record: ImportJobRecord = { ...RECORD, perType: { categories: 'success', products: 'processing' }, detail: '2,044 of 2,046 products, linking product options' };
        render(<ImportDatapackModalBody view="watching" ctx={ctx({ record })} />);

        expect(screen.getByText('Linking product options 2,044 of 2,046').closest('.work-row')).toHaveTextContent('Products');
        expect(stepRow('1 of 2 data types')).toHaveTextContent('Install ZZ Test Root DB12, 1');
    });

    // The window never changes height on its own (walk F133): every column holds room for the
    // second line, and the column with the working row has it in the row instead.
    it('holds room for the second line in every column, the working row’s column filling it', () => {
        const dataTypes = ['attribute_sets', 'categories', 'products', 'customers'];
        const waiting: ImportJobRecord = { ...RECORD, dataTypes };
        const { unmount } = render(<ImportDatapackModalBody view="watching" ctx={ctx({ record: waiting })} />);
        const heldBefore = Array.from(document.querySelectorAll('.work-row-column')).map((c) => c.className);
        expect(heldBefore).toStrictEqual(['work-row-column', 'work-row-column']);
        unmount();

        const working: ImportJobRecord = { ...RECORD, dataTypes, perType: { attribute_sets: 'success', categories: 'success', products: 'processing' }, detail: '1,200 of 2,046 products' };
        render(<ImportDatapackModalBody view="watching" ctx={ctx({ record: working })} />);
        const columns = Array.from(document.querySelectorAll('.work-row-column'));
        expect(columns.map((c) => c.className)).toStrictEqual(['work-row-column', 'work-row-column work-row-column--working']);
        expect(columns[1]).toHaveTextContent('Installing 1,200 of 2,046');
        // Done and waiting rows have no second line.
        expect(document.querySelectorAll('.work-row-doing')).toHaveLength(1);
    });

    it('draws the data types in one column when the window chose one', () => {
        const record: ImportJobRecord = { ...RECORD, dataTypes: ['attribute_sets', 'categories', 'products', 'customers'] };
        render(<ImportDatapackModalBody view="watching" ctx={ctx({ record, columns: 1 })} />);

        expect(document.querySelectorAll('.work-row-column')).toHaveLength(1);
    });

    it('shows the steps while the import starts, before its job is recorded, and the clock’s line at once', () => {
        render(<ImportDatapackModalBody view="starting" ctx={ctx({ selected: ['products', 'categories'] })} />);

        expect(stepNames()).toStrictEqual(['Install ZZ Test Root DB12, 1', 'Verify the Import']);
        // The window keeps one height from the first frame (walk F116): the clock's line is there.
        expect(document.querySelector('.import-run-foot .dialog-note')).toBeInTheDocument();
    });

    // An import over the demo's pack saves first, then removes, then installs (walk F97, F105).
    it('starts a replace with its save spinning first, then Remove, Install and Verify waiting', () => {
        const replacement = { name: 'Bodea, main', confirming: false, savingStage: 'Saving to the library' };
        render(<ImportDatapackModalBody view="starting" ctx={ctx({ replacement })} />);

        expect(stepNames()).toStrictEqual(['Save Your Changes', 'Uninstall the Previous Datapack', 'Install ZZ Test Root DB12, 1', 'Verify the Import']);
        expect(screen.getByRole('progressbar').closest('.work-row')).toHaveTextContent('Save Your Changes');
        expect(stepRow('Saving to the library')).toHaveTextContent('Save Your Changes');
    });

    it('CONTROL: a removal still waits on its spinner', () => {
        render(<ImportDatapackModalBody view="watching" ctx={ctx({ record: { ...RECORD, operation: 'reset' } })} />);

        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(screen.queryByText('Waiting')).not.toBeInTheDocument();
    });
});

describe('an import’s ending, on its steps', () => {
    const RUN: ImportJobRecord = {
        activationId: 'a-1',
        datapackName: 'luma',
        version: '1',
        commerceInstance: 'UoGYsHrcxMyeoVd2zUktZi',
        dataTypes: ['categories', 'products', 'source_items'],
        startedAt: '2026-11-02T00:00:00.000Z',
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

    it('says where Install stopped, keeps the reason on the type, and leaves Verify not run', () => {
        const result = { variant: 'error' as const, title: 'Import Stopped', run: RUN, tookMs: 182_000 };
        render(<ImportDatapackModalBody view="result" ctx={ctx({ result })} />);

        // The reason once, on the data type; Install's own line says only Stopped (review, 2026-11-10).
        const stopped = screen.getByText('Stopped');
        expect(stopped.closest('.work-row')).toHaveTextContent('Install ZZ Test Root DB12, 1');
        expect(screen.getAllByText('Commerce did not respond.')).toHaveLength(1);
        const reason = screen.getByText('Commerce did not respond.');
        expect(reason).toHaveClass('dialog-problem', 'text-negative');
        expect(reason.closest('.work-row')).toHaveClass('work-row--dense');
        expect(reason.closest('.work-row')).toHaveTextContent('Products');
        expect(stepRow('Not run')).toHaveTextContent('Verify the Import');
        expect(screen.getByText('Took 3 minutes, 2 seconds')).toBeInTheDocument();
    });

    it('puts a problem that did not stop it on its type, orange, and the sentence under the steps', () => {
        const run: ImportJobRecord = { ...ALL_IN, rowNotes: { products: 'Commerce refused 3.' }, scLines: ['Kept 2 things you had changed in the Admin.'] };
        const result = { variant: 'warning' as const, title: 'ZZ Test Root DB12 Imported', run, lead: 'Luma is in Justrite Test Store.' };
        render(<ImportDatapackModalBody view="result" ctx={ctx({ result })} />);

        expect(screen.getByText('Commerce refused 3.')).toHaveClass('dialog-problem', 'text-notice');
        expect(stepRow('Installed')).toHaveTextContent('Install ZZ Test Root DB12, 1');
        // No check on the record: Verify ends on Done.
        expect(stepRow('Done')).toHaveTextContent('Verify the Import');
        expect(screen.getByText('Luma is in Justrite Test Store.')).toBeInTheDocument();
        expect(screen.getByText('Kept 2 things you had changed in the Admin.')).toBeInTheDocument();
    });

    it('ends Verify on what the check found when the record has one', () => {
        const run: ImportJobRecord = { ...ALL_IN, check: CHECK };
        render(<ImportDatapackModalBody view="result" ctx={ctx({ result: { variant: 'warning', title: 'ZZ Test Root DB12 Imported', run } })} />);

        expect(stepRow('Checked 2,046 products against the datapack: all match')).toHaveTextContent('Verify the Import');
    });

    it('puts the reason on Install when it stopped before any data type and nothing was replaced', () => {
        const run: ImportJobRecord = { ...RUN, perType: { categories: 'error', products: 'error', source_items: 'error' }, stoppedAt: undefined, reason: 'Choose the website and store view to install into first.' };
        render(<ImportDatapackModalBody view="result" ctx={ctx({ result: { variant: 'error', title: 'Import Stopped', run } })} />);

        const reason = screen.getByText('Choose the website and store view to install into first.');
        expect(reason).toHaveClass('dialog-problem', 'text-negative');
        expect(reason.closest('.work-row')).toHaveTextContent('Install ZZ Test Root DB12, 1');
        expect(stepRow('Not run')).toHaveTextContent('Verify the Import');
    });
});
