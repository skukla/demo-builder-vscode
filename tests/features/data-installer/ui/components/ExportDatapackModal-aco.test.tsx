/**
 * ExportDatapackModal — the ACO choice (datapack-engine step 14 item 19): a pack-type radio, the
 * store's store views and the five ACO kinds to tick, and what `start-datapack-export` is sent.
 *
 * Mocks and helpers live in `ExportDatapackModal.testUtils.tsx`.
 */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

import { change, press, settle } from '../../../../helpers/reactSettle';
import {
    ExportDatapackModal,
    exportCall,
    expectExportDisabled,
    mockRequest,
    renderModal,
    withService,
} from './ExportDatapackModal.testUtils';

/** What `list-datapack-import-scopes` answers: websites, each with its store views. */
const SCOPES = {
    'list-datapack-import-scopes': {
        success: true,
        data: {
            websites: [
                {
                    code: 'base',
                    name: 'Main Website',
                    storeViews: [
                        { code: 'default', name: 'Default Store View' },
                        { code: 'fr', name: 'French' },
                    ],
                },
                {
                    code: 'citisignal',
                    name: 'CitiSignal Website',
                    storeViews: [{ code: 'citisignal_us', name: 'CitiSignal US' }],
                },
            ],
        },
    },
};

async function chooseAco() {
    await press(screen.getByRole('radio', { name: /ACO datapack/ }));
    await screen.findByRole('checkbox', { name: 'French (Main Website)' });
}

async function name(pack: string, version: string) {
    await change(screen.getByRole('textbox', { name: /datapack name/i }), pack);
    await change(screen.getByRole('textbox', { name: /version/i }), version);
}

beforeEach(() => {
    mockRequest.mockReset();
    withService(SCOPES);
});

describe('ExportDatapackModal — an ACO pack', () => {
    it('offers both pack types, the Commerce one first, and lists nothing ACO until it is chosen', async () => {
        await renderModal();

        expect(
            screen.getByRole('radio', { name: /Commerce datapack: into the shared catalog/ })
        ).toBeChecked();
        expect(screen.queryByRole('checkbox', { name: 'ACO metadata' })).not.toBeInTheDocument();
        expect(mockRequest.mock.calls.some((c) => c[0] === 'list-datapack-import-scopes')).toBe(
            false
        );
    });

    it('lists every store view and the five ACO kinds, all ticked, in place of the Commerce types', async () => {
        await renderModal();
        await chooseAco();

        for (const label of [
            'Default Store View (Main Website)',
            'French (Main Website)',
            'CitiSignal US (CitiSignal Website)',
        ]) {
            expect(screen.getByRole('checkbox', { name: label })).toBeChecked();
        }
        for (const label of [
            'ACO metadata',
            'ACO categories',
            'ACO products',
            'ACO price books',
            'ACO prices',
        ]) {
            expect(screen.getByRole('checkbox', { name: label })).toBeChecked();
        }
        expect(screen.queryByRole('checkbox', { name: 'Attribute sets' })).not.toBeInTheDocument();
    });

    it('sends every store view and kind as none named, which makes the pack for all of them', async () => {
        await renderModal();
        await chooseAco();
        await name('aco_acme', 'main');
        await press(screen.getByRole('button', { name: /^export$/i }));

        expect(exportCall()).toEqual({ datapackName: 'aco_acme', version: 'main', aco: true });
    });

    it('sends the store views and kinds still ticked when some are unticked', async () => {
        await renderModal();
        await chooseAco();
        await name('aco_acme', 'main');
        await press(screen.getByRole('checkbox', { name: 'CitiSignal US (CitiSignal Website)' }));
        await press(screen.getByRole('checkbox', { name: 'ACO prices' }));
        await press(screen.getByRole('button', { name: /^export$/i }));

        expect(exportCall()).toEqual({
            datapackName: 'aco_acme',
            version: 'main',
            aco: true,
            storeViews: ['default', 'fr'],
            dataTypes: ['aco_metadata', 'aco_categories', 'aco_products', 'aco_price_books'],
        });
    });

    it('cannot export with no store view ticked', async () => {
        await renderModal();
        await chooseAco();
        await name('aco_acme', 'main');
        for (const label of [
            'Default Store View (Main Website)',
            'French (Main Website)',
            'CitiSignal US (CitiSignal Website)',
        ]) {
            await press(screen.getByRole('checkbox', { name: label }));
        }

        expectExportDisabled(true);
    });

    it('makes the pack for every store view, and says so, when the store views cannot be listed', async () => {
        withService({ 'list-datapack-import-scopes': { success: true, data: { websites: [] } } });
        await renderModal();
        await press(screen.getByRole('radio', { name: /ACO datapack/ }));

        expect(
            await screen.findByText(
                'The store views could not be listed, so the pack is made for every one.'
            )
        ).toBeInTheDocument();
    });

    it('offers ACO only, chosen, when the Commerce export cannot run', async () => {
        render(<ExportDatapackModal onClose={jest.fn()} commerceExport={false} />);
        await settle();

        expect(screen.getByRole('radio', { name: /ACO datapack/ })).toBeChecked();
        expect(
            screen.getByRole('radio', { name: /needs the Data Installer service engine/ })
        ).toBeDisabled();
        expect(await screen.findByRole('checkbox', { name: 'ACO metadata' })).toBeChecked();
    });

    it('saves the result as a file from the library, where the pack was written', async () => {
        withService({
            ...SCOPES,
            'start-datapack-export': {
                success: true,
                data: {
                    success: true,
                    perType: [
                        { dataType: 'aco_products', success: true, exported: 3, excluded: 2 },
                    ],
                },
            },
        });
        await renderModal();
        await chooseAco();
        await name('aco_acme', 'main');
        await press(screen.getByRole('button', { name: /^export$/i }));
        expect(
            await screen.findByText(/ACO products: 3 exported \(2 left out\)/)
        ).toBeInTheDocument();

        await press(screen.getByRole('button', { name: 'Save as file' }));

        expect(mockRequest.mock.calls.find((c) => c[0] === 'save-datapack-zip')?.[1]).toEqual({
            source: 'library',
            datapackName: 'aco_acme',
            version: 'main',
        });
    });
});
