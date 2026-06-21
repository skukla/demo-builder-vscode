/**
 * reviewPredicates Tests (D2 Track B — Step 02 extension)
 *
 * Covers the existing hasRequiredReviewData predicate (mesh gating) plus the
 * new summarizeSelectedDeployables surface that Review uses to list each
 * selected deployable by name, flagging required ones as "Included".
 */

import {
    hasRequiredReviewData,
    summarizeSelectedDeployables,
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

describe('summarizeSelectedDeployables', () => {
    it('returns an empty list when nothing is selected', () => {
        expect(summarizeSelectedDeployables([], [])).toEqual([]);
    });

    it('lists each selected deployable resolved to its display name', () => {
        const result = summarizeSelectedDeployables(['commerce-paas-mesh'], []);
        expect(result).toHaveLength(1);
        // getDeployableName resolves the seeded mesh to a non-id display name.
        expect(result[0].name).toBe('Commerce PaaS API Mesh');
    });

    it('flags required deployables as included (locked)', () => {
        const result = summarizeSelectedDeployables(
            ['commerce-paas-mesh'],
            ['commerce-paas-mesh'],
        );
        expect(result[0].included).toBe(true);
    });

    it('marks optional (non-required) deployables as not included/locked', () => {
        const result = summarizeSelectedDeployables(['commerce-paas-mesh'], []);
        expect(result[0].included).toBe(false);
    });

    it('falls back to the id when a deployable name is unknown', () => {
        const result = summarizeSelectedDeployables(['mystery-deployable'], []);
        expect(result[0].name).toBe('mystery-deployable');
    });
});
