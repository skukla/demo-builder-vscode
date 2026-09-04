/**
 * linkExistingMesh — redeploying the cloned mesh configuration onto a workspace
 * that already has a mesh, and the component-instance record it rewrites.
 *
 * The guard this file exists for is the three-term one: a mesh instance with no
 * `path`, or a missing definition, must skip deployment entirely. The suite that
 * covered it before used a project whose instance had no `subType: 'mesh'`, so
 * every term was falsy at once and the guard could have been almost anything.
 */

import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import {
    linkExistingMesh,
    type MeshApiConfig,
    type MeshSetupContext,
} from '@/features/project-creation/services/meshSetupService';
import type { ProjectSetupContext } from '@/features/project-creation/services/ProjectSetupContext';
import type { Project } from '@/types/base';

jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    updateMeshState: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/features/mesh/services/meshDeployment', () => ({
    deployMeshComponent: jest.fn(),
}));
jest.mock('@/features/project-creation/helpers/envFileGenerator', () => ({
    generateComponentEnvFile: jest.fn(),
}));

import { deployMeshComponent } from '@/features/mesh/services/meshDeployment';
import { updateMeshState } from '@/features/mesh/services/stalenessDetector';
import { generateComponentEnvFile } from '@/features/project-creation/helpers/envFileGenerator';

import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import {
    MESH_ID,
    MESH_PATH,
    OTHER_ID,
    createMeshDefinition,
    buildMeshProject,
    buildMeshSetupContext,
    meshInstance,
} from './meshSetupService.testUtils';

const deployMock = deployMeshComponent as jest.Mock;
const updateMeshStateMock = updateMeshState as jest.Mock;
const generateEnvMock = generateComponentEnvFile as jest.Mock;

