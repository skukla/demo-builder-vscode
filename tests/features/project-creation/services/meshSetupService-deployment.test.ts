/**
 * deployNewMesh — the retry loop, the mesh-phase pushes, and the bookkeeping
 * that runs after a successful deploy.
 *
 * Every assertion here is on an ARGUMENT a collaborator receives (the options
 * object handed to the CLI, the mesh-phase payload pushed to the UI, the
 * endpoint written to mesh state) rather than on a mock's answer, because a mock
 * answers the same whatever it is handed.
 *
 * `Date.now` is under test control so the elapsed-seconds arithmetic is
 * observable: the deploy fake advances the clock, so a run that reports 3 is
 * distinguishable from one that reports 2003 or 3,000,000.
 */

import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import {
    deployNewMesh,
    type MeshApiConfig,
    type MeshSetupContext,
} from '@/features/project-creation/services/meshSetupService';
import type { ProjectSetupContext } from '@/features/project-creation/services/ProjectSetupContext';
import type { Project } from '@/types/base';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    updateMeshState: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/features/mesh/services/meshDeployment', () => ({
    deployMeshComponent: jest.fn(),
}));
jest.mock('@/features/project-creation/helpers/envFileGenerator', () => ({
    generateComponentEnvFile: jest.fn(),
}));
const mockEnsureSubscribed = jest.fn();
jest.mock('@/features/app-builder/services/ensureMeshApiSubscribed', () => ({
    ensureMeshApiSubscribed: (...args: unknown[]) => mockEnsureSubscribed(...args),
}));

import { getMeshNodeVersion } from '@/core/utils/meshConfig';
import { deployMeshComponent } from '@/features/mesh/services/meshDeployment';
import { updateMeshState } from '@/features/mesh/services/stalenessDetector';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createSuccessResult } from '../../../helpers/commandResultFake';
import {
    MESH_ID,
    MESH_PATH,
    OTHER_ID,
    createMeshDefinition,
    buildMeshProject,
    buildMeshSetupContext,
} from './meshSetupService.testUtils';

const deployMock = deployMeshComponent as jest.Mock;
const updateMeshStateMock = updateMeshState as jest.Mock;

/** How far the deploy fake advances the clock, in milliseconds. */
const DEPLOY_MS = 3000;

/** The formatted form of a mesh failure, as `formatMeshDeploymentError` writes it. */
const formatted = (detail: string) => `Failed to deploy Adobe Commerce API Mesh:\n${detail}`;

