/**
 * Tests for dashboard predicate functions (SOP §10 compliance)
 */
import { isStartActionDisabled } from '@/features/dashboard/ui/dashboardPredicates';

describe('isStartActionDisabled', () => {
    it('returns true when transitioning', () => {
        expect(isStartActionDisabled(true, undefined, 'stopped')).toBe(true);
    });

    it('returns true while the mesh is being CHECKED, not just while deploying', () => {
        // The verification pass is a distinct mesh state from the deploy, and it
        // was the only one of the five disabling conditions no test drove — so
        // deleting the check entirely left every test green.
        expect(isStartActionDisabled(false, 'checking', 'stopped')).toBe(true);
    });

    it('returns true when mesh deploying', () => {
        expect(isStartActionDisabled(false, 'deploying', 'stopped')).toBe(true);
    });

    it('returns true when starting', () => {
        expect(isStartActionDisabled(false, undefined, 'starting')).toBe(true);
    });

    it('returns true when stopping', () => {
        expect(isStartActionDisabled(false, undefined, 'stopping')).toBe(true);
    });

    it('returns false when ready to start', () => {
        expect(isStartActionDisabled(false, 'deployed', 'stopped')).toBe(false);
    });

    it('returns false when mesh status is undefined and demo stopped', () => {
        expect(isStartActionDisabled(false, undefined, 'stopped')).toBe(false);
    });

    it('returns false when running status', () => {
        expect(isStartActionDisabled(false, 'deployed', 'running')).toBe(false);
    });
});
