/**
 * Storefront Setup Phases — the guards before the first write, and what the
 * content pipeline is actually told to do.
 *
 * Three questions this suite answers, none of which a passing run reveals:
 * whether setup refuses to start when it cannot name an owner or a template;
 * whether the pipeline is handed the right instructions (skip content, clear
 * content, purge the cache, pre-warm THIS project's catalog and not the last
 * one opened); and whether an abort raised half way through actually stops it.
 */

jest.setTimeout(5000);

// =============================================================================
// Mocks — before the imports of the module under test
// =============================================================================

// Its own wall rather than `storefrontSetupPhases.sharedMocks`: that file's
// blockLibraryLoader double answers two functions, and the library content
// sources this suite drives come from a third.
jest.mock('@/features/components/services/blockLibraryLoader', () => ({
    getBlockLibrarySource: jest.fn(),
    getBlockLibraryName: jest.fn(),
    isBlockLibraryAvailableForPackage: jest.fn().mockReturnValue(true),
    getBlockLibraryContentSource: jest.fn((id: string) =>
        id === 'known-library' ? { org: 'library-org', site: 'library-site' } : undefined
    ),
}));

jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest
        .fn()
        .mockResolvedValue({ success: true, blocksCount: 0, blockIds: [] }),
}));

jest.mock('@/features/eds/services/edsPipeline', () => ({
    executeEdsPipeline: jest.fn(),
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
jest.mock('@/features/eds/services/github/githubRepoOperations', () => ({
    GitHubRepoOperations: jest.fn().mockImplementation(() => ({
        createFromTemplate: mockCreateFromTemplate,
        waitForContent: jest.fn(),
        resetToTemplate: jest.fn(),
    })),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { QUICK: 5000 },
}));

global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

// =============================================================================
// Imports (after the mocks)
// =============================================================================

import {
    createSetupContext,
    createEdsConfig,
    executeStorefrontSetupPhases,
} from './storefrontSetupPhases.testUtils';
import type { SetupServices } from '@/features/eds/handlers/storefrontSetup/storefrontSetupTypes';
import type { StorefrontSetupStartPayload } from '@/types/webviewRequests';
import { executeEdsPipeline } from '@/features/eds/services/edsPipeline';
import { installBlockCollections } from '@/features/eds/services/blockCollectionHelpers';
import { getBlockLibrarySource } from '@/features/components/services/blockLibraryLoader';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createMockCommandExecutor } from '../../../../helpers/commandExecutorFake';

const mockExecuteEdsPipeline = executeEdsPipeline as jest.MockedFunction<typeof executeEdsPipeline>;

// =============================================================================
// Helpers
// =============================================================================

/**
 * The App is installed unless a test says otherwise.
 *
 * `codeStatus: 404` rides along with the negative answer because that is the
 * ONLY shape that halts a run: Helix knowing the site and reporting no code
 * sync for it. An undetermined answer — a refused credential, a site still
 * settling — is a failed check, not a missing App, and must not stop a setup
 * that otherwise worked.
 */
function services(isInstalled = true): Partial<SetupServices> {
    return {
        githubAppService: {
            getInstallUrl: () =>
                'https://github.com/apps/aem-code-sync/installations/select_target',
            isAppInstalled: jest
                .fn()
                .mockResolvedValue(
                    isInstalled ? { isInstalled: true } : { isInstalled: false, codeStatus: 404 }
                ),
        },
    };
}

/** Run one setup to completion and answer with its result. */
async function runSetup(
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    options?: {
        blockLibraries?: string[];
        currentProject?: unknown;
        appInstalled?: boolean;
        signal?: AbortSignal;
    }
) {
    const context = createSetupContext(options?.currentProject);
    return executeStorefrontSetupPhases(
        context,
        edsConfig,
        options?.signal ?? new AbortController().signal,
        options?.blockLibraries ? { selectedBlockLibraries: options.blockLibraries } : undefined,
        services(options?.appInstalled ?? true)
    );
}

/** The instruction object `executeEdsPipeline` was handed. */
function pipelineInput(): Record<string, unknown> {
    return mockExecuteEdsPipeline.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
}

/** A project whose recorded storefront repo is `owner/name`. */
function projectFor(githubRepo: string) {
    return {
        name: 'demo-project',
        componentInstances: { 'eds-storefront': { metadata: { githubRepo } } },
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    ServiceLocator.setCommandExecutor(createMockCommandExecutor());
    mockExecuteEdsPipeline.mockResolvedValue({
        success: true,
        contentFilesCopied: 0,
        libraryPaths: [],
    });
});

// =============================================================================
// Tests
// =============================================================================

describe('setup refuses to start when it cannot name the repository', () => {
    it('stops when no GitHub owner is configured and none can be inferred', async () => {
        const result = await runSetup(createEdsConfig({ githubOwner: undefined }));

        expect(result).toEqual({
            success: false,
            error: 'GitHub owner not configured. Please complete GitHub authentication.',
        });
        expect(mockExecuteEdsPipeline).not.toHaveBeenCalled();
    });

    it('stops when the GitHub auth record carries no user', async () => {
        // Repo-selection can leave a githubAuth with no signed-in user on it;
        // reading through it must not throw before the guard can answer.
        const result = await runSetup(
            createEdsConfig({
                githubOwner: undefined,
                githubAuth: {} as StorefrontSetupStartPayload['edsConfig']['githubAuth'],
            })
        );

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/GitHub owner not configured/);
    });

    it('falls back to the signed-in GitHub user when no owner was chosen', async () => {
        // An SC who never picked an org gets their own namespace, not a refusal.
        const result = await runSetup(
            createEdsConfig({
                githubOwner: undefined,
                githubAuth: {
                    user: { login: 'signed-in-user' },
                } as StorefrontSetupStartPayload['edsConfig']['githubAuth'],
            })
        );

        expect(result.success).toBe(true);
        expect(mockExecuteEdsPipeline).toHaveBeenCalled();
    });

    it('starts anyway when the owner is known but the auth record has no user', async () => {
        // The identity is logged alongside the target namespace; reading it
        // through a githubAuth with no user must not take the run down.
        const result = await runSetup(
            createEdsConfig({
                githubOwner: 'test-owner',
                githubAuth: {} as StorefrontSetupStartPayload['edsConfig']['githubAuth'],
            })
        );

        expect(result.success).toBe(true);
    });

    it('stops when the stack names no template owner', async () => {
        const result = await runSetup(createEdsConfig({ templateOwner: undefined }));

        expect(result).toEqual({
            success: false,
            error: 'GitHub template not configured. Please check your stack configuration.',
        });
        expect(mockExecuteEdsPipeline).not.toHaveBeenCalled();
    });

    it('stops when the stack names no template repo', async () => {
        const result = await runSetup(createEdsConfig({ templateRepo: undefined }));

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/template not configured/);
        expect(mockExecuteEdsPipeline).not.toHaveBeenCalled();
    });
});

