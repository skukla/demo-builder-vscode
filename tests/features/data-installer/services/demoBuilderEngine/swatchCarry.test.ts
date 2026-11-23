/**
 * A save keeps a swatch's type and colours from the installed version, since Commerce's REST API
 * answers a visual swatch as a `select` with no colours (F140, measured on the test store
 * 2026-11-16). Fingerprints still compare the store with itself, so the carried row goes back to
 * the store's form before it is hashed.
 */
import { attributePackForm } from '@/features/data-installer/services/demoBuilderEngine/packForm';
import type { StoreAttribute } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import { storeFormOfAttribute, withPackSwatch } from '@/features/data-installer/services/demoBuilderEngine/swatchCarry';

/** What the store answers for Luma's colour attribute after an install: a select, ids, no colours. */
const STORED: StoreAttribute = {
    attribute_id: 912,
    attribute_code: 'luma_color',
    frontend_input: 'select',
    is_user_defined: true,
    options: [{ label: ' ', value: '' }, { label: 'Black', value: '6290' }, { label: 'Teal', value: '6301' }],
};

/** The installed version's row: a visual swatch with its colours. */
const INSTALLED = {
    attribute: {
        attribute_code: 'luma_color',
        frontend_input: 'swatch_visual',
        options: [
            { label: 'Black', value: '#000000', sort_order: 0, is_default: true },
            { label: 'Blue', value: '#1857f7', sort_order: 1, is_default: false },
        ],
    },
};

describe('withPackSwatch', () => {
    it("keeps the installed version's swatch type and each option's colour, by label", () => {
        const saved = withPackSwatch(attributePackForm(STORED), INSTALLED);

        expect(saved.attribute.frontend_input).toBe('swatch_visual');
        // Teal was added in the Admin: the store cannot say its colour, so it keeps its label.
        expect(saved.attribute.options).toStrictEqual([
            { label: 'Black', value: '#000000' },
            { label: 'Teal', value: 'Teal' },
        ]);
    });

    it('leaves a row as the store answers it when the installed version did not make it a swatch', () => {
        const captured = attributePackForm(STORED);

        expect(withPackSwatch(captured, { attribute: { attribute_code: 'luma_color', frontend_input: 'select' } })).toBe(captured);
        expect(withPackSwatch(captured, undefined)).toBe(captured);
    });
});

describe('storeFormOfAttribute', () => {
    it('takes a carried row back to exactly what the store answers, so fingerprints compare like with like', () => {
        const captured = attributePackForm(STORED);

        expect(storeFormOfAttribute(withPackSwatch(captured, INSTALLED))).toStrictEqual(captured);
    });

    it('leaves a row that is no swatch as it is', () => {
        const captured = attributePackForm(STORED);

        expect(storeFormOfAttribute(captured)).toBe(captured);
    });
});
