/**
 * andList — a list in words, shared by the twelve sentences that list names.
 */

import { andList } from '@/core/utils/andList';

describe('andList', () => {
    it.each([
        [[], ''],
        [['Justrite ERP'], 'Justrite ERP'],
        [['Justrite ERP', 'Accuform ERP'], 'Justrite ERP and Accuform ERP'],
        // The Reset ERPs confirm read "Justrite ERP and Accuform ERP and Test ERP" (2026-10-28).
        [['Justrite ERP', 'Accuform ERP', 'Test ERP'], 'Justrite ERP, Accuform ERP and Test ERP'],
    ])('lists %j as "%s"', (items, words) => {
        expect(andList(items)).toBe(words);
    });
});
