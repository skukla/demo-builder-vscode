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
        dataTypes: ['categories'],
        startedAt: '2026-11-02T00:00:00.000Z',
        outcome: 'watching',
        perType: {},
    };

    it('uses the dialog wait spacing, and holds no blank row under its two lines', () => {
        const { container } = render(
            <ImportDatapackModalBody view="watching" ctx={ctx({ record: RECORD })} />,
        );

        expect(container.querySelector('.modal-wait [role="status"]')).not.toBeNull();
        expect(container.querySelector('.text-xs')).toBeNull();
    });

    it('says the import carries on once watching has stopped, with nothing still spinning', () => {
        render(<ImportDatapackModalBody view="stopped-watching" ctx={ctx({ record: RECORD })} />);

        expect(screen.getByText('The import continues in the background.')).toBeInTheDocument();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('CONTROL: a running watch does spin', () => {
        render(<ImportDatapackModalBody view="watching" ctx={ctx({ record: RECORD })} />);

        expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
});
