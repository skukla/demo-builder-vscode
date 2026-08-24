/**
 * executePhaseHelixConfig — placeholder-stub wiring (creation path).
 *
 * The reset path carries stubs inside its bulk override commit
 * (edsResetRepoHelper.placeholderStubs.test.ts); creation has no such commit,
 * so phase 2 makes one dedicated `commitTreeToBranch` call. This suite pins
 * that call's ARGUMENTS (per the mock-audit rule) and that a failed stub
 * commit stays non-fatal — it costs console cosmetics, never the setup.
 */

import type { HandlerContext } from '@/types/handlers';

jest.mock('@/features/eds/services/fstabGenerator', () => ({
    generateFstabContent: jest.fn().mockReturnValue('mock-fstab'),
}));

jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest
        .fn()
        .mockResolvedValue({ success: true, blocksCount: 0, blockIds: [] }),
}));

jest.mock('@/features/eds/services/inspectorHelpers', () => ({
    generateInspectorTreeEntries: jest.fn().mockResolvedValue([]),
    installInspectorTagging: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/features/eds/services/pdp/pdp404HandlerPublisher', () => ({
    installSmart404Handler: jest.fn().mockResolvedValue({ installed: false, reason: 'no-overlay' }),
}));

jest.mock('@/features/eds/services/quickEditPublisher', () => ({
    installQuickEdit: jest.fn().mockResolvedValue({ installed: true }),
}));

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    addPdpCaveat: jest.fn(),
    describeSmart404Skip: jest.fn().mockReturnValue('skip'),
}));

jest.mock('@/features/components/services/blockLibraryLoader', () => ({
    getBlockLibrarySource: jest.fn(),
    getBlockLibraryName: jest.fn(),
    getBlockLibraryContentSource: jest.fn(),
    isBlockLibraryAvailableForPackage: jest.fn().mockReturnValue(true),
}));

import { executePhaseHelixConfig } from '@/features/eds/handlers/storefrontSetup/storefrontSetupPhase2';
import {
    PLACEHOLDER_STUB_PATHS,
    buildPlaceholderStubJson,
} from '@/features/eds/services/placeholderStubs';

const EDS_CONFIG = {
    daLiveOrg: 'acme',
    daLiveSite: 'shop',
     
} as any;

const REPO_INFO = { repoOwner: 'me', repoName: 'shop' };

function makeContext(): HandlerContext {
    return {
        logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
        sendMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as HandlerContext;
}

function makeGithubFileOps(overrides: Record<string, unknown> = {}) {
    return {
        getFileContent: jest.fn().mockResolvedValue(null),
        createOrUpdateFile: jest.fn().mockResolvedValue(undefined),
        commitTreeToBranch: jest.fn().mockResolvedValue('sha123'),
        ...overrides,
         
    } as any;
}

describe('executePhaseHelixConfig — placeholder stubs (creation)', () => {
    it('commits one stub blob per requested sheet in a single tree commit', async () => {
        const githubFileOps = makeGithubFileOps();

        await executePhaseHelixConfig(
            makeContext(),
            EDS_CONFIG,
             
            { githubFileOps } as any,
             
            REPO_INFO as any,
            new AbortController().signal
        );

        const stubCall = githubFileOps.commitTreeToBranch.mock.calls.find((c: unknown[]) =>
            String(c[4]).includes('placeholder stub')
        );
        expect(stubCall).toBeDefined();
        const [owner, repo, branch, entries] = stubCall as [
            string,
            string,
            string,
            Array<{ path: string; content: string; mode: string; type: string }>,
            string,
        ];
        expect(owner).toBe('me');
        expect(repo).toBe('shop');
        expect(branch).toBe('main');
        expect(entries.map((e) => e.path).sort()).toEqual(
            PLACEHOLDER_STUB_PATHS.map((p) => `${p}.json`).sort()
        );
        expect(entries[0].content).toBe(buildPlaceholderStubJson());
    });

    it('a failed stub commit warns and never fails the phase', async () => {
        const githubFileOps = makeGithubFileOps({
            commitTreeToBranch: jest.fn().mockRejectedValue(new Error('boom')),
        });
        const context = makeContext();

        await expect(
            executePhaseHelixConfig(
                context,
                EDS_CONFIG,
                 
                { githubFileOps } as any,
                 
                REPO_INFO as any,
                new AbortController().signal
            )
        ).resolves.toBeDefined();

        expect(context.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Placeholder stubs skipped')
        );
    });
});
