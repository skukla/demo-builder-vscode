/**
 * Creation stops at its next step boundary once it has been stopped (F274).
 *
 * Stop and the 30-minute limit abort the run's controller. Until 2026-11-18 no step read
 * it, so the step that was running carried on, the steps after it still started, and a
 * repository, site, mesh or folder could be made after the cleanup had run. These drive
 * the REAL orchestration; its phases are the boundary faked here, as in
 * `executor-orchestrationSeams.test.ts`, whose mock set this reuses.
 */

jest.setTimeout(30_000);

import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';

jest.mock('@/features/mesh/services/meshDeployment');
jest.mock('@/features/mesh/services/meshEnvVars', () => ({
    readMeshEnvVarsFromFile: jest.fn().mockResolvedValue({}),
}));
jest.mock('@/features/mesh/services/meshDeployBaseline', () => ({
    updateMeshState: jest.fn().mockResolvedValue(undefined),
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
    // Pure: where the project is built. The real one, not a fake.
    creationPath: jest.requireActual('@/features/project-creation/handlers/executorPreflight')
        .creationPath,
    handlePortConflicts: jest.fn().mockResolvedValue(undefined),
    refuseSecondErpIntegration: jest.fn().mockResolvedValue(undefined),
    cleanupOrphanedDirectory: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/project-creation/handlers/executorEditMode', () => ({
    // Pure: what an Edit keeps of the old project. The real one, not a fake.
    carriedOverFromEdit: jest.requireActual('@/features/project-creation/handlers/executorEditMode')
        .carriedOverFromEdit,
    loadExistingProjectForEdit: jest.fn().mockResolvedValue(undefined),
    prepareEditModeTempDir: jest.fn().mockResolvedValue('/tmp/edit/components.tmp'),
    performAtomicComponentSwap: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/project-creation/handlers/executorEditApply', () => ({
    // Answers "rebuild" unless a test says otherwise.
    finishEditWithoutRebuild: jest.fn().mockResolvedValue(false),
}));

jest.mock('@/features/components/services/declaredSecretStore', () => ({
    migrateDeclaredSecrets: jest
        .fn()
        .mockResolvedValue({ sanitizedConfigs: {}, retained: [] }),
}));

jest.mock('@/features/project-creation/services/catalogMenuPhase', () => ({
    executeCatalogMenuPhase: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/core/utils/agentPhaseChannel', () => ({
    reportPhase: jest.fn(),
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
import { executeProjectCreation } from '@/features/project-creation/handlers/executor';
import {
    cloneAllComponents,
    installAllComponents,
} from '@/features/project-creation/services/componentInstallationOrchestrator';
import {
    finalizeProject,
    generateEnvironmentFiles,
} from '@/features/project-creation/services/projectFinalizationService';
import { ErrorCode } from '@/types/errorCodes';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

const config: ProjectCreationConfig = {
    projectName: 'stop-demo',
    selectedStack: 'eds-paas',
    components: { frontend: 'eds-storefront', dependencies: [] },
    componentConfigs: {},
};

function makeContext() {
    return createMockHandlerContext({
        context: createMockExtensionContext({}, '/test/extension'),
        logger: createMockLogger(),
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(null),
            saveProject: jest.fn().mockResolvedValue(undefined),
            saveProjectConfigOnly: jest.fn().mockResolvedValue(undefined),
        }),
        sendMessage: jest.fn(),
        panel: createMockWebviewPanel({ visible: false }),
        componentRegistry: new (
            jest.requireMock('@/features/components/services/ComponentRegistryManager')
                .ComponentRegistryManager
        )(),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    (cloneAllComponents as jest.Mock).mockResolvedValue(undefined);
    (finalizeProject as jest.Mock).mockResolvedValue(undefined);
});

describe('executeProjectCreation: a stop ends the run at the next step boundary', () => {
    it('lets the running step finish, then starts no further step and ends as cancelled', async () => {
        const controller = new AbortController();
        // The download is the step running when Stop is pressed.
        (cloneAllComponents as jest.Mock).mockImplementation(async () => {
            controller.abort();
        });

        const outcome = executeProjectCreation(makeContext(), config, controller.signal);

        await expect(outcome).rejects.toMatchObject({ code: ErrorCode.CANCELLED });
        expect(cloneAllComponents).toHaveBeenCalledTimes(1);
        expect(installAllComponents).not.toHaveBeenCalled();
        expect(generateEnvironmentFiles).not.toHaveBeenCalled();
        expect(finalizeProject).not.toHaveBeenCalled();
    });

    it('makes nothing at all when it was stopped before it began', async () => {
        const controller = new AbortController();
        controller.abort();

        const outcome = executeProjectCreation(makeContext(), config, controller.signal);

        await expect(outcome).rejects.toMatchObject({ code: ErrorCode.CANCELLED });
        expect(fsPromises.mkdir).not.toHaveBeenCalled();
        expect(cloneAllComponents).not.toHaveBeenCalled();
    });

    it('runs every step when it is never stopped', async () => {
        const controller = new AbortController();

        await executeProjectCreation(makeContext(), config, controller.signal);

        expect(installAllComponents).toHaveBeenCalledTimes(1);
        expect(finalizeProject).toHaveBeenCalledTimes(1);
    });
});
