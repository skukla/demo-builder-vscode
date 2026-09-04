/**
 * reviewPredicates Tests
 *
 * Covers hasRequiredReviewData (mesh gating). An earlier version of this file
 * also covered `summarizeSelectedAppBuilderComponents` and claimed Review used
 * it — Review never did (zero production callers, deleted 2026-08-23); the
 * live integration-naming path is `resolveReviewIntegrationNames`, tested in
 * `ReviewStep.helpers.test.tsx`.
 *
 * The cases below absorbed `ReviewStep-predicates.test.ts` (2026-09-04), which
 * tested this same single function from a path the mirror convention does not
 * reach — so its coverage was invisible to the focused mutation run.
 */

import { hasRequiredReviewData } from '@/features/project-creation/ui/steps/reviewPredicates';

const MESH = ['eds-commerce-mesh'];

describe('hasRequiredReviewData — project name', () => {
    it('returns false when projectName is missing', () => {
        expect(hasRequiredReviewData({})).toBe(false);
    });

    it('returns false when projectName is empty', () => {
        expect(
            hasRequiredReviewData({
                projectName: '',
                adobeOrg: { id: '1' },
                adobeProject: { id: '2' },
                adobeWorkspace: { id: '3' },
            }),
        ).toBe(false);
    });

    it('returns true with a name and no mesh selected', () => {
        expect(hasRequiredReviewData({ projectName: 'demo' })).toBe(true);
    });

    it('returns true for a non-mesh integration selection', () => {
        expect(
            hasRequiredReviewData({
                projectName: 'demo',
                selectedAppBuilderComponents: ['appbuilder-shell-app'],
            }),
        ).toBe(true);
    });
});

describe('hasRequiredReviewData — Adobe I/O gating when mesh is selected', () => {
    it('returns true when org, project and workspace are all present', () => {
        expect(
            hasRequiredReviewData({
                projectName: 'demo',
                selectedAppBuilderComponents: MESH,
                adobeOrg: { id: '1' },
                adobeProject: { id: '2' },
                adobeWorkspace: { id: '3' },
            }),
        ).toBe(true);
    });

    it('returns false when ONLY the org is missing', () => {
        expect(
            hasRequiredReviewData({
                projectName: 'demo',
                selectedAppBuilderComponents: MESH,
                adobeProject: { id: '2' },
                adobeWorkspace: { id: '3' },
            }),
        ).toBe(false);
    });

    it('returns false when ONLY the project is missing', () => {
        expect(
            hasRequiredReviewData({
                projectName: 'demo',
                selectedAppBuilderComponents: MESH,
                adobeOrg: { id: '1' },
                adobeWorkspace: { id: '3' },
            }),
        ).toBe(false);
    });

    it('returns false when ONLY the workspace is missing', () => {
        expect(
            hasRequiredReviewData({
                projectName: 'demo',
                selectedAppBuilderComponents: MESH,
                adobeOrg: { id: '1' },
                adobeProject: { id: '2' },
            }),
        ).toBe(false);
    });

    it('returns false when a selection object is present but carries no id', () => {
        const base = {
            projectName: 'demo',
            selectedAppBuilderComponents: MESH,
            adobeOrg: { id: '1' },
            adobeProject: { id: '2' },
            adobeWorkspace: { id: '3' },
        };
        expect(hasRequiredReviewData({ ...base, adobeOrg: {} })).toBe(false);
        expect(hasRequiredReviewData({ ...base, adobeProject: {} })).toBe(false);
        expect(hasRequiredReviewData({ ...base, adobeWorkspace: {} })).toBe(false);
    });
});
