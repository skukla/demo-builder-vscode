/**
 * impliedRemovals — what Commerce deletes on its own when a removal deletes something else.
 *
 * Luma's removal sent about 540 deletes for attribute places in sets the same removal deleted next
 * (2026-11-06). Ids follow the record's forms: a set's place `<set id>/<code>`, an added option
 * `<code>/<option id>`, a category keyed by its pack path.
 */

import type { CreatedObject } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { impliedRemovals } from '@/features/data-installer/services/demoBuilderEngine/impliedRemovals';

const set: CreatedObject = { kind: 'attribute_sets', id: '12' };
const attribute: CreatedObject = { kind: 'product_attributes', id: 'fabric' };
const inOurSet: CreatedObject = { kind: 'attribute_assign_to_set', id: '12/color' };
const ourAttributeInTheirSet: CreatedObject = { kind: 'attribute_assign_to_set', id: '4/fabric' };
const theirAttributeInTheirSet: CreatedObject = { kind: 'attribute_assign_to_set', id: '4/color' };
const option: CreatedObject = { kind: 'attribute_options', id: 'fabric/51' };
const gear: CreatedObject = { kind: 'categories', id: '300', key: 'Gear' };
const bags: CreatedObject = { kind: 'categories', id: '301', key: 'Gear/Bags' };
const totes: CreatedObject = { kind: 'categories', id: '302', key: 'Gear/Bags/Totes' };
const gearbox: CreatedObject = { kind: 'categories', id: '303', key: 'Gearbox' };

describe('impliedRemovals', () => {
    it("takes a set's places with the set, an attribute's with the attribute, and leaves one neither covers", () => {
        const { covered, takesWith } = impliedRemovals([inOurSet, ourAttributeInTheirSet, theirAttributeInTheirSet, option, set, attribute]);

        expect([...covered]).toEqual([inOurSet, ourAttributeInTheirSet, option]);
        expect(takesWith.get(set)).toEqual([inOurSet]);
        expect(takesWith.get(attribute)).toEqual([ourAttributeInTheirSet, option]);
    });

    it('takes every category under one with it, to the top, and not one that only shares a prefix', () => {
        const { covered, takesWith } = impliedRemovals([totes, bags, gearbox, gear]);

        expect([...covered]).toEqual([totes, bags]);
        expect(takesWith.get(gear)).toEqual([totes, bags]);
        expect(covered.has(gearbox)).toBe(false);
    });

    it("takes every category with the pack's root", () => {
        const root: CreatedObject = { kind: 'categories', id: '299', key: '(root)' };

        expect(impliedRemovals([bags, gear, root]).takesWith.get(root)).toEqual([bags, gear]);
    });

    it('covers nothing whose taker is not being removed, and no category without a key', () => {
        const keyless: CreatedObject = { kind: 'categories', id: '304' };

        expect(impliedRemovals([inOurSet, option, bags, keyless]).covered.size).toBe(0);
    });
});
