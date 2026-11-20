/**
 * andList — a list in words, shared by the twelve sentences that list names.
 */

import { andList } from '@/core/utils/andList';

describe('andList', () => {
    it.each([
        [[], ''],
        [['Tailspin ERP'], 'Tailspin ERP'],
        [['Tailspin ERP', 'Accuform ERP'], 'Tailspin ERP and Accuform ERP'],
        // The Reset ERPs confirm read "Tailspin ERP and Accuform ERP and Test ERP" (2026-10-28).
        [['Tailspin ERP', 'Accuform ERP', 'Test ERP'], 'Tailspin ERP, Accuform ERP and Test ERP'],
    ])('lists %j as "%s"', (items, words) => {
        expect(andList(items)).toBe(words);
    });
});
