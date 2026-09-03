/**
 * Clearing the storefront stale flag has to reach DISK.
 *
 * `republishStorefrontConfig` is what resolves storefront drift: Configure sets
 * `edsStorefrontStatusSummary = 'stale'` when the generated config.json would
 * differ, and this is the operation that regenerates and republishes it.
 *
 * It set the flag back to `'published'` on the in-memory project and left saving
 * to the caller. None of its five callers saved — while Configure, setting the
 * OPPOSITE value, saves immediately. So the manifest could go stale and never
 * come back: reopening the dashboard re-read `stale` from disk and the Republish
 * tile was amber again after a successful republish.
 *
 * `persist` is REQUIRED on the params so the compiler asks every caller for it.
 */

import * as fsPromises from 'fs/promises';

jest.mock('fs/promises', () => ({ writeFile: jest.fn(async () => undefined) }));

// `extractRepublishParams` lives in the module under test, so it cannot be
// mocked — the fixture project carries real EDS metadata instead.
const mockGenerate = jest.fn();
const mockSync = jest.fn();

jest.mock('@/features/eds/services/configGenerator', () => ({
    generateConfigJson: (...a: unknown[]) => mockGenerate(...a),
    buildConfigGeneratorParams: () => ({}),
}));
jest.mock('@/features/eds/services/configSyncService', () => ({
    syncConfigToRemote: (...a: unknown[]) => mockSync(...a),
    verifyConfigOnCdn: jest.fn(async () => true),
}));
jest.mock('@/features/eds/services/storefront/storefrontStalenessDetector', () => ({
    updateStorefrontState: jest.fn(),
}));

import {
    extractRepublishParams,
    republishStorefrontConfig,
} from '@/features/eds/services/storefront/storefrontRepublishService';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';

import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockProject } from '../../../helpers/projectFake';
const logger = createMockLogger() as unknown as Logger;

/** A project the extractor accepts: repo, DA.live pair and a component path. */
function edsProject(metadata: Record<string, unknown> = {}) {
    return createMockProject({
        name: 'p',
        path: '/p',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                path: '/p/storefront',
                metadata: {
                    githubRepo: 'me/shop',
                    daLiveOrg: 'acme',
                    daLiveSite: 'shop',
                    ...metadata,
                },
            },
        },
    });
}

function run(over: Record<string, unknown> = {}, project = edsProject()) {
    const persist = jest.fn(async () => {});
    return {
        project,
        persist,
        result: republishStorefrontConfig({
            project,
            secrets: createMockSecretStorage().secrets,
            logger,
            persist,
            ...over,
        }),
    };
}

describe('republishStorefrontConfig — persisting the cleared flag', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGenerate.mockReturnValue({ success: true, content: '{}' });
        mockSync.mockResolvedValue({ success: true });
        (fsPromises.writeFile as jest.Mock).mockResolvedValue(undefined);
    });

    it('saves the project after clearing the flag', async () => {
        const { project, persist, result } = run();
        await result;

        expect(project).toHaveProperty('edsStorefrontStatusSummary', 'published');
        expect(persist).toHaveBeenCalledWith(project);
    });

    it('does NOT clear or save when the remote sync failed', async () => {
        // Drift is unresolved, so the tile must stay amber.
        mockSync.mockResolvedValue({ success: false, error: 'push rejected' });
        const { project, persist, result } = run();
        await result;

        expect(project).not.toHaveProperty('edsStorefrontStatusSummary', 'published');
        expect(persist).not.toHaveBeenCalled();
    });

    it('does NOT clear or save when the project has no EDS metadata', async () => {
        // The early return that made this worth checking: a successful CONTENT
        // republish tolerates this step failing, so a flag cleared here on a
        // metadata-less project would be a lie.
        const bare = createMockProject({ name: 'p', path: '/p', componentInstances: {} });
        const { project, persist, result } = run({}, bare);
        await result;

        expect(project).not.toHaveProperty('edsStorefrontStatusSummary', 'published');
        expect(persist).not.toHaveBeenCalled();
    });
});

// Repo-name fallback (legacyLookupKey retirement, 2026-08-23): the loader
// strips `daLiveSite` from the manifest when it equals the repo name, so the
// extractor must derive it from `githubRepo` rather than erroring.
describe('extractRepublishParams — daLiveSite fallback', () => {
    it('derives daLiveSite from the repo name when the manifest carries none', () => {
        const project = edsProject({ daLiveSite: undefined });

        const result = extractRepublishParams(project);

        expect(result).toEqual(expect.objectContaining({ success: true, daLiveSite: 'shop' }));
    });

    it('an explicit daLiveSite (unmigrated legacy project) still wins over the repo name', () => {
        const project = edsProject({ daLiveSite: 'shop-content' });

        const result = extractRepublishParams(project);

        expect(result).toEqual(
            expect.objectContaining({ success: true, daLiveSite: 'shop-content' })
        );
    });
});