describe('whether content is copied at all', () => {
    it('skips content when the package names no source', async () => {
        await runSetup(createEdsConfig({ contentSource: undefined }));

        expect(pipelineInput().skipContent).toBe(true);
    });

    it('skips content for a site the SC picked and did not ask to reset', async () => {
        // Their existing site keeps its content: setup is being re-run over it.
        await runSetup(
            createEdsConfig({
                contentSource: { org: 'src-org', site: 'src-site' },
                selectedSite: { id: 'existing-site', name: 'Existing site' },
            })
        );

        expect(pipelineInput().skipContent).toBe(true);
    });

    it('copies content into a picked site when the SC asked to reset it', async () => {
        await runSetup(
            createEdsConfig({
                contentSource: { org: 'src-org', site: 'src-site' },
                selectedSite: { id: 'existing-site', name: 'Existing site' },
                resetSiteContent: true,
            })
        );

        expect(pipelineInput().skipContent).toBe(false);
        expect(pipelineInput().clearExistingContent).toBe(true);
    });

    it('copies content into a brand new site', async () => {
        await runSetup(createEdsConfig({ contentSource: { org: 'src-org', site: 'src-site' } }));

        expect(pipelineInput().skipContent).toBe(false);
        expect(pipelineInput().clearExistingContent).toBe(false);
    });
});

