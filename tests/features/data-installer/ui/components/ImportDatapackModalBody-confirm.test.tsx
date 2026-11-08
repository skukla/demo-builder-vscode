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
import type { ImportJobRecord } from '@/features/data-installer/types';
import type { ImportScopes } from '@/features/data-installer/ui/hooks/useImportScopes';

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
};

function ctx(over: Partial<BodyContext> = {}): BodyContext {
    return {
        displayName: 'ZZ Test Root DB12',
        commerceInstance: 'UoGYsHrcxMyeoVd2zUktZi',
        availableTypes: ['categories'],
        selected: ['categories'],
        allSelected: true,
        record: null,
        result: null,
        busyMessage: '',
        scope: SCOPE,
        removal: { content: { kind: 'plain' }, choice: { always: false }, onToggleAlways: jest.fn(), onSaveAsName: jest.fn() },
        toggle: jest.fn(),
        toggleAll: jest.fn(),
        columns: 1,
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

    // A row per data type from the first frame, in the order the engine installs (owner,
    // 2026-11-07): it was a medium spinner and one line, silent for minutes.
    it('draws an import as a row per data type, in install order, each waiting before the first poll', () => {
        render(<ImportDatapackModalBody view="watching" ctx={ctx({ record: RECORD })} />);

        const names = screen.getAllByText(/^(Categories|Products)$/).map((el) => el.textContent);
        expect(names).toEqual(['Categories', 'Products']);
        expect(screen.getAllByText('Waiting')).toHaveLength(2);
    });

    it('says under the rows what the engine is doing between data types', () => {
        render(<ImportDatapackModalBody view="watching" ctx={ctx({ record: { ...RECORD, phase: 'Comparing the store with the datapack' } })} />);

        expect(screen.getByText('Comparing the store with the datapack')).toBeInTheDocument();
    });

    it('CONTROL: a removal still waits on its spinner', () => {
        render(<ImportDatapackModalBody view="watching" ctx={ctx({ record: { ...RECORD, operation: 'reset' } })} />);

        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(screen.queryByText('Waiting')).not.toBeInTheDocument();
    });
});

describe('an import’s ending, on its rows', () => {
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

    it('keeps each row’s end: done, the reason in red on the one it stopped on, the rest not run', () => {
        const result = { variant: 'error' as const, title: 'Import Stopped', run: RUN, tookMs: 182_000 };
        render(<ImportDatapackModalBody view="result" ctx={ctx({ result })} />);

        expect(screen.getByText('Done')).toBeInTheDocument();
        expect(screen.getByText('Commerce did not respond.')).toHaveClass('dialog-problem', 'text-negative');
        expect(screen.getByText('Not run')).toBeInTheDocument();
        expect(screen.getByText('Took 3 minutes, 2 seconds')).toBeInTheDocument();
    });

    it('puts a problem that did not stop it on its row, orange, and the sentence under the list', () => {
        const run = { ...RUN, outcome: 'success' as const, perType: { categories: 'success', products: 'success', source_items: 'success' } as ImportJobRecord['perType'], stoppedAt: undefined, reason: undefined, rowNotes: { products: 'The store refused 3.' }, scLines: ['Kept 2 things you had changed in the Admin.'] };
        const result = { variant: 'warning' as const, title: 'Datapack Imported', run, lead: 'Luma is in Justrite Test Store.' };
        render(<ImportDatapackModalBody view="result" ctx={ctx({ result })} />);

        expect(screen.getByText('The store refused 3.')).toHaveClass('dialog-problem', 'text-notice');
        expect(screen.getByText('Luma is in Justrite Test Store.')).toBeInTheDocument();
        expect(screen.getByText('Kept 2 things you had changed in the Admin.')).toBeInTheDocument();
    });

    it('puts the reason under the list when it stopped before any data type', () => {
        const run = { ...RUN, perType: { categories: 'error', products: 'error', source_items: 'error' } as ImportJobRecord['perType'], stoppedAt: undefined, reason: 'Choose the website and store view to install into first.' };
        render(<ImportDatapackModalBody view="result" ctx={ctx({ result: { variant: 'error', title: 'Import Stopped', run } })} />);

        expect(screen.getByText('Choose the website and store view to install into first.')).toHaveClass('text-negative');
        expect(screen.getAllByText('Not run')).toHaveLength(3);
    });
});
