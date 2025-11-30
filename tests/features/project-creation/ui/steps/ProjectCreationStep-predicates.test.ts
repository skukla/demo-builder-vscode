/**
 * Tests for ProjectCreationStep predicate functions (SOP §10 compliance)
 */
import { isProgressActive } from '@/features/project-creation/ui/steps/projectCreationPredicates';

describe('isProgressActive', () => {
    it('returns false when no progress', () => {
        expect(isProgressActive(undefined, false, false, false)).toBe(false);
    });

    it('returns false when progress has error', () => {
        expect(isProgressActive({ error: 'fail' }, false, false, false)).toBe(false);
    });

    it('returns false when cancelled', () => {
        expect(isProgressActive({}, true, false, false)).toBe(false);
    });

    it('returns false when failed', () => {
        expect(isProgressActive({}, false, true, false)).toBe(false);
    });

    it('returns false when completed', () => {
        expect(isProgressActive({}, false, false, true)).toBe(false);
    });

    it('returns true when active with no issues', () => {
        expect(isProgressActive({}, false, false, false)).toBe(true);
    });
});