describe('whether the CDN cache is purged', () => {
    // Purging costs a round trip and is pointless on a site nothing overwrote,
    // but skipping it after an overwrite serves the OLD pages from the edge.
    it('purges after a repository reset', async () => {
        await runSetup(createEdsConfig({ resetToTemplate: true, repoMode: 'new' }));

        expect(pipelineInput().purgeCache).toBe(true);
    });

    it('purges after a content reset', async () => {
        await runSetup(
            createEdsConfig({
                contentSource: { org: 'src-org', site: 'src-site' },
                selectedSite: { id: 'existing-site', name: 'Existing site' },
                resetSiteContent: true,
            })
        );

        expect(pipelineInput().purgeCache).toBe(true);
    });

    it('does not purge when nothing was overwritten', async () => {
        await runSetup(createEdsConfig());

        expect(pipelineInput().purgeCache).toBe(false);
    });
});

describe('which project the catalog pre-warm targets', () => {
    /**
     * `storefront-setup-start` is registered by the WIZARD as well as the
     * dashboard, and in the wizard the project being created does not exist
     * yet — `getCurrentProject()` there answers with whatever was last open.
     * Unguarded, an SC with one project who creates a second storefront
     * pre-warms the FIRST project's catalog onto the second's site (measured
     * 2026-08-18, where it surfaced only as an unexplained "No index was found").
     */
    it('passes the project when it is the storefront being set up', async () => {
        const project = projectFor('test-owner/test-repo');

        await runSetup(createEdsConfig(), { currentProject: project });

        expect(pipelineInput().project).toBe(project);
    });

    it('matches the repo case-insensitively, as GitHub does', async () => {
        const project = projectFor('Test-Owner/Test-Repo');

        await runSetup(createEdsConfig(), { currentProject: project });

        expect(pipelineInput().project).toBe(project);
    });

    it('passes no project when the open one is a different storefront', async () => {
        await runSetup(createEdsConfig(), {
            currentProject: projectFor('other-owner/other-repo'),
        });

        expect(pipelineInput().project).toBeUndefined();
    });

    it('passes no project on the create path, where none exists yet', async () => {
        await runSetup(createEdsConfig(), { currentProject: null });

        expect(pipelineInput().project).toBeUndefined();
    });
});

