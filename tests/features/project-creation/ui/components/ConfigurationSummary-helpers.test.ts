/**
 * Tests for ConfigurationSummary helper functions (SOP §3 compliance)
 */
import { getStepStatus } from '@/features/project-creation/ui/components/stepStatusHelpers';

describe('getStepStatus', () => {
    it('returns empty when no value', () => {
        expect(getStepStatus(false, false)).toBe('empty');
        expect(getStepStatus(false, true)).toBe('empty');
    });

    it('returns completed when value exists and step completed', () => {
        expect(getStepStatus(true, true)).toBe('completed');
    });

    it('returns pending when value exists but step not completed', () => {
        expect(getStepStatus(true, false)).toBe('pending');
    });
});
