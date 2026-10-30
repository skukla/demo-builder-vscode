/**
 * The small pieces every ACO row is made with: a product's or category's custom attributes as a
 * map, a url path as an ACO slug, a label as a reference id, and Commerce's 1/"1"/true flags.
 * Each case is the service's own rule (aco-export-spec.md §3).
 */

import {
    customAttributeMap,
    isOn,
    slugOfLabel,
    slugOfPath,
} from '@/features/data-installer/services/acoExport/acoRowParts';

describe('customAttributeMap', () => {
    it('keeps every attribute with a value, as a string, and an array joined by commas', () => {
        const map = customAttributeMap({
            custom_attributes: [
                { attribute_code: 'url_key', value: 'pulsewear-max-5' },
                { attribute_code: 'category_ids', value: ['3', '9'] },
                { attribute_code: 'cs_premium_data', value: 50 },
                { attribute_code: 'meta_title', value: null },
            ],
        });

        expect(map).toEqual({
            url_key: 'pulsewear-max-5',
            category_ids: '3,9',
            cs_premium_data: '50',
        });
    });

    it('answers an empty map for a row with no custom attributes', () => {
        expect(customAttributeMap({})).toStrictEqual({});
    });
});

describe('slugOfPath', () => {
    it('lowercases, turns underscores into hyphens and drops everything outside a-z, 0-9, - and /', () => {
        expect(slugOfPath(' Men/Tops_Tees! ')).toBe('men/tops-tees');
    });

    it('collapses repeated slashes and trims them from both ends', () => {
        expect(slugOfPath('/gear//bags/')).toBe('gear/bags');
    });

    it('answers nothing for an empty or unusable path', () => {
        expect(slugOfPath(undefined)).toBeUndefined();
        expect(slugOfPath('   ')).toBeUndefined();
        expect(slugOfPath('***')).toBeUndefined();
    });
});

describe('slugOfLabel', () => {
    it('turns every run of other characters into one hyphen and trims hyphens', () => {
        expect(slugOfLabel('  Extra Large (XL) ')).toBe('extra-large-xl');
        expect(slugOfLabel('Navy_Blue')).toBe('navy-blue');
    });
});

describe('isOn', () => {
    it('reads true, 1 and "1" as on, anything else as off', () => {
        expect([true, 1, '1'].map(isOn)).toEqual([true, true, true]);
        expect([false, 0, '0', undefined, 'yes'].map(isOn)).toEqual([
            false,
            false,
            false,
            false,
            false,
        ]);
    });
});