describe('the rest of the pipeline instruction', () => {
    it('names the repo, the site, the template and the block library work', async () => {
        await runSetup(
            createEdsConfig({
                contentSource: { org: 'src-org', site: 'src-site' },
                byomOverlayUrl: 'https://overlay.example/render-pdp',
            }),
            { blockLibraries: ['known-library'] }
        );

        expect(pipelineInput()).toEqual(
            expect.objectContaining({
                repoOwner: 'test-owner',
                repoName: 'test-repo',
                daLiveOrg: 'test-org',
                daLiveSite: 'test-site',
                templateOwner: 'template-owner',
                templateRepo: 'template-repo',
                contentSource: { org: 'src-org', site: 'src-site' },
                byomOverlayUrl: 'https://overlay.example/render-pdp',
                includeBlockLibrary: true,
            })
        );
    });

    it('carries a content source for each library that publishes doc pages', async () => {
        // A library with no doc pages contributes nothing rather than an
        // undefined entry the pipeline would then try to read.
        await runSetup(createEdsConfig(), {
            blockLibraries: ['known-library', 'library-without-docs'],
        });

        // Length asserted separately: `toEqual` treats a trailing undefined in
        // an array as absent, so a list that gained an empty slot would pass.
        const sources = pipelineInput().libraryContentSources as unknown[];
        expect(sources).toHaveLength(1);
        expect(sources[0]).toEqual({ org: 'library-org', site: 'library-site' });
    });

    it('hands the pipeline the collaborators it runs on', async () => {
        await runSetup(createEdsConfig());

        expect(mockExecuteEdsPipeline).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                logger: expect.anything(),
                daLiveContentOps: expect.anything(),
                githubFileOps: expect.anything(),
                helixService: expect.anything(),
            }),
            expect.any(Function)
        );
    });

    it('carries the block ids phase two installed', async () => {
        // The pipeline publishes the doc pages for exactly these blocks; losing
        // the list publishes none of them and the library looks empty.
        (getBlockLibrarySource as jest.Mock).mockReturnValue({
            owner: 'library-org',
            repo: 'blocks',
            branch: 'main',
        });
        (installBlockCollections as jest.Mock).mockResolvedValue({
            success: true,
            blocksCount: 2,
            blockIds: ['cards', 'hero'],
        });

        await runSetup(createEdsConfig(), { blockLibraries: ['known-library'] });

        expect(pipelineInput().blockCollectionIds).toEqual(['cards', 'hero']);
    });

    it('creates the new repository under the name the SC chose', async () => {
        // The wizard's "Create Repository" button fills `createdRepo`; without
        // it phase 1 creates the repo itself, and the name it asks GitHub for
        // comes from this module — an empty one creates a repo called
        // `undefined` in the SC's namespace.
        mockCreateFromTemplate.mockResolvedValue({
            htmlUrl: 'https://github.com/test-owner/test-repo',
            fullName: 'test-owner/test-repo',
        });

        await runSetup(createEdsConfig({ createdRepo: undefined, repoMode: 'new' }));

        expect(mockCreateFromTemplate).toHaveBeenCalledWith(
            'template-owner',
            'template-repo',
            'test-repo',
            false,
            'test-org'
        );
        expect(pipelineInput().repoOwner).toBe('test-owner');
        expect(pipelineInput().repoName).toBe('test-repo');
    });

    it('carries no content sources when no libraries were selected', async () => {
        await runSetup(createEdsConfig());

        expect(pipelineInput().libraryContentSources).toEqual([]);
    });
});

