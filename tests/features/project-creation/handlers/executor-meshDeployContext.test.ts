/**
 * Executor - Mesh Deploy Org-Context Tests (Phase 4a)
 *
 * deployFreshMesh no longer mutates the shared `aio` global via selectWorkspace
 * before deploying. It wraps the deploy (and its dependent `aio api-mesh` calls)
 * in `withOrgContext(projectTarget, ...)` so the deploy targets the project's
 * org/project/workspace through per-invocation AIO_CONSOLE_* env — without
 * clobbering concurrent processes.
 */

// withOrgContext records the target then runs the callback (no global mutation).
const mockWithOrgContext = jest.fn((_target: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell/orgContextEnv', () => ({
    ...jest.requireActual('@/core/shell/orgContextEnv'),
    withOrgContext: (target: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(target, fn),
}));

const mockDeployNewMesh = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/project-creation/services/aiBundle/aiBundleService', () => ({
    generateAIContextFiles: jest.fn(),
}));

jest.mock('@/features/project-creation/services/componentInstallationOrchestrator', () => ({
    // Other named exports referenced at module load (kept minimal).
    cloneAllComponents: jest.fn(),
    installAllComponents: jest.fn(),
}));

jest.mock('@/features/project-creation/services/edsContentSetup', () => ({
    ensureEdsContent: jest.fn(),
}));

jest.mock('@/features/project-creation/services/meshSetupService', () => ({
    deployNewMesh: (...args: unknown[]) => mockDeployNewMesh(...args),
    linkExistingMesh: jest.fn(),
    shouldConfigureExistingMesh: jest.fn(),
}));

jest.mock('@/features/project-creation/services/projectFinalizationService', () => ({
    generateEnvironmentFiles: jest.fn(),
    finalizeProject: jest.fn(),
    sendCompletionAndCleanup: jest.fn(),
}));

import { deployFreshMesh } from '@/features/project-creation/handlers/executor';
import { ProjectSetupContext } from '@/features/project-creation/services/ProjectSetupContext';
import type { MeshSetupContext } from '@/features/project-creation/services/meshSetupService';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { HandlerContext } from '@/types/handlers';
import type { ProjectCreationConfig } from '@/types/webviewRequests';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

function createLogger() {
    return createMockLogger();
}

function createContext(
    authOverrides: Partial<jest.Mocked<AuthenticationService>> = {}
): HandlerContext {
    return createMockHandlerContext({
        logger: createLogger(),
        authManager: createMockAuthenticationService({
            isAuthenticated: jest.fn().mockResolvedValue(true),
            loginAndRestoreProjectContext: jest.fn().mockResolvedValue(true),
            getCachedOrganization: jest.fn().mockReturnValue(undefined),
            ...authOverrides,
        }),
    });
}

function createConfig(): ProjectCreationConfig {
    return {
        projectName: 'demo',
        adobe: { organization: 'org-123', projectId: 'proj-456', workspace: 'ws-789' },
        apiMesh: { meshId: 'mesh-1' },
    };
}

// deployNewMesh is mocked, so nothing reads through this; it only has to be the
// shape the callee declares.
const meshContext: MeshSetupContext = {
    setupContext: new ProjectSetupContext(
        createMockHandlerContext(),
        { version: '1.0.0', components: { frontends: [], backends: [], dependencies: [] } },
        createMockProject(),
        createConfig()
    ),
    meshDefinition: { id: 'commerce-mesh', name: 'API Mesh', type: 'dependency', subType: 'mesh' },
    progressTracker: jest.fn(),
    commandManager: createMockCommandExecutor(),
    authManager: createMockAuthenticationService(),
};

describe('Executor - Mesh Deploy Org-Context (Phase 4a)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockWithOrgContext.mockImplementation((_t, fn) => fn());
    });

    it('should wrap deployNewMesh in withOrgContext', async () => {
        const context = createContext();
        await deployFreshMesh(context, createConfig(), meshContext);

        expect(mockWithOrgContext).toHaveBeenCalledTimes(1);
        expect(mockDeployNewMesh).toHaveBeenCalledTimes(1);
    });

    it('should target the project org/project/workspace via withOrgContext', async () => {
        const context = createContext();
        await deployFreshMesh(context, createConfig(), meshContext);

        expect(mockWithOrgContext).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-123',
                projectId: 'proj-456',
                workspaceId: 'ws-789',
            }),
            expect.any(Function)
        );
    });

    it('should resolve org code/name from the cached org when its id matches', async () => {
        const context = createContext({
            getCachedOrganization: jest.fn().mockReturnValue({
                id: 'org-123',
                code: 'CODE@AdobeOrg',
                name: 'Acme Inc',
            }),
        });
        await deployFreshMesh(context, createConfig(), meshContext);

        expect(mockWithOrgContext).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-123',
                orgCode: 'CODE@AdobeOrg',
                orgName: 'Acme Inc',
            }),
            expect.any(Function)
        );
    });

    it('should NOT borrow cached org code/name when the cached org id differs', async () => {
        const context = createContext({
            getCachedOrganization: jest.fn().mockReturnValue({
                id: 'org-OTHER',
                code: 'OTHER@AdobeOrg',
                name: 'Other',
            }),
        });
        await deployFreshMesh(context, createConfig(), meshContext);

        const target = mockWithOrgContext.mock.calls[0][0] as Record<string, unknown>;
        expect(target.orgId).toBe('org-123');
        expect(target.orgCode).toBeUndefined();
        expect(target.orgName).toBeUndefined();
    });

    it('should throw and not deploy when preflight auth fails', async () => {
        const context = createContext({
            isAuthenticated: jest.fn().mockResolvedValue(false),
            loginAndRestoreProjectContext: jest.fn().mockResolvedValue(false),
        });

        await expect(deployFreshMesh(context, createConfig(), meshContext)).rejects.toThrow(
            /authentication/i
        );
        expect(mockWithOrgContext).not.toHaveBeenCalled();
        expect(mockDeployNewMesh).not.toHaveBeenCalled();
    });
});
