/**
 * EDS Reset Params - extractResetParams Tests
 *
 * Focused unit tests for parameter extraction from a Project.
 * Verifies that template fields on the chosen storefront — including the
 * optional BYOM overlay URL — flow into EdsResetParams.
 */

import type { Project } from '@/types/base';

jest.mock('@/core/constants', () => ({
    COMPONENT_IDS: { EDS_STOREFRONT: 'eds-storefront' },
}));

jest.mock('@/features/project-creation/config/demo-packages.json', () => ({
    packages: [{
        id: 'citisignal',
        storefronts: {
            'eds-paas': {
                templateOwner: 'template-owner',
                templateRepo: 'template-repo',
                contentSource: { org: 'content-org', site: 'content-site' },
                contentPatches: ['patch-a'],
                byomOverlayUrl: 'https://byom.example.com',
            },
            'eds-paas-no-overlay': {
                templateOwner: 'template-owner',
                templateRepo: 'template-repo',
                contentSource: { org: 'content-org', site: 'content-site' },
            },
        },
    }],
}), { virtual: true });

import { extractResetParams } from '@/features/eds/services/edsResetParams';

function createProject(stackId: string): Project {
    return {
        selectedPackage: 'citisignal',
        selectedStack: stackId,
        componentInstances: {
            'eds-storefront': {
                metadata: {
                    githubRepo: 'test-owner/test-repo',
                    daLiveOrg: 'da-org',
                    daLiveSite: 'da-site',
                },
            },
        },
    } as unknown as Project;
}

describe('extractResetParams - BYOM overlay extraction', () => {
    it('reads byomOverlayUrl from the storefront template when present', () => {
        const result = extractResetParams(createProject('eds-paas'));

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.params.byomOverlayUrl).toBe('https://byom.example.com');
    });

    it('omits byomOverlayUrl when storefront does not declare one', () => {
        const result = extractResetParams(createProject('eds-paas-no-overlay'));

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.params.byomOverlayUrl).toBeUndefined();
    });
});
