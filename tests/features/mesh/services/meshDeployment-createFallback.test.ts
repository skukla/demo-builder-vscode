import { deployMeshComponent } from '@/features/mesh/services/meshDeployment';
import {
    createMockCommandManager,
    createMockLogger,
    mockSuccessfulFileRead,
    mockSuccessfulVerification,
} from './meshDeployment.testUtils';
import type { CommandResult } from '@/core/shell/types';

/**
 * MeshDeployment — create→update fallback (regression)
 *
 * The create-vs-update strategy keys off PROJECT state (`existingMeshId`),
 * which is empty for every NEW project — but the remote workspace may already
 * carry a mesh (Adobe allows one per workspace). `aio api-mesh:create` then
 * fails with "Selected org, project and workspace already has a mesh" and
 * creation aborted with no fallback (live incident 2026-07-15; backlog
 * `.rptc/complete/2026-07-15-mesh-create-vs-update-remote-probe.md`).
 *
 * Pins: the signature triggers ONE retry as update (same org context — the
 * retry happens inside the same deployMeshComponent call the caller wrapped
 * in withOrgContext); unrelated failures do NOT retry; an update failure does
 * not loop; the failure message carries the CLI's own words (non-blank).
 */

// Mock dependencies (same scaffold as meshDeployment-operations.test.ts)
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

jest.mock('@/features/mesh/services/meshDeploymentVerifier', () => ({
    waitForMeshDeployment: jest.fn(),
}));

const ALREADY_HAS_MESH_STDOUT =
    'Selected organization: Adobe Demo System\n' +
    'Selected project: Kukla Mesh Test\n' +
    'Select workspace: Stage\n' +
    'The provided mesh contains placeholders. Starting mesh interpolation process.\n' +
    'Selected org, project and workspace already has a mesh\n';

const ALREADY_HAS_MESH_STDERR =
    ' ›   Error: Unable to create a mesh. Check the mesh configuration file and try \n' +
    ' ›   again. If the error persists please contact support. RequestId: abc123\n';

describe('MeshDeployment — create→update fallback', () => {
    let mockCommandManager: ReturnType<typeof createMockCommandManager>;
    let mockLogger: ReturnType<typeof createMockLogger>;

    /** Route the executor mock by command: build succeeds; create/update per config. */
    function routeCommands(config: {
        // Partial<CommandResult> & the code: callers supply only what they vary,
        // and the defaults below complete it — the fake is typed now, so an
        // incomplete result no longer slips through.
        create?: Partial<CommandResult> & { code: number };
        update?: Partial<CommandResult> & { code: number };
    }): void {
        mockCommandManager.execute.mockImplementation((command: string) => {
            if (command.includes('api-mesh:create')) {
                return Promise.resolve({ stdout: 'created', stderr: '', duration: 0, code: 0, ...config.create });
            }
            if (command.includes('api-mesh:update')) {
                return Promise.resolve({ stdout: 'updated', stderr: '', duration: 0, code: 0, ...config.update });
            }
            return Promise.resolve({ code: 0, stdout: '', stderr: '', duration: 0 }); // build etc.
        });
    }

    function commandsMatching(fragment: string): string[] {
        return mockCommandManager.execute.mock.calls
            .map((call: unknown[]) => call[0] as string)
            .filter((cmd: string) => cmd.includes(fragment));
    }

    beforeEach(() => {
        jest.clearAllMocks();
        mockCommandManager = createMockCommandManager();
        mockLogger = createMockLogger();
        mockSuccessfulFileRead();
        mockSuccessfulVerification();
    });

    it('retries as update when create fails with "already has a mesh"', async () => {
        routeCommands({
            create: { code: 2, stdout: ALREADY_HAS_MESH_STDOUT, stderr: ALREADY_HAS_MESH_STDERR },
            update: { code: 0, stdout: 'Successfully updated mesh' },
        });

        const result = await deployMeshComponent(
            '/test/mesh',
            mockCommandManager,
            mockLogger
        );

        expect(commandsMatching('api-mesh:create')).toHaveLength(1);
        expect(commandsMatching('api-mesh:update')).toHaveLength(1);
        expect(result.success).toBe(true);
    });

    it('reports the fallback via progress so the user sees "updating instead"', async () => {
        routeCommands({
            create: { code: 2, stdout: ALREADY_HAS_MESH_STDOUT, stderr: ALREADY_HAS_MESH_STDERR },
            update: { code: 0, stdout: 'Successfully updated mesh' },
        });
        const onProgress = jest.fn();

        await deployMeshComponent(
            '/test/mesh',
            mockCommandManager,
            mockLogger,
            onProgress
        );

        const progressText = onProgress.mock.calls.flat().filter(Boolean).join(' ');
        expect(progressText.toLowerCase()).toContain('updating');
    });

    it('does NOT retry when create fails with an unrelated error', async () => {
        routeCommands({
            create: { code: 1, stdout: '', stderr: ' ›   Error: Invalid mesh configuration' },
        });

        const result = await deployMeshComponent(
            '/test/mesh',
            mockCommandManager,
            mockLogger
        );

        expect(commandsMatching('api-mesh:create')).toHaveLength(1);
        expect(commandsMatching('api-mesh:update')).toHaveLength(0);
        expect(result.success).toBe(false);
    });

    it('does NOT loop when the UPDATE path itself fails with the signature', async () => {
        routeCommands({
            update: { code: 2, stdout: ALREADY_HAS_MESH_STDOUT, stderr: ALREADY_HAS_MESH_STDERR },
        });

        const result = await deployMeshComponent(
            '/test/mesh',
            mockCommandManager,
            mockLogger,
            undefined,
            'mesh-123' // existing mesh → update strategy from the start
        );

        expect(commandsMatching('api-mesh:update')).toHaveLength(1);
        expect(commandsMatching('api-mesh:create')).toHaveLength(0);
        expect(result.success).toBe(false);
    });

    it('surfaces the CLI error content on the FIRST line of the failure (not blank)', async () => {
        routeCommands({
            create: { code: 1, stdout: '', stderr: ' ›   Error: Invalid mesh configuration' },
        });

        const result = await deployMeshComponent(
            '/test/mesh',
            mockCommandManager,
            mockLogger
        );

        expect(result.success).toBe(false);
        const firstLine = (result.error ?? '').split('\n')[0];
        expect(firstLine).toContain('Error: Invalid mesh configuration');
    });
});

