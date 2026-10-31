/**
 * The armed removal, in the extension's confirmation shape (owner, 2026-10-31): the question, then
 * Store and Data as label-and-value rows, then the muted "can't be undone" line. The store is named
 * as the SC picked it, never by the 22-character instance id.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { type BodyContext, ImportDatapackModalBody } from '@/features/data-installer/ui/components/ImportDatapackModalBody';
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
    it('asks, then names the store and the data in rows, then says there is no undo', () => {
        render(<ImportDatapackModalBody view="confirm-reset" ctx={ctx()} />);

        expect(screen.getByText(/Remove ZZ Test Root DB12.s data from this store\?/)).toBeInTheDocument();
        expect(screen.getByText('Store')).toBeInTheDocument();
        expect(screen.getByText('Justrite Test Store US (Justrite Test)')).toBeInTheDocument();
        expect(screen.getByText('Data (1)')).toBeInTheDocument();
        expect(screen.getByText(/can.t be undone/)).toBeInTheDocument();
        expect(screen.queryByText('UoGYsHrcxMyeoVd2zUktZi')).not.toBeInTheDocument();
    });

    it('falls back to the instance when no store was discovered', () => {
        render(<ImportDatapackModalBody view="confirm-reset" ctx={ctx({ scope: { ...SCOPE, websites: [] } })} />);

        expect(screen.getByText('UoGYsHrcxMyeoVd2zUktZi')).toBeInTheDocument();
    });
});
