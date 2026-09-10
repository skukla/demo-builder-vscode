/**
 * Executor — the seams the orchestration hands to its collaborators.
 *
 * `executeProjectCreation` is mostly wiring: it decides the project PATH, chooses the
 * edit or new branch, makes the directories, reports progress, and hands three
 * callback bundles onward (the installation context, the finalization context, and the
 * AI-bundle step). None of those decisions produces a return value, so each is asserted
 * on the ARGUMENTS a collaborator receives — a mock cannot see a malformed call, and
 * every collaborator here is mocked.
 *
 * Everything is mocked and this finishes in about a second alone, but under the full
 * suite's worker contention the sibling executor suites have exceeded jest's 10s
 * default. Same headroom, same reason: CPU starvation, not slow code.
 */

jest.setTimeout(30_000);

import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';

jest.mock('@/features/mesh/services/meshDeployment');
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    readMeshEnvVarsFromFile: jest.fn().mockResolvedValue({}),
    updateMeshState: jest.fn().mockResolvedValue(undefined),
    fetchDeployedMeshConfig: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
        }),
        getAuthenticationService: jest.fn().mockReturnValue({
            testDeveloperPermissions: jest.fn().mockResolvedValue({ hasPermissions: true }),
        }),
    },
}));

jest.mock('@/features/components/services/projectAppBuilderPredicate', () => ({
    projectRequiresAppBuilder: jest.fn(() => false),
}));

jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockRejectedValue(new Error('Not found')),
    readdir: jest.fn().mockResolvedValue([]),
    rm: jest.fn().mockResolvedValue(undefined),
    rmdir: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/project-creation/handlers/executorPreflight', () => ({
    handlePortConflicts: jest.fn().mockResolvedValue(undefined),
    cleanupOrphanedDirectory: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/project-creation/handlers/executorEditMode', () => ({
    loadExistingProjectForEdit: jest.fn().mockResolvedValue(undefined),
    prepareEditModeTempDir: jest.fn().mockResolvedValue('/tmp/edit/components.tmp'),
    performAtomicComponentSwap: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/components/services/commerceSecretMigration', () => ({
    migrateDeclaredSecrets: jest
        .fn()
        .mockResolvedValue({ sanitizedConfigs: {}, retained: [] }),
}));

jest.mock('@/features/project-creation/services/aiBundle/aiBundleService', () => ({
    generateAIContextFiles: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        loadRegistry: jest.fn().mockResolvedValue({ envVars: {} }),
        getFrontends: jest.fn().mockResolvedValue([]),
        getDependencies: jest.fn().mockResolvedValue([]),
        getComponentById: jest.fn().mockResolvedValue(undefined),
    })),
}));

jest.mock('@/features/project-creation/services/componentInstallationOrchestrator', () => ({
    cloneAllComponents: jest.fn().mockResolvedValue(undefined),
    installAllComponents: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/project-creation/services/projectFinalizationService', () => ({
    generateEnvironmentFiles: jest.fn().mockResolvedValue(undefined),
    finalizeProject: jest.fn().mockResolvedValue(undefined),
    sendCompletionAndCleanup: jest.fn().mockResolvedValue(undefined),
}));

import * as fsPromises from 'fs/promises';
import { generateAIContextFiles } from '@/features/project-creation/services/aiBundle/aiBundleService';
import { executeProjectCreation } from '@/features/project-creation/handlers/executor';
import {
    cloneAllComponents,
    installAllComponents,
} from '@/features/project-creation/services/componentInstallationOrchestrator';
import {
    finalizeProject,
    sendCompletionAndCleanup,
} from '@/features/project-creation/services/projectFinalizationService';
import {
    loadExistingProjectForEdit,
    performAtomicComponentSwap,
} from '@/features/project-creation/handlers/executorEditMode';
import { cleanupOrphanedDirectory } from '@/features/project-creation/handlers/executorPreflight';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

const EDIT_PATH = '/somewhere/else/my-edited-project';

function config(overrides: Partial<ProjectCreationConfig> = {}): ProjectCreationConfig {
    // A real stack id: loadComponentDefinitions refuses an unknown one before any of
    // the seams under test are reached.
    return {
        projectName: 'seam-demo',
        selectedStack: 'eds-paas',
        components: { frontend: 'eds-storefront', dependencies: [] },
        componentConfigs: {},
        ...overrides,
    } as ProjectCreationConfig;
}

function makeContext() {
    const saveProject = jest.fn().mockResolvedValue(undefined);
    const saveProjectConfigOnly = jest.fn().mockResolvedValue(undefined);
    const sendMessage = jest.fn();
    const context = createMockHandlerContext({
        context: createMockExtensionContext({}, '/test/extension'),
        logger: createMockLogger(),
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(null),
            saveProject,
            saveProjectConfigOnly,
        }),
        sendMessage,
        panel: createMockWebviewPanel({ visible: false }),
        componentRegistry: new (
            jest.requireMock('@/features/components/services/ComponentRegistryManager')
                .ComponentRegistryManager
        )(),
    });
    return { context, saveProject, saveProjectConfigOnly, sendMessage };
}

/** Every `mkdir` path the run asked for. */
function madeDirectories(): Array<[string, unknown]> {
    return (fsPromises.mkdir as jest.Mock).mock.calls as Array<[string, unknown]>;
}

