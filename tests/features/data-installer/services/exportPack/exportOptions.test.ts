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

    // Luma's export writes "32" where its size option is "Size 32" (2026-11-06).
    it('names the one option whose last word the label is, and not when two options end the same', () => {
        const sizes = new Map([['size', ['XS', 'Size 32', 'Size 33']], ['length', ['Short 32', 'Long 32']]]);

        expect(asOption(sizes, 'size', '32')).toBe('Size 32');
        expect(asOption(sizes, 'length', '32')).toBe('32');
    });

    it('keeps a label that matches no option, and one on an attribute the pack does not define', () => {
        expect(asOption(options, 'material', 'Kevlar')).toBe('Kevlar');
        expect(asOption(options, 'color', 'Black&trade;')).toBe('Black&trade;');
    });
});
