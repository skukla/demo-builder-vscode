/**
 * stepCompletion — generic completed-steps list helpers shared by the main wizard
 * timeline (WIZARD_STEPS) and the Commerce sub-steps. Forward append (deduped) +
 * backward drop-target-and-after.
 */

import { markStepCompleted, clearCompletedFrom } from '@/core/ui/utils/stepCompletion';

describe('markStepCompleted', () => {
    it('appends to an empty or undefined list', () => {
        expect(markStepCompleted(undefined, 'a')).toEqual(['a']);
        expect(markStepCompleted([], 'a')).toEqual(['a']);
    });

    it('appends a new id preserving order', () => {
        expect(markStepCompleted(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    });

    it('is idempotent — re-marking an id does not duplicate it', () => {
        expect(markStepCompleted(['a', 'b'], 'b')).toEqual(['a', 'b']);
    });
});

describe('clearCompletedFrom', () => {
    const order = ['a', 'b', 'c', 'd'];

    it('drops the target and everything after it, keeping earlier steps', () => {
        // Back to 'b' (index 1) → drop b, c, d; keep a.
        expect(clearCompletedFrom(['a', 'b', 'c', 'd'], order, 'b', 1)).toEqual(['a']);
    });

    it('clears everything when navigating to the first step (index 0)', () => {
        expect(clearCompletedFrom(['a', 'b', 'c'], order, 'a', 0)).toEqual([]);
    });

    it('preserves steps before the target even when later ones are absent', () => {
        expect(clearCompletedFrom(['a', 'c'], order, 'c', 2)).toEqual(['a']);
    });

    it('handles an undefined list', () => {
        expect(clearCompletedFrom(undefined, order, 'b', 1)).toEqual([]);
    });
});
