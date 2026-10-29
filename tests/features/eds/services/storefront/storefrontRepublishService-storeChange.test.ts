/**
 * A config republish that changes the store remembers it (EDS-44).
 *
 * `republishStorefrontConfig` is the one place every config publish goes through —
 * Configure, the dashboard, the agent and the mesh deploy's own republish — and the
 * one place the codes published before are compared with the codes published now. So
 * it is where `edsStorefrontState.catalogPagesPending` is set: only when the store
 * really changed AND the CDN took the new config.json.
 *
 * The real staleness recorder runs here (not mocked), so the marker is checked on the
 * state the publish actually leaves behind.
 */

import * as fsPromises from 'fs/promises';

jest.mock('fs/promises', () => ({ writeFile: jest.fn(async () => undefined) }));

const mockSync = jest.fn();
jest.mock('@/features/eds/services/configGenerator', () => ({
    generateProjectConfigJson: jest.fn(() => ({ success: true, content: '{}' })),
}));
jest.mock('@/features/eds/services/configSyncService', () => ({
    syncConfigToRemote: (...a: unknown[]) => mockSync(...a),
}));

import { republishStorefrontConfig } from '@/features/eds/services/storefront/storefrontRepublishService';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockSecretStorage } from '../../../../helpers/secretStorageFake';
import { edsProject } from './storefrontRepublishService.testUtils';

const MAIN = { ACCS_WEBSITE_CODE: 'base', ACCS_STORE_CODE: 'main_website_store', ACCS_STORE_VIEW_CODE: 'default' };
const CITISIGNAL = {
    ACCS_WEBSITE_CODE: 'citisignal',
    ACCS_STORE_CODE: 'citisignal_store',
    ACCS_STORE_VIEW_CODE: 'citisignal_us',
};
const FROM_MAIN = { fromWebsiteCode: 'base', fromStoreCode: 'main_website_store', fromStoreViewCode: 'default' };

/** An ACCS storefront whose config now names `configured`, last published with `publishedBefore`. */
function storefront(configured: Record<string, string>, publishedBefore?: Record<string, string>): Project {
    return edsProject(
        {},
        {
            componentSelections: { backend: 'adobe-commerce-accs' },
            componentConfigs: { 'adobe-commerce-accs': { ...configured } },
            edsStorefrontState: publishedBefore
                ? { envVars: { ...publishedBefore }, lastPublished: '2026-10-01T00:00:00.000Z' }
                : undefined,
        },
    );
}

async function republish(project: Project): Promise<jest.Mock> {
    const persist = jest.fn(async () => undefined);
    await republishStorefrontConfig({
        project,
        secrets: createMockSecretStorage().secrets,
        logger: createMockLogger(),
        persist,
    });
    return persist;
}

beforeEach(() => {
    jest.clearAllMocks();
    (fsPromises.writeFile as jest.Mock).mockResolvedValue(undefined);
    mockSync.mockResolvedValue({ success: true, githubPushed: true, cdnPublished: true });
});

it('sets the marker, naming the old store, when the CDN took a config.json for another store', async () => {
    const project = storefront(CITISIGNAL, MAIN);

    const persist = await republish(project);

    expect(project.edsStorefrontState?.catalogPagesPending).toEqual(FROM_MAIN);
    // The new codes are the published baseline now.
    expect(project.edsStorefrontState?.envVars).toMatchObject(CITISIGNAL);
    // The pages are not the live store's yet: the Republish tile stays amber.
    expect(project.edsStorefrontStatusSummary).toBe('stale');
    expect(persist).toHaveBeenCalledWith(project);
});

it('sets nothing when the store did not change', async () => {
    const project = storefront(MAIN, MAIN);

    await republish(project);

    expect(project.edsStorefrontState?.catalogPagesPending).toBeUndefined();
    expect(project.edsStorefrontStatusSummary).toBe('published');
});

it('sets nothing when the CDN did not take the new config.json', async () => {
    // The live storefront still reads the old store, so its pages still fit it.
    mockSync.mockResolvedValue({ success: true, githubPushed: true, cdnError: 'HTTP 401' });
    const project = storefront(CITISIGNAL, MAIN);

    await republish(project);

    expect(project.edsStorefrontState?.catalogPagesPending).toBeUndefined();
    expect(project.edsStorefrontStatusSummary).toBe('stale');
});

it('sets nothing on a project with no published state (created before the marker existed)', async () => {
    const project = storefront(CITISIGNAL);

    await republish(project);

    expect(project.edsStorefrontState?.catalogPagesPending).toBeUndefined();
    expect(project.edsStorefrontStatusSummary).toBe('published');
});

it('keeps a pending marker across a second publish of the same store', async () => {
    const project = storefront(CITISIGNAL, MAIN);
    await republish(project);

    await republish(project);

    expect(project.edsStorefrontState?.catalogPagesPending).toEqual(FROM_MAIN);
    expect(project.edsStorefrontStatusSummary).toBe('stale');
});
