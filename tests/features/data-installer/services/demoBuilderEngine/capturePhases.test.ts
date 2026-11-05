/**
 * captureLines: a save's progress line counts the data types this save is about, not every type a
 * save could read (owner, 2026-11-05).
 */

import { captureLines } from '@/features/data-installer/services/demoBuilderEngine/capturePhases';

describe('captureLines', () => {
    it('counts only what was picked', () => {
        const line = captureLines(['customer_groups']);

        expect(line(0)).toBe('0 of 1 data type: Customer Groups');
        expect(line(5)).toBe('0 of 1 data type: Customer Groups');
        expect(line(6)).toBe('1 of 1 data type');
    });

    it('counts what a product brings with it', () => {
        const line = captureLines(['products']);

        expect(line(0)).toBe('0 of 5 data types: Products');
        expect(line(1)).toBe('1 of 5 data types: Categories');
        expect(line(4)).toBe('4 of 5 data types: Source Items');
    });

    it('counts a kind read under another by the phase that reads it', () => {
        expect(captureLines(['coupons'])(0)).toBe('0 of 1 data type: Cart Rules');
    });

    it('says every read when it recognises nothing, rather than counting to zero', () => {
        expect(captureLines([])(0)).toBe('0 of 12 data types: Products, Gift Cards');
    });
});
