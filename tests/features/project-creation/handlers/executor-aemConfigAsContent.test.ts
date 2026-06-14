/**
 * Executor Phase 5 — AEM config-as-content (Slice 2, Step 06).
 *
 * For the content flow (repoless satellite) Phase 5 never pushes config.json
 * to the upstream. When the satellite's content source is AEM Sites, the
 * commerce wiring travels as CONTENT instead: the executor calls the
 * config-as-content writer (authoring the configs nodes into the AEM tree,
 * authenticated with the existing IMS identity). The DA.live content flow
 * keeps the plain skip. The writer is non-fatal either way — the R2 manual
 * fallback keeps setup green.
 */

import { HandlerContext } from '@/commands/handlers/HandlerContext';

jest.mock('@/features/mesh/services/meshDeployment');
// executeMeshPhase gates App Builder operations on projectRequiresAppBuilder
// (added on develop); mock it so the executor doesn't read the full registry shape.
jest.mock('@/features/components/services/projectAppBuilderPredicate', () => ({
    projectRequiresAppBuilder: jest.fn(() => false),
}));
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    readMeshEnvVarsFromFile: jest.fn().mockResolvedValue({}),
    updateMeshState: jest.fn().mockResolvedValue(undefined),
    fetchDeployedMeshConfig: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
        }),
    },
}));

jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockRejectedValue(new Error('Not found')),
    readdir: jest.fn().mockResolvedValue([]),
    rm: jest.fn().mockResolvedValue(undefined),
    rmdir: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(true),
    readFileSync: jest.fn().mockReturnValue('{}'),
}));

jest.mock('@/features/eds/services/githubFileOperations', () => ({
    GitHubFileOperations: jest.fn().mockImplementation(() => ({
        createOrUpdateFile: jest.fn().mockResolvedValue({ sha: 'x', commitSha: 'y' }),
    })),
}));
jest.mock('@/features/eds/services/githubTokenService', () => ({
    GitHubTokenService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/features/components/services/componentManager', () => ({
    ComponentManager: jest.fn().mockImplementation(() => ({
        installComponent: jest.fn().mockResolvedValue({ success: true, component: {} }),
        installNpmDependencies: jest.fn().mockResolvedValue({ success: true }),
    })),
}));

jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        loadRegistry: jest.fn().mockResolvedValue({ envVars: {} }),
        getFrontends: jest.fn().mockResolvedValue([
            { id: 'eds-storefront', name: 'EDS Storefront', type: 'frontend' },
        ]),
        getDependencies: jest.fn().mockResolvedValue([]),
        getAppBuilder: jest.fn().mockResolvedValue([]),
        getComponentById: jest.fn().mockResolvedValue(undefined),
    })),
}));

jest.mock('@/features/project-creation/helpers/envFileGenerator', () => ({
    generateComponentEnvFile: jest.fn().mockResolvedValue(undefined),
    generateComponentConfigFiles: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({ get: jest.fn().mockReturnValue(3000) }),
    },
    window: { setStatusBarMessage: jest.fn() },
    commands: { executeCommand: jest.fn() },
}), { virtual: true });

jest.mock('@/features/project-creation/services', () => ({
    cloneAllComponents: jest.fn().mockImplementation(({ componentDefinitions, project }) => {
        for (const [id, entry] of componentDefinitions.entries()) {
            project.componentInstances = project.componentInstances || {};
            project.componentInstances[id] = {
                id, name: entry.definition.name, type: entry.definition.type,
                status: 'installed', path: `${project.path}/components/${id}`, lastUpdated: new Date(),
            };
        }
        return Promise.resolve();
    }),
    installAllComponents: jest.fn().mockResolvedValue(undefined),
    deployNewMesh: jest.fn().mockResolvedValue(undefined),
    linkExistingMesh: jest.fn().mockResolvedValue(undefined),
    shouldConfigureExistingMesh: jest.fn().mockReturnValue(false),
    generateEnvironmentFiles: jest.fn().mockResolvedValue(undefined),
    finalizeProject: jest.fn().mockResolvedValue(undefined),
    sendCompletionAndCleanup: jest.fn().mockResolvedValue(undefined),
    generateAIContextFiles: jest.fn().mockResolvedValue(undefined),
    ensureEdsContent: jest.fn().mockResolvedValue(false),
}));

jest.mock('@/features/eds/services/configSyncService', () => ({
    syncConfigToRemote: jest.fn().mockResolvedValue({ success: true, githubPushed: true, cdnPublished: true }),
}));
jest.mock('@/features/eds/services/storefrontStalenessDetector', () => ({
    updateStorefrontState: jest.fn().mockResolvedValue(undefined),
}));

// The unit under integration: the config-as-content writer + its AEM port.
// Return values are wired in beforeEach (the hoisted factory can't reference
// file-level consts — TDZ at module-require time).
jest.mock('@/features/eds/services/configAsContentWriter', () => ({
    writeConfigAsContent: jest.fn(),
    createAemAuthoringWritePort: jest.fn(),
}));

import { writeConfigAsContent, createAemAuthoringWritePort } from '@/features/eds/services/configAsContentWriter';
import { syncConfigToRemote } from '@/features/eds/services/configSyncService';
import { executeProjectCreation } from '@/features/project-creation/handlers/executor';

