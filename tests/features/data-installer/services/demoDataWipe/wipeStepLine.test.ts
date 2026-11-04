/**
 * The line under each of the clearing's removal steps: how far it has got through that step's
 * items, as an install counts through its data types (owner, 2026-11-04).
 */

import { stepLine } from '@/features/data-installer/services/demoDataWipe/wipeStepLine';

describe('stepLine', () => {
    it('counts the items done of the step, in its own noun', () => {
        expect(stepLine('customers', 12, 40)).toBe('12 of 40 customers');
        expect(stepLine('categories', 0, 3)).toBe('0 of 3 categories');
    });

    it('says one item in the singular', () => {
        expect(stepLine('orders', 0, 1)).toBe('0 of 1 order');
    });

    it('counts a step taking things off sites in what it takes off', () => {
        expect(stepLine('rulesTakenOff', 1, 2)).toBe('1 of 2 cart rules');
    });
});
