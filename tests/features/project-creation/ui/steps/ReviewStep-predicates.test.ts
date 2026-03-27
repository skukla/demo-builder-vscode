/**
 * Tests for ReviewStep predicate functions (SOP §10 compliance)
 *
 * Adobe I/O credentials (org/project/workspace) are only required when
 * mesh is included in dependencies. ACCS projects without mesh do not
 * need Adobe I/O steps.
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
        };
        expect(hasRequiredReviewData(state as any)).toBe(false);
    });

    it('returns true with only project name when no mesh', () => {
        const state = {
            projectName: 'test',
        };
        expect(hasRequiredReviewData(state as any)).toBe(true);
    });

    it('returns true for ACCS project without mesh (no Adobe I/O needed)', () => {
        const state = {
            projectName: 'test',
            // No mesh in dependencies, no Adobe I/O selections needed
        };
        expect(hasRequiredReviewData(state as any)).toBe(true);
    });

    it('returns false when mesh included but no org', () => {
        const state = {
            projectName: 'test',
            selectedOptionalDependencies: ['eds-commerce-mesh'],
            adobeProject: { id: '2' },
            adobeWorkspace: { id: '3' },
        };
        expect(hasRequiredReviewData(state as any)).toBe(false);
    });

    it('returns false when mesh included but no project', () => {
        const state = {
            projectName: 'test',
            selectedOptionalDependencies: ['eds-commerce-mesh'],
            adobeOrg: { id: '1' },
            adobeWorkspace: { id: '3' },
        };
        expect(hasRequiredReviewData(state as any)).toBe(false);
    });

    it('returns false when mesh included but no workspace', () => {
        const state = {
            projectName: 'test',
            selectedOptionalDependencies: ['eds-commerce-mesh'],
            adobeOrg: { id: '1' },
            adobeProject: { id: '2' },
        };
        expect(hasRequiredReviewData(state as any)).toBe(false);
    });

    it('returns true when mesh included and all Adobe I/O data present', () => {
        const state = {
            projectName: 'test',
            selectedOptionalDependencies: ['eds-commerce-mesh'],
            adobeOrg: { id: '1' },
            adobeProject: { id: '2' },
            adobeWorkspace: { id: '3' },
        };
        expect(hasRequiredReviewData(state as any)).toBe(true);
    });
});