beforeEach(() => {
    jest.clearAllMocks();
    (generateAIContextFiles as jest.Mock).mockResolvedValue(undefined);
    (cloneAllComponents as jest.Mock).mockResolvedValue(undefined);
    (finalizeProject as jest.Mock).mockResolvedValue(undefined);
});

describe('executeProjectCreation — the progress it reports', () => {
    it('sends a fully populated progress payload, not a bare envelope', async () => {
        const { context, sendMessage } = makeContext();

        await executeProjectCreation(context, config());

        expect(sendMessage).toHaveBeenCalledWith('creationProgress', {
            currentOperation: 'Setting Up Project',
            progress: 10,
            message: 'Creating project directory structure...',
            logs: [],
            meshPhase: undefined,
        });
    });
});

describe('executeProjectCreation — the directories it makes', () => {
    it('creates components/ and logs/ RECURSIVELY under the project path', async () => {
        const { context } = makeContext();

        await executeProjectCreation(context, config());

        const dirs = madeDirectories();
        const components = dirs.find(([p]) => p.endsWith('/seam-demo/components'));
        const logs = dirs.find(([p]) => p.endsWith('/seam-demo/logs'));
        expect(components?.[1]).toEqual({ recursive: true });
        expect(logs?.[1]).toEqual({ recursive: true });
    });

    it('works inside the EDITED project’s own directory, not a fresh one under home', async () => {
        const { context } = makeContext();

        await executeProjectCreation(context, config({ editProjectPath: EDIT_PATH }));

        expect(madeDirectories().map(([p]) => p)).toContain(`${EDIT_PATH}/components`);
    });
});

describe('executeProjectCreation — the edit branch', () => {
    it('cleans up an orphaned directory for a NEW project and loads nothing', async () => {
        const { context } = makeContext();

        await executeProjectCreation(context, config());

        expect(cleanupOrphanedDirectory).toHaveBeenCalled();
        expect(loadExistingProjectForEdit).not.toHaveBeenCalled();
    });

    it('loads the existing project when editing, and never cleans its directory away', async () => {
        const { context } = makeContext();

        await executeProjectCreation(context, config({ editProjectPath: EDIT_PATH }));

        expect(loadExistingProjectForEdit).toHaveBeenCalledWith(EDIT_PATH, context);
        expect(cleanupOrphanedDirectory).not.toHaveBeenCalled();
    });

    it('swaps the temp components into place when editing, and not otherwise', async () => {
        const { context } = makeContext();

        await executeProjectCreation(context, config({ editProjectPath: EDIT_PATH }));
        expect(performAtomicComponentSwap).toHaveBeenCalledTimes(1);

        jest.clearAllMocks();
        const fresh = makeContext();
        await executeProjectCreation(fresh.context, config());
        expect(performAtomicComponentSwap).not.toHaveBeenCalled();
    });
});

describe('executeProjectCreation — the callbacks it hands onward', () => {
    it('gives the installer a saveProject that really saves THIS project', async () => {
        const { context, saveProject } = makeContext();
        (cloneAllComponents as jest.Mock).mockImplementation(
            async (ctx: { saveProject: () => Promise<void>; project: { name: string } }) => {
                await ctx.saveProject();
            }
        );

        await executeProjectCreation(context, config());

        expect(saveProject).toHaveBeenCalledWith(expect.objectContaining({ name: 'seam-demo' }));
    });

    it('gives finalization a saveProject and a sendMessage that reach the real ones', async () => {
        const { context, saveProject, sendMessage } = makeContext();
        (finalizeProject as jest.Mock).mockImplementation(
            async (ctx: {
                saveProject: () => Promise<void>;
                sendMessage: (type: string, data: Record<string, unknown>) => void;
            }) => {
                await ctx.saveProject();
                ctx.sendMessage('finalizationPing', { ok: true });
            }
        );

        await executeProjectCreation(context, config());

        expect(saveProject).toHaveBeenCalledWith(expect.objectContaining({ name: 'seam-demo' }));
        expect(sendMessage).toHaveBeenCalledWith('finalizationPing', { ok: true });
    });

    it('still runs the installer and the finalizers in order', async () => {
        const { context } = makeContext();

        await executeProjectCreation(context, config());

        expect(installAllComponents).toHaveBeenCalled();
        expect(sendCompletionAndCleanup).toHaveBeenCalled();
    });
});

describe('executeProjectCreation — the AI bundle step', () => {
    it('generates the bundle for the created project and stamps its freshness', async () => {
        const { context, saveProjectConfigOnly } = makeContext();

        await executeProjectCreation(context, config());

        expect(generateAIContextFiles).toHaveBeenCalledWith(
            expect.stringContaining('seam-demo'),
            expect.objectContaining({ name: 'seam-demo' }),
            '/test/extension'
        );
        expect(saveProjectConfigOnly).toHaveBeenCalled();
    });

    it('saves the config anyway when the bundle fails, rather than losing landed hashes', async () => {
        const { context, saveProjectConfigOnly } = makeContext();
        (generateAIContextFiles as jest.Mock).mockRejectedValue(new Error('bundle blew up'));

        await expect(executeProjectCreation(context, config())).resolves.toBeUndefined();

        expect(saveProjectConfigOnly).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'seam-demo' })
        );
    });
});
