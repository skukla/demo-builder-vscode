import { deployAppComponent } from '@/features/app-builder/services/appDeployment';
import {
    mockFs,
    createMockCommandManager,
    createMockLogger,
} from './appDeployment.testUtils';

/**
 * deployAppComponent Test Suite
 *
 * App Builder deploy tail (Option A: shares only buildComponent; keeps its own
 * honest deploy tail). Sequence: buildComponent -> `aio app deploy` (ONCE,
 * idempotent, no create/update branch) -> `aio app get-url --json` (parsed
 * defensively).
 *
 * Behavior:
 * - happy path -> { success: true, data: { url, deployedUrls } }
 * - `aio app deploy` issued EXACTLY ONCE
 * - deploy non-zero exit -> { success: false, error }
 * - get-url non-zero / unparseable -> graceful best-effort success (deploy
 *   already succeeded), empty url/deployedUrls (never throws on bad shape)
 * - streaming / useNodeVersion / enhancePath passed to deploy
 *
 * Total tests: 12
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

const DEPLOY_CMD = 'aio app deploy';
const GET_URL_CMD = 'aio app get-url --json';

/** A plausible `aio app get-url --json` payload (shape unverified — Step 7). */
const GET_URL_JSON = JSON.stringify({
    runtime: {
        'my-app/generic': 'https://adobeioruntime.net/api/v1/web/ns/my-app/generic',
    },
    web: {
        'my-app': 'https://ns.adobeio-static.net/my-app/index.html',
    },
});

function ok(stdout = '') {
    return { code: 0, stdout, stderr: '' };
}

describe('deployAppComponent', () => {
    let cm: ReturnType<typeof createMockCommandManager>;
    let logger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        cm = createMockCommandManager();
        logger = createMockLogger();
        // No build script -> buildComponent is a no-op, isolating the deploy tail.
        mockFs.access.mockRejectedValue(new Error('ENOENT'));
    });

    describe('happy path', () => {
        function wireHappyPath() {
            cm.execute.mockImplementation((command: string) => {
                if (command.includes('get-url')) return Promise.resolve(ok(GET_URL_JSON));
                return Promise.resolve(ok('Deploy successful'));
            });
        }

        it('should return success with a primary url and deployedUrls map', async () => {
            wireHappyPath();

            const result = await deployAppComponent('/app', cm as any, logger as any);

            expect(result.success).toBe(true);
            expect(typeof result.data?.url).toBe('string');
            expect(result.data?.url).toBeTruthy();
            expect(result.data?.deployedUrls).toBeDefined();
            expect(Object.keys(result.data?.deployedUrls ?? {}).length).toBeGreaterThan(0);
        });

        it('should issue `aio app deploy` EXACTLY ONCE (no create/update branch)', async () => {
            wireHappyPath();

            await deployAppComponent('/app', cm as any, logger as any);

            const deployCalls = cm.execute.mock.calls.filter(
                (args: unknown[]) => args[0] === DEPLOY_CMD,
            );
            expect(deployCalls).toHaveLength(1);
        });

        it('should call deploy before get-url', async () => {
            wireHappyPath();

            await deployAppComponent('/app', cm as any, logger as any);

            const commands = cm.execute.mock.calls.map((args: unknown[]) => args[0] as string);
            expect(commands).toContain(DEPLOY_CMD);
            expect(commands).toContain(GET_URL_CMD);
            expect(commands.indexOf(DEPLOY_CMD)).toBeLessThan(commands.indexOf(GET_URL_CMD));
        });

        it('should pass streaming, useNodeVersion and enhancePath to deploy', async () => {
            wireHappyPath();

            await deployAppComponent('/app', cm as any, logger as any);

            const deployCall = cm.execute.mock.calls.find(
                (args: unknown[]) => args[0] === DEPLOY_CMD,
            );
            expect(deployCall?.[1]).toEqual(
                expect.objectContaining({
                    cwd: '/app',
                    streaming: true,
                    shell: true,
                    timeout: 180000,
                    useNodeVersion: 'auto',
                    enhancePath: true,
                }),
            );
        });

        it('should invoke onProgress', async () => {
            wireHappyPath();
            const onProgress = jest.fn();

            await deployAppComponent('/app', cm as any, logger as any, onProgress);

            expect(onProgress).toHaveBeenCalled();
        });
    });

    describe('deploy failure', () => {
        it('should return a failure result when deploy exits non-zero', async () => {
            cm.execute.mockResolvedValue({ code: 1, stdout: '', stderr: 'deploy boom' });

            const result = await deployAppComponent('/app', cm as any, logger as any);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error).toContain('deploy boom');
        });

        it('should NOT call get-url when deploy fails', async () => {
            cm.execute.mockResolvedValue({ code: 1, stdout: '', stderr: 'deploy boom' });

            await deployAppComponent('/app', cm as any, logger as any);

            const getUrlCalls = cm.execute.mock.calls.filter(
                (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('get-url'),
            );
            expect(getUrlCalls).toHaveLength(0);
        });

        it('should fall back to stdout when stderr is empty on deploy failure', async () => {
            cm.execute.mockResolvedValue({ code: 1, stdout: 'stdout boom', stderr: '' });

            const result = await deployAppComponent('/app', cm as any, logger as any);

            expect(result.success).toBe(false);
            expect(result.error).toContain('stdout boom');
        });
    });

    describe('get-url defensive parsing', () => {
        it('should return best-effort success when get-url exits non-zero', async () => {
            cm.execute.mockImplementation((command: string) => {
                if (command.includes('get-url')) {
                    return Promise.resolve({ code: 1, stdout: '', stderr: 'no url' });
                }
                return Promise.resolve(ok('Deploy successful'));
            });

            const result = await deployAppComponent('/app', cm as any, logger as any);

            // Deploy succeeded; missing URL must not turn it into a failure.
            expect(result.success).toBe(true);
            expect(result.data?.url).toBe('');
            expect(result.data?.deployedUrls).toEqual({});
        });

        it('should return best-effort success when get-url JSON is unparseable', async () => {
            cm.execute.mockImplementation((command: string) => {
                if (command.includes('get-url')) {
                    return Promise.resolve(ok('not json at all <<<'));
                }
                return Promise.resolve(ok('Deploy successful'));
            });

            const result = await deployAppComponent('/app', cm as any, logger as any);

            expect(result.success).toBe(true);
            expect(result.data?.url).toBe('');
            expect(result.data?.deployedUrls).toEqual({});
        });

        it('should tolerate a parseable-but-unexpected shape without throwing', async () => {
            cm.execute.mockImplementation((command: string) => {
                if (command.includes('get-url')) {
                    return Promise.resolve(ok(JSON.stringify({ totally: 'unexpected' })));
                }
                return Promise.resolve(ok('Deploy successful'));
            });

            const result = await deployAppComponent('/app', cm as any, logger as any);

            expect(result.success).toBe(true);
            expect(result.data?.deployedUrls).toBeDefined();
        });

        it('should request JSON output from get-url', async () => {
            cm.execute.mockImplementation((command: string) => {
                if (command.includes('get-url')) return Promise.resolve(ok(GET_URL_JSON));
                return Promise.resolve(ok('Deploy successful'));
            });

            await deployAppComponent('/app', cm as any, logger as any);

            const commands = cm.execute.mock.calls.map((args: unknown[]) => args[0] as string);
            expect(commands).toContain(GET_URL_CMD);
        });
    });
});
