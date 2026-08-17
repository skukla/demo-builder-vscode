/**
 * EDS Reset Params - extractResetParams Tests
 *
 * Focused unit tests for parameter extraction from a Project.
 * Verifies that template fields on the chosen storefront — including the
 * optional BYOM overlay URL — flow into EdsResetParams.
 *
 * The demo-packages config is injected directly (not jest.mock'd) so these
 * tests are deterministic regardless of worker/file ordering — a static JSON
 * module mock proved leaky across suites sharing a worker.
 */

import type { Project } from '@/types/base';
import { extractResetParams } from '@/features/eds/services/edsResetParams';

type PackagesConfig = Parameters<typeof extractResetParams>[1];

const mockPackages = [{
    id: 'citisignal',
    storefronts: {
        'eds-paas': {
            templateOwner: 'template-owner',
            templateRepo: 'template-repo',
            contentSource: { org: 'content-org', site: 'content-site' },
            contentPatches: ['patch-a'],
            byomOverlayUrl: 'https://byom.example.com',
            brandAssets: {
                source: { owner: 'skukla', repo: 'bodea-source', branch: 'main' },
                files: [{ from: 'styles/theme.css', to: 'styles/theme.css' }],
                headSnippet: '<link rel="stylesheet" href="/styles/theme.css">',
            },
        },
        'eds-paas-no-overlay': {
            templateOwner: 'template-owner',
            templateRepo: 'template-repo',
            contentSource: { org: 'content-org', site: 'content-site' },
        },
    },
}] as unknown as PackagesConfig;

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
        const result = extractResetParams(createProject('eds-paas'), mockPackages);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.params.byomOverlayUrl).toBe('https://byom.example.com');
    });

    it('omits byomOverlayUrl when storefront does not declare one', () => {
        const result = extractResetParams(createProject('eds-paas-no-overlay'), mockPackages);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.params.byomOverlayUrl).toBeUndefined();
    });
});

describe('extractResetParams - brandAssets extraction', () => {
    it('reads brandAssets from the storefront template when present', () => {
        const result = extractResetParams(createProject('eds-paas'), mockPackages);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.params).toEqual(
            expect.objectContaining({
                brandAssets: {
                    source: { owner: 'skukla', repo: 'bodea-source', branch: 'main' },
                    files: [{ from: 'styles/theme.css', to: 'styles/theme.css' }],
                    headSnippet: '<link rel="stylesheet" href="/styles/theme.css">',
                },
            }),
        );
    });

    it('omits brandAssets when the storefront does not declare it', () => {
        const result = extractResetParams(createProject('eds-paas-no-overlay'), mockPackages);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.params).not.toHaveProperty('brandAssets');
    });
});
