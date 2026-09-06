import { deployMeshComponent } from '@/features/mesh/services/meshDeployment';
import {
    mockFs,
    createMockCommandManager,
    createMockLogger,
    setupMeshDeploymentVerifierMock,
    getMeshDeploymentVerifier,
    mockSuccessfulFileRead,
    mockSuccessfulDeployment,
    mockSuccessfulVerification,
} from './meshDeployment.testUtils';

/**
 * MeshDeployment — what the deploy actually ASKS FOR.
 *
 * Everything here is an argument nothing else checks: the build command the
 * shared build step is told to run, the exec options the `aio api-mesh` call
 * carries, and the progress the CLI's own streaming output is translated into.
 * A mock answers the same however it is called, so these assert the CALL.
 */

jest.mock('fs', () => ({
    promises: {
        access: jest.fn(),
        readFile: jest.fn(),
    },
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        LONG: 180000,
    },
}));

describe('MeshDeployment — the commands and options it issues', () => {
    let mockCommandManager: ReturnType<typeof createMockCommandManager>;
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockCommandManager = createMockCommandManager();
        mockLogger = createMockLogger();
        setupMeshDeploymentVerifierMock();
    });

    /** Every (command, options) pair the executor was handed. */
    function callsMatching(fragment: string) {
        return mockCommandManager.execute.mock.calls.filter((call: unknown[]) =>
            String(call[0]).includes(fragment)
        );
    }

    /**
     * A component that DOES have a build script, so the shared build step runs
     * instead of returning early. Every other suite here has a package.json
     * without one, which is why the build arguments were never seen.
     */
    function withBuildScript(): void {
        mockFs.access.mockResolvedValue(undefined);
        mockFs.readFile.mockImplementation(async (target: unknown) =>
            String(target).endsWith('package.json')
                ? JSON.stringify({ scripts: { build: 'node scripts/build-mesh.js' } })
                : JSON.stringify({ meshConfig: { sources: [] } })
        );
    }

    // The mesh build has always issued `npm run build -- --force`; the
    // `-- --force` is the buildArgs this module hands the shared build step,
    // and without it a stale build/ directory is reused.
    it('builds with --force, through the shared build step', async () => {
        withBuildScript();
        mockCommandManager.execute.mockResolvedValue({
            code: 0,
            stdout: 'ok',
            stderr: '',
            duration: 0,
        });
        mockSuccessfulVerification();

        await deployMeshComponent('/path/to/mesh', mockCommandManager, mockLogger);

        expect(callsMatching('npm run build')).toHaveLength(1);
        expect(callsMatching('npm run build')[0][0]).toBe('npm run build -- --force');
    });

    it('runs the mesh command streamed, in a shell, with telemetry off', async () => {
        mockSuccessfulFileRead();
        mockSuccessfulDeployment(mockCommandManager);
        mockSuccessfulVerification();

        await deployMeshComponent('/path/to/mesh', mockCommandManager, mockLogger);

        const [, options] = callsMatching('api-mesh:')[0] as [string, Record<string, unknown>];
        expect(options).toMatchObject({
            cwd: '/path/to/mesh',
            streaming: true,
            shell: true,
            configureTelemetry: false,
            enhancePath: true,
        });
    });
});

describe('MeshDeployment — translating CLI output into progress', () => {
    let mockCommandManager: ReturnType<typeof createMockCommandManager>;
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockCommandManager = createMockCommandManager();
        mockLogger = createMockLogger();
        setupMeshDeploymentVerifierMock();
        mockSuccessfulFileRead();
        mockSuccessfulVerification();
    });

    /**
     * Deploy while feeding `lines` to the mesh command's own output handler,
     * which is the only way this translation is reachable.
     */
    async function deployEmitting(
        lines: string[],
        opts: { onProgress?: jest.Mock; existingMeshId?: string } = {}
    ) {
        mockCommandManager.execute.mockImplementation(
            async (command: string, options?: { onOutput?: (data: string) => void }) => {
                if (command.includes('api-mesh:')) {
                    lines.forEach((line) => options?.onOutput?.(line));
                }
                return { code: 0, stdout: 'Success', stderr: '', duration: 0 };
            }
        );
        return deployMeshComponent(
            '/path/to/mesh',
            mockCommandManager,
            mockLogger,
            opts.onProgress,
            opts.existingMeshId
        );
    }

    /** Every sub-message the run reported, in order. */
    function subMessages(onProgress: jest.Mock): string[] {
        return onProgress.mock.calls.map((call: unknown[]) => String(call[1]));
    }

    it('reports the deploying phase, which no other line stands in for', async () => {
        const onProgress = jest.fn();

        await deployEmitting(['Deploying mesh to the workspace'], { onProgress });

        expect(subMessages(onProgress)).toContain('Deploying mesh');
    });

    // The verb follows the command actually running, so an update never
    // reports that it created anything.
    it('says the mesh was UPDATED when an existing mesh id drove an update', async () => {
        const onProgress = jest.fn();

        await deployEmitting(['Success!'], { onProgress, existingMeshId: 'mesh-1' });

        expect(subMessages(onProgress)).toContain('Mesh updated successfully');
    });

    it('says the mesh was CREATED when there was no existing mesh id', async () => {
        const onProgress = jest.fn();

        await deployEmitting(['Success!'], { onProgress });

        expect(subMessages(onProgress)).toContain('Mesh created successfully');
    });

    it('names the right infrastructure verb while the mesh is being built', async () => {
        const onUpdate = jest.fn();
        await deployEmitting(['Updating mesh...'], {
            onProgress: onUpdate,
            existingMeshId: 'mesh-1',
        });

        expect(subMessages(onUpdate)).toContain('Updating mesh infrastructure');
    });

    // Output that matches none of the phases reports none of them — the last
    // arm is a match, not a default.
    it('reports nothing for output it does not recognise', async () => {
        const onProgress = jest.fn();

        await deployEmitting(['Reticulating splines'], { onProgress });

        expect(subMessages(onProgress)).not.toContain('Mesh created successfully');
    });

    /**
     * Every progress call in this module is optional-chained because
     * `onProgress` genuinely is optional — the headless deploy passes none.
     * A run that emits every phase and reports nowhere must still succeed.
     */
    it('survives a deploy with no progress callback at all', async () => {
        const result = await deployEmitting([
            'Validating configuration',
            'Creating mesh',
            'Deploying now',
            'Success!',
        ]);

        expect(result.success).toBe(true);
    });

    it('survives verification progress with no progress callback at all', async () => {
        const { waitForMeshDeployment } = getMeshDeploymentVerifier();
        waitForMeshDeployment.mockImplementation(
            async ({ onProgress }: { onProgress: () => void }) => {
                onProgress();
                return { deployed: true, meshId: 'mesh123', endpoint: 'https://e/graphql' };
            }
        );
        mockSuccessfulDeployment(mockCommandManager);

        const result = await deployMeshComponent('/path/to/mesh', mockCommandManager, mockLogger);

        expect(result.success).toBe(true);
    });
});
