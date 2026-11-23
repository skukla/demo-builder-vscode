/**
 * Storefront Setup Phases — a project imported from a demo bundle (EDS-72).
 *
 * The orchestrator's part of it: the template guard accepts a bundle in place of a
 * template, phase 1 makes the project's own repository from the bundle instead of
 * generating one, the content pipeline reads block definitions from that repository
 * and copies the sender's pages, and the result carries the import commit for
 * creation to record. Brand projects are pinned by the neighbouring suites.
 */

jest.setTimeout(5000);

// =============================================================================
// Mocks — before the imports of the module under test
// =============================================================================

// Its own wall rather than `storefrontSetupPhases.sharedMocks`: that file's
// blockLibraryLoader double answers two functions, and the library list this
// suite drives goes through a third.
jest.mock('@/features/components/services/blockLibraryLoader', () => ({
    // Pass-through: the always-included libraries are tested where they are added.
    withAlwaysIncludedBlockLibraries: (selected?: string[]) => selected ?? [],
    getBlockLibrarySource: jest.fn(),
    getBlockLibraryName: jest.fn(),
    isBlockLibraryAvailableForPackage: jest.fn().mockReturnValue(true),
}));

jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest
        .fn()
        .mockResolvedValue({ success: true, blocksCount: 0, blockIds: [] }),
}));

jest.mock('@/features/eds/services/edsPipeline', () => ({
    executeEdsPipeline: jest.fn(),
}));

const mockPublishAuthoredListStep = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/eds/services/catalogMenu/catalogMenuStep', () => ({
    ...jest.requireActual('@/features/eds/services/catalogMenu/catalogMenuStep'),
    publishAuthoredListStep: (...a: unknown[]) => mockPublishAuthoredListStep(...a),
}));

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    ensureDaLiveAuth: jest.fn(),
    configureDaLivePermissions: jest.fn().mockResolvedValue({ success: true }),
    getDaLiveAuthService: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue('mock-token'),
        getUserEmail: jest.fn().mockResolvedValue('test@example.com'),
    }),
    addPdpCaveat: jest.fn(),
    describeSmart404Skip: jest.fn(() => 'smart-404 skipped'),
    // Reached only when an overlay URL was configured and its registration
    // failed — which is every run in this suite that sets one, because the
    // Config Service is not stood up here.
    surfaceOverlayRegistrationFailure: jest.fn(),
}));

const mockCreateFromTemplate = jest.fn();
jest.mock('@/features/eds/services/github/githubRepoLifecycle', () => ({
    GitHubRepoLifecycle: jest.fn().mockImplementation(() => ({
        createFromTemplate: mockCreateFromTemplate,
        waitForContent: jest.fn(),
    })),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { QUICK: 5000 },
}));

// The patch ledgers are a network read with their own suite; every one read here.
jest.mock('@/features/eds/services/patches/shippedPatchLedger', () => ({
    readShippedPatches: jest.fn().mockResolvedValue({ live: [], retired: [], complete: true }),
}));

global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

// =============================================================================
// Imports (after the mocks)
// =============================================================================

import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    createSetupContext,
    createEdsConfig,
    executeStorefrontSetupPhases,
} from './storefrontSetupPhases.testUtils';
import type { SetupServices } from '@/features/eds/handlers/storefrontSetup/storefrontSetupTypes';
import { executeEdsPipeline } from '@/features/eds/services/edsPipeline';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createMockCommandExecutor } from '../../../../helpers/commandExecutorFake';
import { createMockPipelineResult } from '../../../../helpers/pipelineResultFake';

const mockExecuteEdsPipeline = executeEdsPipeline as jest.MockedFunction<typeof executeEdsPipeline>;

const SENDER_PAGES = { org: 'sender', site: 'kukla-bodea', indexPath: '/query-index.json' };

function bundleOnDisk(): string {
    const zip = new AdmZip();
    const files: Record<string, string> = {
        'scripts/scripts.js': 'export {};',
        '404.html': '<html>',
        'head.html': '<meta>',
        'demo.demo-builder.json': JSON.stringify({ kind: 'demo', version: 2, name: 'Bodea', contentSource: SENDER_PAGES }),
    };
    for (const [name, text] of Object.entries(files)) {
        zip.addFile(`bodea-demo-bundle/storefront/${name}`, Buffer.from(text, 'utf-8'));
    }
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-phases-')), 'bodea-demo-bundle.zip');
    zip.writeZip(file);
    return file;
}

