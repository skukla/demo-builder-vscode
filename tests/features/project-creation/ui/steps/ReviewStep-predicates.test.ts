/**
 * Tests for ReviewStep predicate functions (SOP §10 compliance)
 *
 * Tests use 'eds-accs' stack which has backend 'adobe-commerce-accs',
 * triggering the needsAdobeIO check and requiring Adobe credentials.
 */
import { hasRequiredReviewData } from '@/features/project-creation/ui/steps/reviewPredicates';

// Stack ID that requires Adobe I/O (ACCS backend)
const ACCS_STACK = 'eds-accs';

describe('hasRequiredReviewData', () => {
    it('returns false when no project name', () => {
        const state = {
            selectedStack: ACCS_STACK,
            adobeOrg: { id: '1' },
            adobeProject: { id: '2' },
            adobeWorkspace: { id: '3' },
        };
        expect(hasRequiredReviewData(state as any)).toBe(false);
    });

    it('returns false when empty project name', () => {
        const state = {
            projectName: '',
            selectedStack: ACCS_STACK,
            adobeOrg: { id: '1' },
            adobeProject: { id: '2' },
            adobeWorkspace: { id: '3' },
        };
        expect(hasRequiredReviewData(state as any)).toBe(false);
    });

    it('returns false when no org (Adobe I/O required)', () => {
        const state = {
            projectName: 'test',
            selectedStack: ACCS_STACK,
            adobeProject: { id: '2' },
            adobeWorkspace: { id: '3' },
        };
        expect(hasRequiredReviewData(state as any)).toBe(false);
    });

    it('returns false when org missing id', () => {
        const state = {
            projectName: 'test',
            selectedStack: ACCS_STACK,
            adobeOrg: {},
            adobeProject: { id: '2' },
            adobeWorkspace: { id: '3' },
        };
        expect(hasRequiredReviewData(state as any)).toBe(false);
    });

    it('returns false when no project (Adobe I/O required)', () => {
        const state = {
            projectName: 'test',
            selectedStack: ACCS_STACK,
            adobeOrg: { id: '1' },
            adobeWorkspace: { id: '3' },
        };
        expect(hasRequiredReviewData(state as any)).toBe(false);
    });

    it('returns false when no workspace (Adobe I/O required)', () => {
        const state = {
            projectName: 'test',
            selectedStack: ACCS_STACK,
            adobeOrg: { id: '1' },
            adobeProject: { id: '2' },
        };
        expect(hasRequiredReviewData(state as any)).toBe(false);
    });

    it('returns true when all required data present (Adobe I/O stack)', () => {
        const state = {
            projectName: 'test',
            selectedStack: ACCS_STACK,
            adobeOrg: { id: '1' },
            adobeProject: { id: '2' },
            adobeWorkspace: { id: '3' },
        };
        expect(hasRequiredReviewData(state as any)).toBe(true);
    });

    it('returns true with only project name when no Adobe I/O needed', () => {
        // No selectedStack → no Adobe I/O requirement
        const state = {
            projectName: 'test',
        };
        expect(hasRequiredReviewData(state as any)).toBe(true);
    });

    it('returns true with project name for non-ACCS stack without mesh', () => {
        // eds-paas without mesh dependencies → no Adobe I/O requirement
        const state = {
            projectName: 'test',
            selectedStack: 'eds-paas',
        };
        expect(hasRequiredReviewData(state as any)).toBe(true);
    });
});