describe('meshSetupService linkExistingMesh', () => {
    let project: Project;
    let setupContext: ProjectSetupContext;
    let progressTracker: jest.Mock;
    let commandExecutor: jest.Mocked<CommandExecutor>;
    let authManager: AuthenticationService;

    const linkedConfig: MeshApiConfig = {
        meshId: 'existing-mesh-id',
        endpoint: 'https://existing.adobe.io/graphql',
        meshStatus: 'created',
        workspace: 'Stage',
    };

    const buildContext = (overrides: Partial<MeshSetupContext> = {}): MeshSetupContext => ({
        setupContext,
        meshDefinition: createMeshDefinition(),
        progressTracker,
        commandManager: commandExecutor,
        authManager,
        ...overrides,
    });

    /** Install a project (and a matching setup context) for this test. */
    const useProject = (next: Project) => {
        project = next;
        setupContext = buildMeshSetupContext(project);
    };

    beforeEach(() => {
        jest.clearAllMocks();
        useProject(buildMeshProject());
        progressTracker = jest.fn();
        commandExecutor = createMockCommandExecutor();
        authManager = createMockAuthenticationService();
        deployMock.mockResolvedValue({
            success: true,
            data: {
                meshId: 'deployed-mesh-id',
                endpoint: 'https://deployed.adobe.io/graphql',
            },
        });
    });

    describe('the deploy guard', () => {
        it('should redeploy the cloned configuration with the existing mesh id', async () => {
            await linkExistingMesh(buildContext(), linkedConfig);

            expect(deployMock).toHaveBeenCalledWith(
                MESH_PATH,
                commandExecutor,
                setupContext.logger,
                expect.any(Function),
                'existing-mesh-id'
            );
        });

        it('should skip deployment when the mesh instance was never cloned', async () => {
            useProject(buildMeshProject(meshInstance({ path: undefined })));

            await linkExistingMesh(buildContext(), linkedConfig);

            expect(generateEnvMock).not.toHaveBeenCalled();
            expect(deployMock).not.toHaveBeenCalled();
        });

        it('should skip deployment when no mesh definition is supplied', async () => {
            await linkExistingMesh(buildContext({ meshDefinition: undefined }), linkedConfig);

            expect(generateEnvMock).not.toHaveBeenCalled();
            expect(deployMock).not.toHaveBeenCalled();
        });

        it('should report the deployer’s progress at the linking percentage', async () => {
            deployMock.mockImplementation(
                async (
                    _path: string,
                    _executor: CommandExecutor,
                    _logger: unknown,
                    onProgress: (message: string, subMessage?: string) => void
                ) => {
                    onProgress('Deploying mesh', 'Uploading schema');
                    onProgress('Verifying mesh');
                    return { success: true, data: {} };
                }
            );

            await linkExistingMesh(buildContext(), linkedConfig);

            expect(progressTracker).toHaveBeenCalledWith(
                'Deploying API Mesh',
                78,
                'Uploading schema'
            );
            expect(progressTracker).toHaveBeenCalledWith(
                'Deploying API Mesh',
                78,
                'Verifying mesh'
            );
        });
    });

    describe('deployment failure', () => {
        it('should throw with the reported reason', async () => {
            deployMock.mockResolvedValue({ success: false, error: 'boom' });

            await expect(linkExistingMesh(buildContext(), linkedConfig)).rejects.toThrow(
                'Mesh deployment failed: boom'
            );
        });

        it('should name the failure Unknown error when the result carries no reason', async () => {
            deployMock.mockResolvedValue({ success: false });

            await expect(linkExistingMesh(buildContext(), linkedConfig)).rejects.toThrow(
                'Mesh deployment failed: Unknown error'
            );
        });

        it('should not rewrite the instance record when deployment failed', async () => {
            deployMock.mockResolvedValue({ success: false, error: 'boom' });

            await expect(linkExistingMesh(buildContext(), linkedConfig)).rejects.toThrow();
            expect(project.componentInstances?.[MESH_ID].status).toBe('ready');
            expect(updateMeshStateMock).not.toHaveBeenCalled();
        });
    });

    describe('the rewritten component instance', () => {
        it('should take the mesh id and endpoint from the deployment result', async () => {
            await linkExistingMesh(buildContext(), linkedConfig);

            expect(project.componentInstances?.[MESH_ID]).toEqual({
                id: MESH_ID,
                name: 'Commerce API Mesh',
                type: 'dependency',
                subType: 'mesh',
                status: 'deployed',
                path: MESH_PATH,
                version: '1.0.0',
                lastUpdated: expect.any(Date),
                metadata: { meshId: 'deployed-mesh-id', meshStatus: 'deployed' },
            });
            expect(project.componentInstances?.[OTHER_ID]).toBeDefined();
            expect(updateMeshStateMock).toHaveBeenCalledWith(
                project,
                'https://deployed.adobe.io/graphql'
            );
        });

        it('should fall back to the linked config when the deploy result has no data', async () => {
            deployMock.mockResolvedValue({ success: true });

            await linkExistingMesh(buildContext(), linkedConfig);

            expect(project.componentInstances?.[MESH_ID].metadata).toEqual({
                meshId: 'existing-mesh-id',
                meshStatus: 'deployed',
            });
            expect(updateMeshStateMock).toHaveBeenCalledWith(
                project,
                'https://existing.adobe.io/graphql'
            );
        });

        it('should leave the record alone when the project has no mesh component', async () => {
            useProject(buildMeshProject(null));

            await linkExistingMesh(buildContext(), linkedConfig);

            expect(Object.keys(project.componentInstances ?? {})).toEqual([OTHER_ID]);
            expect(updateMeshStateMock).toHaveBeenCalledWith(
                project,
                'https://existing.adobe.io/graphql'
            );
        });

        it('should rebuild the instance record when a collaborator dropped it', async () => {
            generateEnvMock.mockImplementation(async () => {
                project.componentInstances = undefined;
            });

            await linkExistingMesh(buildContext(), linkedConfig);

            expect(Object.keys(project.componentInstances ?? {})).toEqual([MESH_ID]);
            expect(project.componentInstances?.[MESH_ID].status).toBe('deployed');
        });
    });
});
