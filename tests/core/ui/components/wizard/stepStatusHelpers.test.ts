/**
 * Tests for step status helper functions
 *
 * These helpers determine the visual status (completed/pending/empty)
 * of wizard steps based on their data state and completion status.
 */
import { getStepStatus } from '@/core/ui/components/wizard/stepStatusHelpers';

describe('getStepStatus', () => {
    describe('when no value is present', () => {
        it('returns empty regardless of completion state', () => {
            expect(getStepStatus(false, false)).toBe('empty');
            expect(getStepStatus(false, true)).toBe('empty');
        });
    });

    describe('when value is present', () => {
        it('returns completed when step is completed', () => {
            expect(getStepStatus(true, true)).toBe('completed');
        });

        it('returns pending when step is not completed', () => {
            expect(getStepStatus(true, false)).toBe('pending');
        });
    });
});
