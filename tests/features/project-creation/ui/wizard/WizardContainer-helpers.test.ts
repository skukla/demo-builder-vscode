/**
 * Tests for WizardContainer helper functions (SOP §3 compliance)
 */
import { getNextButtonText } from '@/features/project-creation/ui/wizard/wizardHelpers';

describe('getNextButtonText', () => {
    it('returns Continue when confirming selection', () => {
        expect(getNextButtonText(true, 0, 5)).toBe('Continue');
        expect(getNextButtonText(true, 3, 5)).toBe('Continue');
    });

    it('returns Create on review step (second-to-last)', () => {
        expect(getNextButtonText(false, 3, 5, undefined, 'review')).toBe('Create'); // index 3, total 5
    });

    it('returns Continue on non-review second-to-last step (e.g., storefront-setup)', () => {
        expect(getNextButtonText(false, 3, 5, undefined, 'storefront-setup')).toBe('Continue');
    });

    it('returns Continue on other steps', () => {
        expect(getNextButtonText(false, 0, 5)).toBe('Continue');
        expect(getNextButtonText(false, 1, 5)).toBe('Continue');
    });

    it('handles edge cases correctly', () => {
        // Last step (index = total - 1) should still be Continue (not "Create Project")
        expect(getNextButtonText(false, 4, 5)).toBe('Continue');
        // First step
        expect(getNextButtonText(false, 0, 10)).toBe('Continue');
    });
});
