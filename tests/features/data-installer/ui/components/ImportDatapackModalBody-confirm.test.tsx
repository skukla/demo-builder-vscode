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
        watching: false,
        result: null,
        busyMessage: '',
        scope: SCOPE,
        toggle: jest.fn(),
        toggleAll: jest.fn(),
        ...over,
    };
}

describe('the removal confirmation', () => {
    it('says what goes in one sentence, the warning a word in it, and no rows', () => {
        render(<ImportDatapackModalBody view="confirm-reset" ctx={ctx()} />);

        expect(screen.getByText('Permanently deletes ZZ Test Root DB12’s categories.')).toBeInTheDocument();
        expect(screen.queryByText('Store')).not.toBeInTheDocument();
        expect(screen.queryByText(/can.t be undone/)).not.toBeInTheDocument();
        expect(screen.queryByText('UoGYsHrcxMyeoVd2zUktZi')).not.toBeInTheDocument();
    });
});

describe('typesInSentence', () => {
    it.each([
        [['Categories'], 'categories'],
        [['Categories', 'Products'], 'categories and products'],
        [['Attribute sets', 'Categories', 'Products'], 'attribute sets, categories and products'],
    ])('joins %j as a sentence joins them', (labels, sentence) => {
        expect(typesInSentence(labels)).toBe(sentence);
    });

    it('keeps the capitals of a label that starts with an acronym', () => {
        expect(typesInSentence(['B2B companies', 'ACO catalog'])).toBe('B2B companies and ACO catalog');
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