/** GitHub for the run: a new empty repository, a push answering its commit, and the reads phase 2 makes. */
function bundleServices(): { services: Partial<SetupServices>; createEmptyRepository: jest.Mock } {
    const createEmptyRepository = jest.fn().mockResolvedValue({ fullName: 'test-owner/test-repo', name: 'test-repo', defaultBranch: 'main' });
    const services = {
        githubAppService: {
            getInstallUrl: () => 'https://github.com/apps/aem-code-sync/installations/select_target',
            isAppInstalled: jest.fn().mockResolvedValue({ isInstalled: true }),
        },
        githubRepoLifecycle: {
            createEmptyRepository,
            createFromTemplate: mockCreateFromTemplate,
            waitForContent: jest.fn().mockResolvedValue(true),
            setTemplateFlag: jest.fn(),
        },
        githubFileOps: {
            getFileContent: jest.fn().mockResolvedValue(null),
            createOrUpdateFile: jest.fn().mockResolvedValue(undefined),
            getLatestCommitSha: jest.fn().mockResolvedValue('f00dfeed00000000000000000000000000000000'),
            treeCommits: {
                getBranchInfo: jest.fn().mockResolvedValue({ commitSha: 'head', treeSha: 't0' }),
                createBlob: jest.fn(),
                createTree: jest.fn().mockResolvedValue('tree-1'),
                createCommit: jest.fn().mockResolvedValue('import-commit'),
                updateBranchRef: jest.fn().mockResolvedValue(undefined),
            },
        },
    } as unknown as Partial<SetupServices>;
    return { services, createEmptyRepository };
}

beforeEach(() => {
    jest.clearAllMocks();
    ServiceLocator.setCommandExecutor(createMockCommandExecutor());
    mockExecuteEdsPipeline.mockResolvedValue(createMockPipelineResult({ contentFilesCopied: 0, libraryPaths: [] }));
});

describe('a project imported from a demo bundle', () => {
    it("makes the project's own repository from the bundle, copies the sender's pages, and answers the import commit", async () => {
        const { services, createEmptyRepository } = bundleServices();
        const edsConfig = createEdsConfig({
            createdRepo: undefined,
            bundleSource: { bundlePath: bundleOnDisk() },
            codePatches: ['sku-encoding'],
            codePatchSource: { owner: 'skukla', repo: 'eds-demo-patches', path: 'patches' },
        });

        const result = await executeStorefrontSetupPhases(createSetupContext(), edsConfig, new AbortController().signal, undefined, services);

        expect(result).toMatchObject({ success: true, repoOwner: 'test-owner', repoName: 'test-repo', bundleImport: { commit: 'import-commit', contentSource: SENDER_PAGES } });
        expect(createEmptyRepository).toHaveBeenCalledWith('test-repo', false, 'test-org');
        expect(mockCreateFromTemplate).not.toHaveBeenCalled();
        const input = mockExecuteEdsPipeline.mock.calls[0][0];
        // The blocks are the bundle's: the library reads the project's own repository.
        expect(input).toMatchObject({ repoOwner: 'test-owner', repoName: 'test-repo', contentSource: SENDER_PAGES, skipContent: false });
        expect(input.codePatches).toBeUndefined();
        expect(input.codePatchSource).toBeUndefined();
    });

    it('starts with no template named, since the bundle is the source', async () => {
        const { services } = bundleServices();
        const edsConfig = createEdsConfig({
            createdRepo: undefined,
            templateOwner: undefined,
            templateRepo: undefined,
            bundleSource: { bundlePath: bundleOnDisk() },
        });

        const result = await executeStorefrontSetupPhases(createSetupContext(), edsConfig, new AbortController().signal, undefined, services);

        expect(result.success).toBe(true);
    });

    it('stops before anything is created when the bundle is gone', async () => {
        const { services, createEmptyRepository } = bundleServices();
        const edsConfig = createEdsConfig({ createdRepo: undefined, bundleSource: { bundlePath: '/nowhere/x.zip' } });

        const result = await executeStorefrontSetupPhases(createSetupContext(), edsConfig, new AbortController().signal, undefined, services);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/^The imported demo's file could not be read/);
        expect(createEmptyRepository).not.toHaveBeenCalled();
    });
});
