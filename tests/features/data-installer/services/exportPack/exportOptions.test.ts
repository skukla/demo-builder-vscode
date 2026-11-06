/**
 * exportOptions — an export's select and multi-select labels as the options a pack defines.
 *
 * The labels are Luma's own: its export writes "LumaTech&trade;" and "Cocona&reg; performance
 * fabric", and its pack defines "LumaTech" and "Cocona performance fabric" (2026-11-06).
 */

import type { DatapackFile } from '@/features/data-installer/services/datapackZip';
import { asOption, optionLabels } from '@/features/data-installer/services/exportPack/exportOptions';

const BASE: DatapackFile = {
    id: { name: 'luma', version: 'eds-compatible' },
    displayName: 'Luma',
    items: [
        {
            dataType: 'product_attributes',
            records: [
                { attribute: { attribute_code: 'material', frontend_input: 'multiselect', options: [{ label: 'LumaTech' }, { label: 'Cocona performance fabric' }, { label: 'Wool' }] } },
                { attribute: { attribute_code: 'style', frontend_input: 'select', options: [{ label: 'Hooded' }] } },
                { attribute: { attribute_code: 'new', frontend_input: 'boolean' } },
            ],
        },
    ],
};

describe('optionLabels', () => {
    it('reads the options of select and multi-select attributes only', () => {
        expect([...optionLabels(BASE).keys()]).toEqual(['material', 'style']);
        expect(optionLabels(undefined).size).toBe(0);
    });
});

describe('asOption', () => {
    const options = optionLabels(BASE);

    it('keeps a label that is an option as written', () => {
        expect(asOption(options, 'material', 'Wool')).toBe('Wool');
    });

    it("names the option a label matches once its marks are dropped, as code or character", () => {
        expect(asOption(options, 'material', 'LumaTech&trade;')).toBe('LumaTech');
        expect(asOption(options, 'material', 'Cocona&reg; performance fabric')).toBe('Cocona performance fabric');
        expect(asOption(options, 'material', 'LumaTech™')).toBe('LumaTech');
    });

    it('keeps a label that matches no option, and one on an attribute the pack does not define', () => {
        expect(asOption(options, 'material', 'Kevlar')).toBe('Kevlar');
        expect(asOption(options, 'color', 'Black&trade;')).toBe('Black&trade;');
    });
});