const AEM_AUTHOR_URL = 'https://author-p57319-e1619941.adobeaemcloud.com';
const AEM_CONTENT_PATH = '/content/citisignal';

function createMockContext(): Partial<HandlerContext> {
    return {
        context: { extensionPath: '/test/extension' } as any,
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
        stateManager: {
            getCurrentProject: jest.fn().mockResolvedValue(null),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as any,
        sharedState: {},
        sendMessage: jest.fn(),
        panel: { visible: false, dispose: jest.fn() } as any,
        authManager: {
            getTokenManager: jest.fn().mockReturnValue({
                inspectToken: jest.fn().mockResolvedValue({ valid: true, expiresIn: 3600, token: 'ims-token' }),
            }),
        } as any,
    };
}

function satelliteConfig(over: Record<string, unknown> = {}) {
    return {
        projectName: 'test-aem-satellite',
        selectedStack: 'eds-paas',
        flow: 'content',
        upstream: { owner: 'commerce-sc', repo: 'citisignal-upstream' },
        edsConfig: {
            repoName: 'citisignal-upstream',
            repoMode: 'new' as const,
            repoUrl: 'https://github.com/commerce-sc/citisignal-upstream',
            daLiveOrg: 'content-sc',
            daLiveSite: 'citisignal',
            githubOwner: 'commerce-sc',
            preflightComplete: true,
            contentSourceType: 'aem-sites' as const,
            aemContentSource: { authorUrl: AEM_AUTHOR_URL, contentPath: AEM_CONTENT_PATH },
        },
        components: { frontend: 'eds-storefront', dependencies: [] },
        componentConfigs: {},
        ...over,
    };
}

const sentinelPort = { writeConfig: jest.fn() };

describe('Executor Phase 5 — AEM config-as-content (content flow)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (writeConfigAsContent as jest.Mock).mockResolvedValue({
            success: true, writtenPaths: ['/content/citisignal/configs'],
        });
        (createAemAuthoringWritePort as jest.Mock).mockReturnValue(sentinelPort);
    });

    it('calls the config-as-content writer for an aem-sites satellite (config sync stays skipped)', async () => {
        const mockContext = createMockContext();

        await executeProjectCreation(mockContext as HandlerContext, satelliteConfig());

        expect(syncConfigToRemote).not.toHaveBeenCalled();
        expect(createAemAuthoringWritePort).toHaveBeenCalledWith(
            AEM_AUTHOR_URL, expect.anything(), expect.anything(),
        );
        expect(writeConfigAsContent).toHaveBeenCalledWith(expect.objectContaining({
            contentPath: AEM_CONTENT_PATH,
            writePort: sentinelPort,
            coords: expect.objectContaining({
                daLiveOrg: 'content-sc',
                daLiveSite: 'citisignal',
                repoName: 'citisignal-upstream',
            }),
        }));
    });

    it('does NOT call the writer for a DA.live content-flow satellite (plain skip preserved)', async () => {
        const mockContext = createMockContext();
        const config = satelliteConfig();
        delete (config.edsConfig as Record<string, unknown>).contentSourceType;
        delete (config.edsConfig as Record<string, unknown>).aemContentSource;

        await executeProjectCreation(mockContext as HandlerContext, config);

        expect(writeConfigAsContent).not.toHaveBeenCalled();
        expect(syncConfigToRemote).not.toHaveBeenCalled();
    });

    it('completes setup green when the writer returns the R2 manual fallback', async () => {
        (writeConfigAsContent as jest.Mock).mockResolvedValue({
            success: false, manualFallbackRequired: true,
            reason: 'Config-as-content write to /content/citisignal/configs failed (HTTP 403): Forbidden',
            writes: [{ path: '/content/citisignal/configs', payload: '{"public":{}}' }],
        });
        const mockContext = createMockContext();

        await expect(
            executeProjectCreation(mockContext as HandlerContext, satelliteConfig()),
        ).resolves.not.toThrow();

        // The exact node paths + payloads are surfaced for manual authoring
        const infoLines = (mockContext.logger!.info as jest.Mock).mock.calls.flat().join('\n');
        expect(infoLines).toContain('/content/citisignal/configs');
        expect(infoLines).toContain('{"public":{}}');
    });

    it('completes setup green even when the writer throws (generation failure is non-fatal)', async () => {
        (writeConfigAsContent as jest.Mock).mockRejectedValue(new Error('Config-as-content generation failed: boom'));
        const mockContext = createMockContext();

        await expect(
            executeProjectCreation(mockContext as HandlerContext, satelliteConfig()),
        ).resolves.not.toThrow();
    });

    it('does NOT call the writer for the commerce flow (Phase 5 pushes config.json as before)', async () => {
        const mockContext = createMockContext();
        const config = satelliteConfig({ flow: undefined, upstream: undefined });

        await executeProjectCreation(mockContext as HandlerContext, config);

        expect(writeConfigAsContent).not.toHaveBeenCalled();
        expect(syncConfigToRemote).toHaveBeenCalled();
    });
});