describe('meshSetupService deployNewMesh', () => {
    let project: Project;
    let setupContext: ProjectSetupContext;
    let progressTracker: jest.Mock;
    let onMeshPhaseUpdate: jest.Mock;
    let onMeshCreated: jest.Mock;
    let waitForMeshDecision: jest.Mock;
    let commandExecutor: jest.Mocked<CommandExecutor>;
    let authManager: AuthenticationService;
    const clock = { now: 1_000_000 };

    /** Every mesh-phase payload pushed, in order. */
    const phases = () => onMeshPhaseUpdate.mock.calls.map((call) => call[0]);

    /** The phase payloads of one status, in order. */
    const phasesOfStatus = (status: string) =>
        phases().filter((phase: { status: string }) => phase.status === status);

    const buildContext = (overrides: Partial<MeshSetupContext> = {}): MeshSetupContext => ({
        setupContext,
        meshDefinition: createMeshDefinition(),
        progressTracker,
        onMeshPhaseUpdate,
        onMeshCreated,
        commandManager: commandExecutor,
        authManager,
        ...overrides,
    });

    /** Point the describe CLI at a canned payload. */
    const describeReturns = (payload: unknown, code = 0) => {
        commandExecutor.execute.mockResolvedValue({
            ...createSuccessResult(JSON.stringify(payload)),
            code,
        });
    };

    /** A deploy that takes DEPLOY_MS and then answers with `result`. */
    const deployAnswers = (result: unknown) => {
        deployMock.mockImplementation(async () => {
            clock.now += DEPLOY_MS;
            return result;
        });
    };

    beforeEach(() => {
        jest.clearAllMocks();
        clock.now = 1_000_000;
        jest.spyOn(Date, 'now').mockImplementation(() => clock.now);

        project = buildMeshProject();
        setupContext = buildMeshSetupContext(project);
        progressTracker = jest.fn();
        onMeshPhaseUpdate = jest.fn();
        onMeshCreated = jest.fn();
        waitForMeshDecision = jest.fn();
        commandExecutor = createMockCommandExecutor();
        authManager = createMockAuthenticationService();
        mockEnsureSubscribed.mockResolvedValue(undefined);

        describeReturns({});
        deployAnswers({
            success: true,
            data: { meshId: 'deployed-mesh-id', endpoint: 'https://deployed.adobe.io/graphql' },
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('describing the workspace mesh', () => {
        it('should run describe with the mesh Node version, telemetry off and PATH enhanced', async () => {
            await deployNewMesh(buildContext(), undefined);

            expect(commandExecutor.execute).toHaveBeenCalledWith('aio api-mesh:describe', {
                timeout: TIMEOUTS.NORMAL,
                configureTelemetry: false,
                useNodeVersion: getMeshNodeVersion(),
                enhancePath: true,
            });
        });

        it('should ignore describe output when the CLI exits non-zero', async () => {
            describeReturns({ meshId: 'ghost-mesh', endpoint: 'https://ghost' }, 1);

            await deployNewMesh(buildContext(), undefined);

            expect(deployMock.mock.calls[0][4]).toBeUndefined();
        });

        it('should subscribe the mesh API for this project before deploying', async () => {
            await deployNewMesh(buildContext(), undefined);

            expect(mockEnsureSubscribed).toHaveBeenCalledWith({
                project,
                authService: authManager,
                logger: setupContext.logger,
            });
        });
    });

    describe('resolving the mesh endpoint after a successful deploy', () => {
        it('should prefer meshEndpoint over endpoint in describe output', async () => {
            describeReturns({
                meshId: 'described-mesh',
                meshEndpoint: 'https://primary.adobe.io/graphql',
                endpoint: 'https://secondary.adobe.io/graphql',
            });
            deployAnswers({ success: true, data: { meshId: 'deployed-mesh-id' } });

            await deployNewMesh(buildContext(), {});

            expect(updateMeshStateMock).toHaveBeenCalledWith(
                project,
                'https://primary.adobe.io/graphql'
            );
        });

        it('should use the describe endpoint when the CLI reports only `endpoint`', async () => {
            describeReturns({
                meshId: 'described-mesh',
                endpoint: 'https://only.adobe.io/graphql',
            });
            deployAnswers({ success: true, data: { meshId: 'deployed-mesh-id' } });

            await deployNewMesh(buildContext(), {});

            expect(updateMeshStateMock).toHaveBeenCalledWith(
                project,
                'https://only.adobe.io/graphql'
            );
        });

        it('should resolve both from describe when neither deploy nor wizard supply them', async () => {
            describeReturns({
                meshId: 'described-mesh',
                endpoint: 'https://described.adobe.io/graphql',
            });
            deployAnswers({ success: true, data: {} });

            await deployNewMesh(buildContext(), undefined);

            expect(project.componentInstances?.[MESH_ID].metadata).toEqual({
                meshId: 'described-mesh',
                meshStatus: 'deployed',
            });
            expect(updateMeshStateMock).toHaveBeenCalledWith(
                project,
                'https://described.adobe.io/graphql'
            );
        });

        it('should fall back to the wizard mesh config when the deploy result has no data', async () => {
            const apiMeshConfig: MeshApiConfig = {
                meshId: 'wizard-mesh',
                endpoint: 'https://wizard.adobe.io/graphql',
            };
            deployAnswers({ success: true });

            await deployNewMesh(buildContext(), apiMeshConfig);

            expect(project.componentInstances?.[MESH_ID].metadata).toEqual({
                meshId: 'wizard-mesh',
                meshStatus: 'deployed',
            });
            expect(updateMeshStateMock).toHaveBeenCalledWith(
                project,
                'https://wizard.adobe.io/graphql'
            );
            // Both halves were known before the deploy, so describe runs once — for
            // the update-vs-create decision — and is not asked again.
            expect(commandExecutor.execute).toHaveBeenCalledTimes(1);
        });

        it('should keep the deployed mesh id and take only the endpoint from describe', async () => {
            describeReturns({
                meshId: 'ghost-mesh',
                endpoint: 'https://from-describe.adobe.io/graphql',
            });
            deployAnswers({ success: true, data: { meshId: 'deployed-mesh-id' } });

            await deployNewMesh(buildContext(), {});

            expect(project.componentInstances?.[MESH_ID].metadata).toEqual({
                meshId: 'deployed-mesh-id',
                meshStatus: 'deployed',
            });
            expect(updateMeshStateMock).toHaveBeenCalledWith(
                project,
                'https://from-describe.adobe.io/graphql'
            );
        });

        it('should keep the deployed endpoint and take only the mesh id from describe', async () => {
            describeReturns({ meshId: 'described-mesh' });
            deployAnswers({
                success: true,
                data: { endpoint: 'https://from-deploy.adobe.io/graphql' },
            });

            await deployNewMesh(buildContext(), {});

            expect(project.componentInstances?.[MESH_ID].metadata).toEqual({
                meshId: 'described-mesh',
                meshStatus: 'deployed',
            });
            expect(updateMeshStateMock).toHaveBeenCalledWith(
                project,
                'https://from-deploy.adobe.io/graphql'
            );
        });

        it('should record an empty mesh id when no source reports one', async () => {
            deployAnswers({
                success: true,
                data: { endpoint: 'https://from-deploy.adobe.io/graphql' },
            });

            await deployNewMesh(buildContext(), {});

            expect(project.componentInstances?.[MESH_ID].metadata).toEqual({
                meshId: '',
                meshStatus: 'deployed',
            });
        });
    });

    describe('updating the project record', () => {
        it('should mark the mesh instance deployed and leave the other instances alone', async () => {
            await deployNewMesh(buildContext(), undefined);

            expect(project.componentInstances?.[MESH_ID]).toMatchObject({
                id: MESH_ID,
                path: MESH_PATH,
                status: 'deployed',
                metadata: { meshId: 'deployed-mesh-id', meshStatus: 'deployed' },
            });
            expect(project.componentInstances?.[OTHER_ID]).toBeDefined();
        });

        it('should rebuild the instance record when a collaborator dropped it mid-deploy', async () => {
            mockEnsureSubscribed.mockImplementation(async () => {
                project.componentInstances = undefined;
            });

            await deployNewMesh(buildContext(), undefined);

            expect(Object.keys(project.componentInstances ?? {})).toEqual([MESH_ID]);
            expect(project.componentInstances?.[MESH_ID].status).toBe('deployed');
        });

        it('should report the workspace the mesh was created in', async () => {
            const config: ProjectCreationConfig = {
                projectName: 'test-project',
                adobe: { workspace: 'Stage' },
            };
            setupContext = buildMeshSetupContext(project, config);

            await deployNewMesh(buildContext(), undefined);

            expect(onMeshCreated).toHaveBeenCalledWith('Stage');
        });

        it('should report an undefined workspace when the wizard config has no Adobe section', async () => {
            await deployNewMesh(buildContext(), undefined);

            expect(onMeshCreated).toHaveBeenCalledWith(undefined);
        });
    });

    describe('mesh phase pushes', () => {
        it('should push a deploying phase before the first attempt', async () => {
            await deployNewMesh(buildContext(), undefined);

            expect(phasesOfStatus('deploying')[0]).toEqual({
                status: 'deploying',
                attempt: 1,
                maxAttempts: 3,
                elapsedSeconds: 0,
                message: 'Deploying mesh to Adobe I/O...',
            });
        });

        it('should push the deployer’s own progress as a verifying phase', async () => {
            deployMock.mockImplementation(
                async (
                    _path: string,
                    _executor: CommandExecutor,
                    _logger: unknown,
                    onProgress: (message: string, subMessage?: string) => void
                ) => {
                    clock.now += DEPLOY_MS;
                    onProgress('Deploying mesh', 'Uploading schema');
                    onProgress('Verifying mesh');
                    return { success: true, data: { endpoint: 'https://e.adobe.io/graphql' } };
                }
            );

            await deployNewMesh(buildContext(), {});

            expect(progressTracker).toHaveBeenCalledWith(
                'Deploying API Mesh',
                80,
                'Uploading schema'
            );
            expect(progressTracker).toHaveBeenCalledWith(
                'Deploying API Mesh',
                80,
                'Verifying mesh'
            );
            expect(phasesOfStatus('verifying')[0]).toEqual({
                status: 'verifying',
                attempt: 1,
                maxAttempts: 3,
                elapsedSeconds: DEPLOY_MS / 1000,
                message: 'Uploading schema',
            });
        });

        it('should push a success phase carrying the elapsed time and the endpoint', async () => {
            await deployNewMesh(buildContext(), undefined);

            expect(phasesOfStatus('success')).toEqual([
                {
                    status: 'success',
                    attempt: 1,
                    maxAttempts: 3,
                    elapsedSeconds: DEPLOY_MS / 1000,
                    endpoint: 'https://deployed.adobe.io/graphql',
                    message: 'Mesh deployed successfully',
                },
            ]);
        });
    });

    describe('failure, retry and cancellation', () => {
        it('should retry once the user asks for it and succeed on the second attempt', async () => {
            waitForMeshDecision.mockResolvedValue('retry');
            deployMock
                .mockImplementationOnce(async () => {
                    clock.now += DEPLOY_MS;
                    return { success: false, error: 'boom' };
                })
                .mockImplementationOnce(async () => {
                    clock.now += DEPLOY_MS;
                    return { success: true, data: { endpoint: 'https://second.adobe.io/graphql' } };
                });

            await deployNewMesh(buildContext({ waitForMeshDecision }), {});

            expect(deployMock).toHaveBeenCalledTimes(2);
            expect(waitForMeshDecision).toHaveBeenCalledTimes(1);
            expect(phasesOfStatus('error')).toEqual([
                {
                    status: 'error',
                    attempt: 1,
                    maxAttempts: 3,
                    elapsedSeconds: DEPLOY_MS / 1000,
                    errorMessage: formatted('boom'),
                    message: 'Mesh deployment failed',
                },
            ]);
            expect(phasesOfStatus('deploying')[1]).toEqual({
                status: 'deploying',
                attempt: 2,
                maxAttempts: 3,
                elapsedSeconds: DEPLOY_MS / 1000,
                message: 'Deploying mesh to Adobe I/O...',
            });
        });

        it('should stop with a cancellation error when the user declines the retry', async () => {
            waitForMeshDecision.mockResolvedValue('cancel');
            deployAnswers({ success: false, error: 'boom' });

            await expect(deployNewMesh(buildContext({ waitForMeshDecision }), {})).rejects.toThrow(
                'Mesh deployment cancelled by user'
            );
            expect(deployMock).toHaveBeenCalledTimes(1);
        });

        it('should throw the formatted error at once when there is no retry channel', async () => {
            deployAnswers({ success: false, error: 'boom' });

            await expect(deployNewMesh(buildContext(), {})).rejects.toThrow(formatted('boom'));
            expect(deployMock).toHaveBeenCalledTimes(1);
            expect(phasesOfStatus('error')).toEqual([
                {
                    status: 'error',
                    attempt: 1,
                    maxAttempts: 3,
                    elapsedSeconds: DEPLOY_MS / 1000,
                    errorMessage: formatted('boom'),
                    message: 'Mesh deployment failed',
                },
            ]);
        });

        it('should use the default message when the deploy result carries no error', async () => {
            deployAnswers({ success: false });

            await expect(deployNewMesh(buildContext(), {})).rejects.toThrow(
                formatted('Mesh deployment failed')
            );
        });

        it('should report the exhausted message after three failed attempts', async () => {
            waitForMeshDecision.mockResolvedValue('retry');
            deployAnswers({ success: false, error: 'boom' });

            await expect(deployNewMesh(buildContext({ waitForMeshDecision }), {})).rejects.toThrow(
                formatted('boom')
            );
            expect(deployMock).toHaveBeenCalledTimes(3);
            expect(waitForMeshDecision).toHaveBeenCalledTimes(2);
            expect(phasesOfStatus('error').at(-1)).toEqual({
                status: 'error',
                attempt: 3,
                maxAttempts: 3,
                elapsedSeconds: (DEPLOY_MS * 3) / 1000,
                errorMessage: formatted('boom'),
                message: 'Mesh deployment failed after 3 attempts',
            });
        });
    });
});
