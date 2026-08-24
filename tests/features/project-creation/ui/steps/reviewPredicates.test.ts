/**
 * reviewPredicates Tests
 *
 * Covers hasRequiredReviewData (mesh gating). An earlier version of this file
 * also covered `summarizeSelectedAppBuilderComponents` and claimed Review used
 * it — Review never did (zero production callers, deleted 2026-08-23); the
 * live integration-naming path is `resolveReviewIntegrationNames`, tested in
 * `ReviewStep.helpers.test.tsx`.
 */

import { hasRequiredReviewData } from '@/features/project-creation/ui/steps/reviewPredicates';

describe('hasRequiredReviewData (existing mesh gating — regression lock)', () => {
    it('returns false when projectName is missing', () => {
        expect(hasRequiredReviewData({})).toBe(false);
    });

    it('returns true with a name and no mesh selected', () => {
        expect(hasRequiredReviewData({ projectName: 'demo' })).toBe(true);
    });

    it('requires Adobe org/project/workspace when a mesh component is selected', () => {
        const withMesh = {
            projectName: 'demo',
            selectedAppBuilderComponents: ['eds-commerce-mesh'],
        };
        expect(hasRequiredReviewData(withMesh)).toBe(false);

        const complete = {
            ...withMesh,
            adobeOrg: { id: 'o' },
            adobeProject: { id: 'p' },
            adobeWorkspace: { id: 'w' },
        };
        expect(hasRequiredReviewData(complete)).toBe(true);
    });
});