describe('when the run does not finish', () => {
    it('reports the pipeline failure and the repo it was working on', async () => {
        mockExecuteEdsPipeline.mockResolvedValue({
            success: false,
            error: 'DA.live refused the copy',
            contentFilesCopied: 0,
            libraryPaths: [],
        });

        const result = await runSetup(createEdsConfig());

        expect(result).toEqual({
            success: false,
            error: 'DA.live refused the copy',
            repoOwner: 'test-owner',
            repoName: 'test-repo',
            repoUrl: 'https://github.com/test-owner/test-repo',
        });
    });

    it('names the phase when the pipeline failed without saying why', async () => {
        mockExecuteEdsPipeline.mockResolvedValue({
            success: false,
            contentFilesCopied: 0,
            libraryPaths: [],
        });

        const result = await runSetup(createEdsConfig());

        expect(result.error).toBe('Content pipeline failed');
    });

    it('stops before the pipeline when the run was cancelled during configuration', async () => {
        // Cancel arrives while phase 3 is talking to the Config Service. The
        // pipeline is the expensive part — four minutes of writes — so the
        // check between the two has to hold.
        const controller = new AbortController();
        const setupServices = services(true);
        (setupServices.githubAppService?.isAppInstalled as jest.Mock).mockImplementation(
            async () => {
                controller.abort();
                return { isInstalled: true };
            }
        );
        const context = createSetupContext();

        const result = await executeStorefrontSetupPhases(
            context,
            createEdsConfig(),
            controller.signal,
            undefined,
            setupServices
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Operation cancelled');
        expect(mockExecuteEdsPipeline).not.toHaveBeenCalled();
    });

    it('stops before announcing completion when the run was cancelled mid-pipeline', async () => {
        const controller = new AbortController();
        mockExecuteEdsPipeline.mockImplementation(async () => {
            controller.abort();
            return { success: true, contentFilesCopied: 0, libraryPaths: [] };
        });
        const context = createSetupContext();

        const result = await executeStorefrontSetupPhases(
            context,
            createEdsConfig(),
            controller.signal,
            undefined,
            services()
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Operation cancelled');
        const completed = (context.sendMessage as jest.Mock).mock.calls.some(
            ([, payload]) => (payload as { phase?: string })?.phase === 'complete'
        );
        expect(completed).toBe(false);
    });

    it('hands back the code-sync verdict instead of running the pipeline', async () => {
        // Phase 3 stops the run when the AEM Code Sync App is not installed.
        // Copying content into a repo the edge cannot see wastes the SC's time
        // and leaves content they then have to clear.
        const result = await runSetup(createEdsConfig(), { appInstalled: false });

        expect(result.success).toBe(false);
        expect(mockExecuteEdsPipeline).not.toHaveBeenCalled();
    });

    it('hands back phase one own verdict for an existing repo the App cannot see', async () => {
        const result = await runSetup(
            createEdsConfig({
                repoMode: 'existing',
                existingRepo: 'test-owner/existing-repo',
                createdRepo: undefined,
                resetToTemplate: false,
            }),
            { appInstalled: false }
        );

        expect(result.success).toBe(false);
        expect(mockExecuteEdsPipeline).not.toHaveBeenCalled();
    });

    it('stops at phase one when the App check could not be made at all', async () => {
        // An undetermined check halts phase 1 but NOT phase 3, so this is the
        // case that proves phase 1's verdict is returned rather than walked
        // past: not signed in to GitHub, so nothing downstream can succeed.
        const setupServices = services();
        (setupServices.githubAppService?.isAppInstalled as jest.Mock).mockResolvedValue({
            isInstalled: false,
            transient: true,
            noCredential: true,
            httpStatus: 401,
        });
        const context = createSetupContext();

        const result = await executeStorefrontSetupPhases(
            context,
            createEdsConfig({
                repoMode: 'existing',
                existingRepo: 'test-owner/existing-repo',
                createdRepo: undefined,
                resetToTemplate: false,
            }),
            new AbortController().signal,
            undefined,
            setupServices
        );

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/signed in to GitHub/i);
        expect(mockExecuteEdsPipeline).not.toHaveBeenCalled();
    });
});

describe('when the run does finish', () => {
    it('says the site is live once library pages were published', async () => {
        mockExecuteEdsPipeline.mockResolvedValue({
            success: true,
            contentFilesCopied: 3,
            libraryPaths: ['/docs/library/cards'],
        });
        const context = createSetupContext();

        const result = await executeStorefrontSetupPhases(
            context,
            createEdsConfig(),
            new AbortController().signal,
            undefined,
            services()
        );

        expect(result.success).toBe(true);
        const [, payload] =
            (context.sendMessage as jest.Mock).mock.calls
                .reverse()
                .find(([type]) => type === 'storefront-setup-progress') ?? [];
        expect(payload).toEqual({
            phase: 'complete',
            message: 'Site is live!',
            progress: 100,
        });
    });

    it('says the publish is complete when there were no library pages', async () => {
        const context = createSetupContext();

        await executeStorefrontSetupPhases(
            context,
            createEdsConfig(),
            new AbortController().signal,
            undefined,
            services()
        );

        const [, payload] =
            (context.sendMessage as jest.Mock).mock.calls
                .reverse()
                .find(([type]) => type === 'storefront-setup-progress') ?? [];
        expect(payload).toEqual({
            phase: 'complete',
            message: 'Content publish complete',
            progress: 100,
        });
    });

    it('answers with the repository the storefront ended up in', async () => {
        const result = await runSetup(createEdsConfig());

        expect(result).toEqual({
            success: true,
            repoOwner: 'test-owner',
            repoName: 'test-repo',
            repoUrl: 'https://github.com/test-owner/test-repo',
        });
    });
});
