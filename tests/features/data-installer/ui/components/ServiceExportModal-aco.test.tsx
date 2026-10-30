/**
 * ServiceExportModal — an ACO pack (datapack-engine step 14 item 19): the store's store views and
 * the five ACO kinds to tick, and what `start-datapack-export` is sent. The pack type is chosen
 * before this screen, in "Create datapack" (CreateDatapackModal.test.tsx tests that choice).
 *
 * Mocks and helpers live in `ServiceExportModal.testUtils.tsx`.
 */

import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { change, press } from '../../../../helpers/reactSettle';
import {
    exportCall,
    expectExportDisabled,
    mockRequest,
    renderModal,
    withService,
} from './ServiceExportModal.testUtils';

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

async function name(pack: string, version: string) {
    await change(screen.getByRole('textbox', { name: /datapack name/i }), pack);
    await change(screen.getByRole('textbox', { name: /version/i }), version);
}

beforeEach(() => {
    mockRequest.mockReset();
    withService(SCOPES);
});

describe('ServiceExportModal — an ACO pack', () => {
    it('a Commerce pack lists nothing ACO, and reads no store views', async () => {
        await renderModal();

        expect(screen.getByRole('checkbox', { name: 'Attribute sets' })).toBeInTheDocument();
        expect(screen.queryByRole('checkbox', { name: 'ACO metadata' })).not.toBeInTheDocument();
        expect(screen.queryByRole('radio')).not.toBeInTheDocument();
        expect(mockRequest.mock.calls.some((c) => c[0] === 'list-datapack-import-scopes')).toBe(
            false
        );
    });

    it('lists every store view and the five ACO kinds, all ticked, in place of the Commerce types', async () => {
        await renderModal('aco');

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
        await renderModal('aco');
        await name('aco_acme', 'main');
        await press(screen.getByRole('button', { name: /^export$/i }));

        expect(exportCall()).toEqual({ datapackName: 'aco_acme', version: 'main', aco: true });
    });

    it('sends the store views and kinds still ticked when some are unticked', async () => {
        await renderModal('aco');
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
        await renderModal('aco');
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
        await renderModal('aco');

        expect(
            await screen.findByText(
                'The store views could not be listed, so the pack is made for every one.'
            )
        ).toBeInTheDocument();
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
        await renderModal('aco');
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
