/**
 * AssignProductList against the REAL Spectrum table, not the shared mock.
 *
 * The mock reads a table's columns and cells however they are written, and the real one does
 * not: columns and cells made by a `.map` threw "Cannot read properties of undefined (reading
 * 'getReusableView')" in Spectrum's virtualizer and blanked the whole Integrations screen as
 * the products arrived (2026-10-19), while every mocked test passed. This renders the list
 * through the real package, so that shape fails here instead.
 *
 * The package path bypasses `moduleNameMapper`, which redirects `@adobe/react-spectrum` to the
 * mock for every suite (`jest.unmock` cannot undo a mapper).
 */

jest.mock('@adobe/react-spectrum', () =>
    jest.requireActual(require('path').join(process.cwd(), 'node_modules/@adobe/react-spectrum/dist/main.js')),
);

import '@testing-library/jest-dom';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { AssignProductList, LIST_COPY } from '@/features/dashboard/ui/components/AssignProductList';
import type { ErpAssignOptions } from '@/types/erpAssign';

const STORE: ErpAssignOptions = {
    erp: { id: 'demo-erp-2', name: 'Accuform ERP', listId: 'accuform' },
    ownerValue: 'accuform',
    categories: [{ value: '7', label: 'Signs › Exit Signs', count: 3 }],
    setsWithoutOwner: [{ id: 9, name: 'Gear', products: 1 }],
    products: [
        { sku: 'ACC-1', name: 'Exit sign', attributeSetId: 4, categoryIds: ['7'], owner: '' },
        { sku: 'ACC-3', name: 'Floor sign', attributeSetId: 4, categoryIds: ['7'], owner: 'accuform' },
        { sku: 'ACC-9', name: 'Gear tag', attributeSetId: 9, categoryIds: ['7'], owner: '' },
    ],
    owners: { 'ACC-1': ['justrite'], 'ACC-3': ['accuform'], 'ACC-9': ['justrite'] },
    names: { justrite: 'Justrite ERP', accuform: 'Accuform ERP' },
};

it('renders its table, headings and rows, through the real Spectrum package', () => {
    // The real SearchField warns that placeholders are deprecated; the hint is wanted (owner,
    // 2026-10-18: "Search SKU or name"), so the warning is expected and absorbed here.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(
        <Provider theme={defaultTheme}>
            <AssignProductList options={STORE} value="accuform" selected={new Set()} onChange={() => undefined} />
        </Provider>,
    );

    const table = screen.getByRole('grid', { name: 'Products' });
    expect(table).toBeInTheDocument();
    for (const heading of Object.values(LIST_COPY.columns)) {
        expect(screen.getByRole('columnheader', { name: new RegExp(heading) })).toBeInTheDocument();
    }
    expect(screen.getByText('Exit sign')).toBeInTheDocument();
    expect(warn.mock.calls.every(([message]) => String(message).startsWith('Placeholders are deprecated'))).toBe(true);
    warn.mockRestore();
});
