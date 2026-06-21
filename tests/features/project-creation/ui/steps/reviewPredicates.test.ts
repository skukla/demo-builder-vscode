/**
 * reviewPredicates Tests (D2 Track B — Step 02 extension)
 *
 * Covers the existing hasRequiredReviewData predicate (mesh gating) plus the
 * new summarizeSelectedAppBuilderComponents surface that Review uses to list each
 * selected appBuilderComponent by name, flagging required ones as "Included".
 */

import {
    hasRequiredReviewData,
    summarizeSelectedAppBuilderComponents,
} from '@/features/project-creation/ui/steps/reviewPredicates';

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
            selectedOptionalDependencies: ['eds-commerce-mesh'],
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

describe('summarizeSelectedAppBuilderComponents', () => {
    it('returns an empty list when nothing is selected', () => {
        expect(summarizeSelectedAppBuilderComponents([], [])).toEqual([]);
    });

    it('lists each selected appBuilderComponent resolved to its display name', () => {
        const result = summarizeSelectedAppBuilderComponents(['commerce-paas-mesh'], []);
        expect(result).toHaveLength(1);
        // getAppBuilderComponentName resolves the seeded mesh to a non-id display name.
        expect(result[0].name).toBe('Commerce PaaS API Mesh');
    });

    it('flags required appBuilderComponents as included (locked)', () => {
        const result = summarizeSelectedAppBuilderComponents(
            ['commerce-paas-mesh'],
            ['commerce-paas-mesh'],
        );
        expect(result[0].included).toBe(true);
    });

    it('marks optional (non-required) appBuilderComponents as not included/locked', () => {
        const result = summarizeSelectedAppBuilderComponents(['commerce-paas-mesh'], []);
        expect(result[0].included).toBe(false);
    });

    it('falls back to the id when an App Builder component name is unknown', () => {
        const result = summarizeSelectedAppBuilderComponents(['mystery-appBuilderComponent'], []);
        expect(result[0].name).toBe('mystery-appBuilderComponent');
    });
});
