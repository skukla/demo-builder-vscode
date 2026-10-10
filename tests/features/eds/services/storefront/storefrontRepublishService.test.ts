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
    generateProjectConfigJson: (...a: unknown[]) => mockGenerate(...a),
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
    NO_DALIVE_SESSION_MESSAGE,
    republishStorefrontConfig,
} from '@/features/eds/services/storefront/storefrontRepublishService';
import { updateStorefrontState } from '@/features/eds/services/storefront/storefrontStalenessDetector';
import { createMockLogger } from '../../../../helpers/loggerFake';

import { createMockSecretStorage } from '../../../../helpers/secretStorageFake';
import { createMockProject } from '../../../../helpers/projectFake';
const logger = createMockLogger();

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

/**
 * The DA.live session the CDN publish needs (2026-09-24).
 *
 * Every storefront the extension sets up carries a site admin role, and with it
 * every Helix admin call needs the DA.live session. The republish inside an add
 * never asked for one: it pushed to GitHub, the CDN publish answered 401, the add
 * reported done, and the storefront kept serving the previous config.json with
 * the Republish tile green over it.
 */
describe('republishStorefrontConfig — the DA.live session guard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGenerate.mockReturnValue({ success: true, content: '{}' });
        mockSync.mockResolvedValue({ success: true });
        (fsPromises.writeFile as jest.Mock).mockResolvedValue(undefined);
    });

    it('asks for the session BEFORE the push, and a granted one changes nothing', async () => {
        const order: string[] = [];
        mockSync.mockImplementation(async () => {
            order.push('sync');
            return { success: true, cdnPublished: true };
        });
        const ensureDaLiveSession = jest.fn(async () => {
            order.push('session');
            return { authenticated: true };
        });

        const { project, result } = run({ ensureDaLiveSession });
        await result;

        expect(order).toEqual(['session', 'sync']);
        expect(project).toHaveProperty('edsStorefrontStatusSummary', 'published');
    });

    it('a declined sign-in still pushes to GitHub, names the reason, and leaves the storefront STALE', async () => {
        mockSync.mockResolvedValue({
            success: true,
            githubPushed: true,
            cdnPublished: false,
            cdnError: 'Adobe rejected the request (401).',
        });
        const ensureDaLiveSession = jest.fn(async () => ({ authenticated: false, cancelled: true }));

        const { project, persist, result } = run({ ensureDaLiveSession });
        const outcome = await result;

        expect(mockSync).toHaveBeenCalledTimes(1);
        expect(outcome).toMatchObject({ success: true, cdnError: NO_DALIVE_SESSION_MESSAGE });
        // The tile stays amber: the live config.json is the old one, which is
        // what stale means, and the published baseline is not advanced.
        expect(project).toHaveProperty('edsStorefrontStatusSummary', 'stale');
        expect(project.edsStorefrontState).toBeUndefined();
        expect(persist).toHaveBeenCalledWith(project);
    });

    it('a CDN failure under a good session keeps the CDN\'s own reason, and is stale too', async () => {
        mockSync.mockResolvedValue({ success: true, githubPushed: true, cdnError: 'CDN said no' });

        const { project, result } = run({ ensureDaLiveSession: async () => ({ authenticated: true }) });
        const outcome = await result;

        expect(outcome).toMatchObject({ cdnError: 'CDN said no' });
        expect(project).toHaveProperty('edsStorefrontStatusSummary', 'stale');
    });

    it('without a guard (nobody to ask) the publish runs as before', async () => {
        const { project, result } = run();
        await result;

        expect(mockSync).toHaveBeenCalledTimes(1);
        expect(project).toHaveProperty('edsStorefrontStatusSummary', 'published');
    });
});

/** Every way the project can fail to say where its storefront lives. */
describe('extractRepublishParams — what a project must carry', () => {
    it.each([
        ['an absent instance map', undefined, 'EDS metadata missing - no GitHub repository configured'],
        ['no repository', { githubRepo: undefined }, 'EDS metadata missing - no GitHub repository configured'],
        ['a repository with no name', { githubRepo: 'me/' }, 'Invalid repository format'],
        ['a repository with no owner', { githubRepo: '/shop' }, 'Invalid repository format'],
        ['no DA.live org', { daLiveOrg: undefined }, 'DA.live configuration missing'],
    ])('refuses %s', (_label, metadata, error) => {
        const project = metadata
            ? edsProject(metadata)
            : createMockProject({ name: 'p', path: '/p', componentInstances: undefined });

        expect(extractRepublishParams(project)).toStrictEqual({ success: false, error });
    });

    it('refuses a storefront with no folder on disk', () => {
        const project = edsProject();
        const instance = project.componentInstances?.['eds-storefront'];
        if (instance) instance.path = undefined;

        expect(extractRepublishParams(project)).toStrictEqual({
            success: false,
            error: 'EDS component path not found',
        });
    });

    it('refuses an empty instance map without reading a storefront that is not there', () => {
        const project = createMockProject({ name: 'p', path: '/p', componentInstances: {} });

        expect(extractRepublishParams(project)).toStrictEqual({
            success: false,
            error: 'EDS metadata missing - no GitHub repository configured',
        });
    });
});