// Signature verified LIVE 2026-07-16: a project edit reused a stored meshId
// whose remote mesh had been deleted out-of-band → `aio api-mesh:update`
// failed with "Unable to update. No mesh found for Org(...)". The inverse of
// the create→update fallback above; same one-shot rule, opposite direction.
const NO_MESH_FOUND_STDERR =
    ' ›   Error: Unable to update. No mesh found for Org(285361) -> \n' +
    ' ›   Project(4566206088345747129) -> Workspace(4566206088345747128)\n';

describe('MeshDeployment — update→create fallback (remote mesh vanished)', () => {
    let mockCommandManager: ReturnType<typeof createMockCommandManager>;
    let mockLogger: ReturnType<typeof createMockLogger>;

    function routeCommands(config: {
        create?: Partial<CommandResult> & { code: number };
        update?: Partial<CommandResult> & { code: number };
    }): void {
        mockCommandManager.execute.mockImplementation((command: string) => {
            if (command.includes('api-mesh:create')) {
                return Promise.resolve({ stdout: 'created', stderr: '', duration: 0, code: 0, ...config.create });
            }
            if (command.includes('api-mesh:update')) {
                return Promise.resolve({ stdout: 'updated', stderr: '', duration: 0, code: 0, ...config.update });
            }
            return Promise.resolve({ code: 0, stdout: '', stderr: '', duration: 0 });
        });
    }

    function commandsMatching(fragment: string): string[] {
        return mockCommandManager.execute.mock.calls
            .map((call: unknown[]) => call[0] as string)
            .filter((cmd: string) => cmd.includes(fragment));
    }

    beforeEach(() => {
        jest.clearAllMocks();
        mockCommandManager = createMockCommandManager();
        mockLogger = createMockLogger();
        mockSuccessfulFileRead();
        mockSuccessfulVerification();
    });

    it('retries as create when update fails with "No mesh found"', async () => {
        routeCommands({
            update: { code: 2, stdout: '', stderr: NO_MESH_FOUND_STDERR },
            create: { code: 0, stdout: 'Successfully created mesh' },
        });

        const result = await deployMeshComponent(
            '/test/mesh',
            mockCommandManager,
            mockLogger,
            undefined,
            'stale-mesh-id', // stored id → update strategy from the start
        );

        expect(commandsMatching('api-mesh:update')).toHaveLength(1);
        expect(commandsMatching('api-mesh:create')).toHaveLength(1);
        expect(result.success).toBe(true);
    });

    it('does NOT retry when update fails with an unrelated error', async () => {
        routeCommands({
            update: { code: 1, stdout: '', stderr: ' ›   Error: Invalid mesh configuration' },
        });

        const result = await deployMeshComponent(
            '/test/mesh',
            mockCommandManager,
            mockLogger,
            undefined,
            'stale-mesh-id',
        );

        expect(commandsMatching('api-mesh:update')).toHaveLength(1);
        expect(commandsMatching('api-mesh:create')).toHaveLength(0);
        expect(result.success).toBe(false);
    });

    it('never chains fallbacks: create→update that then hits "No mesh found" stops', async () => {
        // Pathological ping-pong guard: create fails "already has a mesh" →
        // fallback runs update → update fails "no mesh found". EXACTLY one
        // fallback per deploy — the second failure surfaces, no third call.
        routeCommands({
            create: { code: 2, stdout: ALREADY_HAS_MESH_STDOUT, stderr: ALREADY_HAS_MESH_STDERR },
            update: { code: 2, stdout: '', stderr: NO_MESH_FOUND_STDERR },
        });

        const result = await deployMeshComponent(
            '/test/mesh',
            mockCommandManager,
            mockLogger,
        );

        expect(commandsMatching('api-mesh:create')).toHaveLength(1);
        expect(commandsMatching('api-mesh:update')).toHaveLength(1);
        expect(result.success).toBe(false);
    });

    it('reports the fallback via progress so the user sees "creating instead"', async () => {
        routeCommands({
            update: { code: 2, stdout: '', stderr: NO_MESH_FOUND_STDERR },
            create: { code: 0, stdout: 'Successfully created mesh' },
        });
        const onProgress = jest.fn();

        await deployMeshComponent(
            '/test/mesh',
            mockCommandManager,
            mockLogger,
            onProgress,
            'stale-mesh-id',
        );

        const progressText = onProgress.mock.calls.flat().filter(Boolean).join(' ');
        expect(progressText.toLowerCase()).toContain('creating instead');
    });
});
