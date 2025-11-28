/**
 * Tests for ReviewStep predicate functions (SOP §10 compliance)
 */
import { hasRequiredReviewData } from '@/features/project-creation/ui/steps/reviewPredicates';

describe('hasRequiredReviewData', () => {
    it('returns false when no project name', () => {
        const state = {
            adobeOrg: { id: '1' },
            adobeProject: { id: '2' },
            adobeWorkspace: { id: '3' },
        };
        expect(hasRequiredReviewData(state as any)).toBe(false);
    });

    it('returns false when empty project name', () => {
        const state = {
            projectName: '',
            adobeOrg: { id: '1' },
            adobeProject: { id: '2' },
            adobeWorkspace: { id: '3' },
        };
        expect(hasRequiredReviewData(state as any)).toBe(false);
    });

    it('returns false when no org', () => {
        const state = {
            projectName: 'test',
            adobeProject: { id: '2' },
            adobeWorkspace: { id: '3' },
        };
        expect(hasRequiredReviewData(state as any)).toBe(false);
    });

    it('returns false when org missing id', () => {
        const state = {
            projectName: 'test',
            adobeOrg: {},
            adobeProject: { id: '2' },
            adobeWorkspace: { id: '3' },
        };
        expect(hasRequiredReviewData(state as any)).toBe(false);
    });

    it('returns false when no project', () => {
        const state = {
            projectName: 'test',
            adobeOrg: { id: '1' },
            adobeWorkspace: { id: '3' },
        };
        expect(hasRequiredReviewData(state as any)).toBe(false);
    });

    it('returns false when no workspace', () => {
        const state = {
            projectName: 'test',
            adobeOrg: { id: '1' },
            adobeProject: { id: '2' },
        };
        expect(hasRequiredReviewData(state as any)).toBe(false);
    });

    it('returns true when all required data present', () => {
        const state = {
            projectName: 'test',
            adobeOrg: { id: '1' },
            adobeProject: { id: '2' },
            adobeWorkspace: { id: '3' },
        };
        expect(hasRequiredReviewData(state as any)).toBe(true);
    });
});
