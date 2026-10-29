/**
 * A mesh deploy that changes the store leaves the store-change marker behind (EDS-44).
 *
 * A mesh deploy republishes config.json before anything else does, so it is the
 * publish that records the new store codes. If the marker were set by Configure alone,
 * this path would publish the new store, record it as the baseline, and the next
 * Republish would see no change: the old store's product and category pages would
 * stay live for good. The deploy itself is mocked; the republish it is handed runs for
 * real down to the GitHub and CDN sync.
 */

const mockDeployMeshWithFeedback = jest.fn();
jest.mock('@/features/mesh/services/deployMeshWithFeedback', () => ({
    deployMeshWithFeedback: (...args: unknown[]) => mockDeployMeshWithFeedback(...args),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    ensureDaLiveAuth: jest.fn(async () => ({ authenticated: true })),
}));
jest.mock('fs/promises', () => ({ writeFile: jest.fn(async () => undefined) }));
jest.mock('@/features/eds/services/configGenerator', () => ({
    generateProjectConfigJson: jest.fn(() => ({ success: true, content: '{}' })),
}));
jest.mock('@/features/eds/services/configSyncService', () => ({
    syncConfigToRemote: jest.fn(async () => ({ success: true, githubPushed: true, cdnPublished: true })),
}));

import { handleDeployApiMesh } from '@/features/mesh/handlers/deployHandler';
import type { DeployMeshWithFeedbackDeps } from '@/features/mesh/services/deployMeshWithFeedback';
import { createMockProject } from '../../../helpers/projectFake';
import { ctx, seedRegistry } from './deployHandler.testUtils';

it('the republish a mesh deploy runs records the store change', async () => {
    seedRegistry();
    mockDeployMeshWithFeedback.mockResolvedValue({ success: true, meshId: 'm1', endpoint: 'https://mesh/graphql' });
    const deployed = createMockProject({
        name: 'p',
        path: '/p',
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: {
            'adobe-commerce-accs': {
                ACCS_WEBSITE_CODE: 'citisignal',
                ACCS_STORE_CODE: 'citisignal_store',
                ACCS_STORE_VIEW_CODE: 'citisignal_us',
            },
        },
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                path: '/p/storefront',
                metadata: { githubRepo: 'me/shop', daLiveOrg: 'acme', daLiveSite: 'shop' },
            },
        },
        edsStorefrontState: {
            envVars: { ACCS_WEBSITE_CODE: 'base', ACCS_STORE_CODE: 'main_website_store', ACCS_STORE_VIEW_CODE: 'default' },
            lastPublished: '2026-10-01T00:00:00.000Z',
        },
    });
    const context = ctx(deployed);
    await handleDeployApiMesh(context);
    const deps = mockDeployMeshWithFeedback.mock.calls[0][0] as DeployMeshWithFeedbackDeps;

    await deps.republishStorefront?.(deployed);

    expect(deployed.edsStorefrontState?.catalogPagesPending).toEqual({
        fromWebsiteCode: 'base',
        fromStoreCode: 'main_website_store',
        fromStoreViewCode: 'default',
    });
    // Saved, so it survives until a republish replaces the pages.
    expect(context.stateManager.saveProject).toHaveBeenCalledWith(deployed);
});