describe('republishStorefrontConfig — each step and what it answers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGenerate.mockReturnValue({ success: true, content: '{"x":1}' });
        mockSync.mockResolvedValue({ success: true, githubPushed: true, cdnPublished: true, cdnVerified: true });
        (fsPromises.writeFile as jest.Mock).mockResolvedValue(undefined);
    });

    it('a project with no storefront answers the extractor\'s reason and generates nothing', async () => {
        const bare = createMockProject({ name: 'p', path: '/p', componentInstances: {} });
        const outcome = await run({}, bare).result;

        expect(outcome).toStrictEqual({
            success: false,
            error: 'EDS metadata missing - no GitHub repository configured',
        });
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('a generator failure answers the generator\'s reason and writes nothing', async () => {
        mockGenerate.mockReturnValue({ success: false, error: 'no backend' });
        const outcome = await run().result;

        expect(outcome).toStrictEqual({ success: false, error: 'no backend' });
        expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('a generator that names no reason gets one', async () => {
        mockGenerate.mockReturnValue({ success: false });

        expect(await run().result).toStrictEqual({
            success: false,
            error: 'Failed to generate config.json',
        });
    });

    it('a generator that succeeds with nothing to write is a failure too', async () => {
        mockGenerate.mockReturnValue({ success: true, content: '' });

        expect(await run().result).toStrictEqual({
            success: false,
            error: 'Failed to generate config.json',
        });
        expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('writes config.json into the storefront folder, then pushes from that folder', async () => {
        const onProgress = jest.fn();
        const secrets = createMockSecretStorage().secrets;
        const { project, result } = run({ onProgress, secrets });
        await result;

        expect(fsPromises.writeFile).toHaveBeenCalledWith('/p/storefront/config.json', '{"x":1}', 'utf-8');
        expect(mockSync).toHaveBeenCalledWith({
            componentPath: '/p/storefront',
            repoOwner: 'me',
            repoName: 'shop',
            logger,
            secrets,
            onProgress,
        });
        expect(project).toHaveProperty('edsStorefrontStatusSummary', 'published');
    });

    it('a failed write answers why and pushes nothing', async () => {
        (fsPromises.writeFile as jest.Mock).mockRejectedValue(new Error('disk full'));

        expect(await run().result).toStrictEqual({
            success: false,
            error: 'Failed to write config.json: disk full',
        });
        expect(mockSync).not.toHaveBeenCalled();
    });

    it('a failed push answers the push\'s reason and what did land', async () => {
        mockSync.mockResolvedValue({ success: false, error: 'push rejected', githubPushed: false });

        expect(await run().result).toStrictEqual({
            success: false,
            error: 'push rejected',
            githubPushed: false,
            cdnPublished: undefined,
            cdnVerified: undefined,
        });
    });

    it('a failed push that names no reason gets one', async () => {
        mockSync.mockResolvedValue({ success: false });

        expect(await run().result).toMatchObject({
            success: false,
            error: 'Failed to sync config.json to remote',
        });
    });

    it('a published republish answers what landed and carries no CDN error', async () => {
        expect(await run().result).toStrictEqual({
            success: true,
            githubPushed: true,
            cdnPublished: true,
            cdnVerified: true,
            cdnError: undefined,
        });
    });

    it('with nobody to ask, a CDN failure keeps the CDN\'s own reason and leaves it stale', async () => {
        mockSync.mockResolvedValue({ success: true, githubPushed: true, cdnError: 'CDN said no' });
        const { project, result } = run();

        expect(await result).toMatchObject({ success: true, cdnError: 'CDN said no' });
        expect(project).toHaveProperty('edsStorefrontStatusSummary', 'stale');
        expect(updateStorefrontState).not.toHaveBeenCalled();
    });

    it('an unexpected throw answers its message', async () => {
        mockGenerate.mockImplementation(() => {
            throw new Error('kaboom');
        });

        expect(await run().result).toStrictEqual({ success: false, error: 'kaboom' });
    });

    it('tells the SC each step in order', async () => {
        const onProgress = jest.fn();
        await run({ onProgress }).result;

        expect(onProgress.mock.calls.map(([m]) => m)).toStrictEqual([
            'Extracting configuration',
            'Generating config.json',
            'Writing config.json',
            'Syncing to GitHub and CDN',
        ]);
    });
});

/**
 * The published baseline is the configs the publish was GENERATED from, read
 * before the push (2026-08-10, see `updateStorefrontState`). A Configure save that
 * lands while the push is in flight must not be recorded as published.
 */
describe('republishStorefrontConfig — what it records as published', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGenerate.mockReturnValue({ success: true, content: '{}' });
        (fsPromises.writeFile as jest.Mock).mockResolvedValue(undefined);
    });

    it('records the configs from before the push, not ones saved during it', async () => {
        const project = edsProject();
        project.componentConfigs = { 'eds-storefront': { scope: 'before' } };
        mockSync.mockImplementation(async () => {
            project.componentConfigs = { 'eds-storefront': { scope: 'during' } };
            return { success: true };
        });

        await run({}, project).result;

        expect(updateStorefrontState).toHaveBeenCalledWith(project, {
            'eds-storefront': { scope: 'before' },
        });
    });

    it('records an empty baseline for a project with no configs', async () => {
        mockSync.mockResolvedValue({ success: true });
        const project = edsProject();
        project.componentConfigs = undefined;

        await run({}, project).result;

        expect(updateStorefrontState).toHaveBeenCalledWith(project, {});
    });
});
