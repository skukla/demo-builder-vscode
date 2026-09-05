import { deployAppComponent } from '@/features/app-builder/services/appDeployment';
import { mockFs, createMockCommandManager, createMockLogger } from './appDeployment.testUtils';

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
        mkdtemp: jest.fn(),
        rm: jest.fn(),
    },
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        LONG: 180000,
    },
}));

// Runtime credentials are fetched before the deploy (catalog repos ship no
// .env); mock the fetch so the deploy-tail tests stay focused, keep the real
// stderr extractor (pure function).
jest.mock('@/features/app-builder/services/runtimeCredentials', () => ({
    extractAioErrorDetail: jest.requireActual('@/features/app-builder/services/runtimeCredentials')
        .extractAioErrorDetail,
    fetchRuntimeCredentials: jest.fn().mockResolvedValue({
        namespace: 'test-namespace',
        auth: 'fake-test-pw-not-a-secret',
    }),
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
    return { code: 0, stdout, stderr: '', duration: 0 };
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

            const result = await deployAppComponent('/app', cm, logger);

            expect(result.success).toBe(true);
            expect(typeof result.data?.url).toBe('string');
            expect(result.data?.url).toBeTruthy();
            expect(result.data?.deployedUrls).toBeDefined();
            expect(Object.keys(result.data?.deployedUrls ?? {}).length).toBeGreaterThan(0);
        });

        it('should issue `aio app deploy` EXACTLY ONCE (no create/update branch)', async () => {
            wireHappyPath();

            await deployAppComponent('/app', cm, logger);

            const deployCalls = cm.execute.mock.calls.filter(
                (args: unknown[]) => args[0] === DEPLOY_CMD
            );
            expect(deployCalls).toHaveLength(1);
        });

        it('should call deploy before get-url', async () => {
            wireHappyPath();

            await deployAppComponent('/app', cm, logger);

            const commands = cm.execute.mock.calls.map((args: unknown[]) => args[0] as string);
            expect(commands).toContain(DEPLOY_CMD);
            expect(commands).toContain(GET_URL_CMD);
            expect(commands.indexOf(DEPLOY_CMD)).toBeLessThan(commands.indexOf(GET_URL_CMD));
        });

        it('should pass streaming, useNodeVersion and enhancePath to deploy', async () => {
            wireHappyPath();

            await deployAppComponent('/app', cm, logger);

            const deployCall = cm.execute.mock.calls.find(
                (args: unknown[]) => args[0] === DEPLOY_CMD
            );
            expect(deployCall?.[1]).toEqual(
                expect.objectContaining({
                    cwd: '/app',
                    streaming: true,
                    shell: true,
                    timeout: 180000,
                    useNodeVersion: 'auto',
                    enhancePath: true,
                })
            );
        });

        it('injects the workspace Runtime credentials as env on deploy AND get-url', async () => {
            wireHappyPath();

            await deployAppComponent('/app', cm, logger);

            const expectedEnv = {
                AIO_RUNTIME_NAMESPACE: 'test-namespace',
                AIO_RUNTIME_AUTH: 'fake-test-pw-not-a-secret',
            };
            const deployCall = cm.execute.mock.calls.find(
                (args: unknown[]) => args[0] === DEPLOY_CMD
            );
            const urlCall = cm.execute.mock.calls.find(
                (args: unknown[]) => args[0] === GET_URL_CMD
            );
            expect(deployCall?.[1]).toEqual(expect.objectContaining({ env: expectedEnv }));
            expect(urlCall?.[1]).toEqual(expect.objectContaining({ env: expectedEnv }));
        });

        it('should invoke onProgress', async () => {
            wireHappyPath();
            const onProgress = jest.fn();

            await deployAppComponent('/app', cm, logger, { onProgress });

            expect(onProgress).toHaveBeenCalled();
        });
    });

    describe('deploy failure', () => {
        it('should return a failure result when deploy exits non-zero', async () => {
            cm.execute.mockResolvedValue({
                code: 1,
                stdout: '',
                stderr: 'deploy boom',
                duration: 0,
            });

            const result = await deployAppComponent('/app', cm, logger);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error).toContain('deploy boom');
        });

        it('should NOT call get-url when deploy fails', async () => {
            cm.execute.mockResolvedValue({
                code: 1,
                stdout: '',
                stderr: 'deploy boom',
                duration: 0,
            });

            await deployAppComponent('/app', cm, logger);

            const getUrlCalls = cm.execute.mock.calls.filter(
                (args: unknown[]) => typeof args[0] === 'string' && args[0].includes('get-url')
            );
            expect(getUrlCalls).toHaveLength(0);
        });

        it('should fall back to stdout when stderr is empty on deploy failure', async () => {
            cm.execute.mockResolvedValue({
                code: 1,
                stdout: 'stdout boom',
                stderr: '',
                duration: 0,
            });

            const result = await deployAppComponent('/app', cm, logger);

            expect(result.success).toBe(false);
            expect(result.error).toContain('stdout boom');
        });
    });

    describe('what a failed deploy actually says', () => {
        const failWith = (result: { code: number; stdout?: string; stderr?: string }) => {
            cm.execute.mockImplementation((command: string) =>
                command.includes('app deploy')
                    ? Promise.resolve({ duration: 0, stdout: '', stderr: '', ...result })
                    : Promise.resolve(ok()),
            );
        };

        it('trims the stderr it falls back to', async () => {
            // oclif pads its frames; the untrimmed form arrives as a line of
            // leading spaces and reads like a truncated message.
            failWith({ code: 1, stderr: '  spaced boom  \n' });

            const result = await deployAppComponent('/app', cm, logger);

            expect(result.error).toBe('App deployment failed: spaced boom');
        });

        it('trims the stdout it falls back to next', async () => {
            failWith({ code: 1, stdout: '  stdout boom  ' });

            const result = await deployAppComponent('/app', cm, logger);

            expect(result.error).toBe('App deployment failed: stdout boom');
        });

        it('names the exit code when the command printed nothing at all', async () => {
            // Both streams empty is the shape CommandResult allows; the chain
            // has to fall all the way through rather than quote an empty line.
            failWith({ code: 2, stdout: '', stderr: '' });

            const result = await deployAppComponent('/app', cm, logger);

            expect(result.error).toBe('App deployment failed: aio app deploy exited with code 2');
        });
    });

    describe('the environment the deploy runs under', () => {
        it('merges the caller’s extra env, and keeps the Runtime pair its own', async () => {
            // The Runtime pair is fetched from the TARGETED workspace; a caller
            // overriding it would deploy to a namespace nobody asked for.
            cm.execute.mockImplementation((command: string) =>
                command.includes('get-url')
                    ? Promise.resolve(ok(GET_URL_JSON))
                    : Promise.resolve(ok('Deploy successful')),
            );

            await deployAppComponent('/app', cm, logger, {
                extraEnv: {
                    AIO_COMMERCE_AUTH_IMS_CLIENT_ID: 'client-id',
                    AIO_RUNTIME_NAMESPACE: 'caller-tried-this',
                },
            });

            const deployCall = cm.execute.mock.calls.find(
                (args: unknown[]) => args[0] === DEPLOY_CMD
            );
            expect((deployCall?.[1] as { env: Record<string, string> }).env).toEqual({
                AIO_COMMERCE_AUTH_IMS_CLIENT_ID: 'client-id',
                AIO_RUNTIME_NAMESPACE: 'test-namespace',
                AIO_RUNTIME_AUTH: 'fake-test-pw-not-a-secret',
            });
        });
    });

    describe('get-url defensive parsing', () => {
        /** Deploy succeeds; get-url answers with `stdout`. */
        function wireGetUrl(stdout: string) {
            cm.execute.mockImplementation((command: string) => {
                if (command.includes('get-url')) return Promise.resolve(ok(stdout));
                return Promise.resolve(ok('Deploy successful'));
            });
        }

        it('should return best-effort success when get-url exits non-zero', async () => {
            cm.execute.mockImplementation((command: string) => {
                if (command.includes('get-url')) {
                    return Promise.resolve({ code: 1, stdout: '', stderr: 'no url', duration: 0 });
                }
                return Promise.resolve(ok('Deploy successful'));
            });

            const result = await deployAppComponent('/app', cm, logger);

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

            const result = await deployAppComponent('/app', cm, logger);

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

            const result = await deployAppComponent('/app', cm, logger);

            expect(result.success).toBe(true);
            expect(result.data?.deployedUrls).toBeDefined();
        });

        /**
         * The flattening and the primary-URL choice had no test of their own —
         * the happy path only asked whether SOMETHING came back. What comes back
         * is the URL an SC is handed to open the app.
         */
        it('prefers a web/ URL over one that appears earlier in the payload', async () => {
            wireGetUrl(
                JSON.stringify({
                    runtime: { action: 'https://ns.adobeioruntime.net/api/v1/web/ns/action' },
                    web: { 'my-app': 'https://ns.adobeio-static.net/my-app/index.html' },
                }),
            );

            const result = await deployAppComponent('/app', cm, logger);

            expect(result.data?.url).toBe('https://ns.adobeio-static.net/my-app/index.html');
        });

        it('falls back to the first URL when nothing is under web/', async () => {
            wireGetUrl(
                JSON.stringify({
                    runtime: { first: 'https://one.example', second: 'https://two.example' },
                }),
            );

            const result = await deployAppComponent('/app', cm, logger);

            expect(result.data?.url).toBe('https://one.example');
        });

        it('flattens the whole tree into slash-joined names, at any depth', async () => {
            wireGetUrl(
                JSON.stringify({
                    web: { app: { nested: { deep: 'https://deep.example' } } },
                    runtime: { flat: 'https://flat.example' },
                }),
            );

            const result = await deployAppComponent('/app', cm, logger);

            expect(result.data?.deployedUrls).toEqual({
                'web/app/nested/deep': 'https://deep.example',
                'runtime/flat': 'https://flat.example',
            });
        });

        it('keeps only string leaves — numbers, booleans and null are not URLs', async () => {
            wireGetUrl(
                JSON.stringify({
                    web: { good: 'https://good.example', port: 3000, on: true, none: null },
                }),
            );

            const result = await deployAppComponent('/app', cm, logger);

            expect(result.data?.deployedUrls).toEqual({ 'web/good': 'https://good.example' });
        });

        it('returns nothing for a payload that is valid JSON but not an object', async () => {
            // `Object.entries('a string')` answers with its CHARACTERS, so the
            // guard is what stops a bare string becoming eleven "URLs".
            wireGetUrl(JSON.stringify('https://not-a-map.example'));

            const result = await deployAppComponent('/app', cm, logger);

            expect(result.success).toBe(true);
            expect(result.data).toEqual({ url: '', deployedUrls: {} });
        });

        it('does not trust the OUTPUT of a get-url that failed', async () => {
            // Deploy already succeeded, so this stays a success — but a command
            // that exited non-zero has not earned its stdout being parsed.
            cm.execute.mockImplementation((command: string) => {
                if (command.includes('get-url')) {
                    return Promise.resolve({
                        code: 1,
                        stdout: GET_URL_JSON,
                        stderr: 'no url',
                        duration: 0,
                    });
                }
                return Promise.resolve(ok('Deploy successful'));
            });

            const result = await deployAppComponent('/app', cm, logger);

            expect(result.success).toBe(true);
            expect(result.data).toEqual({ url: '', deployedUrls: {} });
        });

        it('passes the same shell, node version and enhanced PATH to get-url', async () => {
            wireGetUrl(GET_URL_JSON);

            await deployAppComponent('/app', cm, logger);

            const urlCall = cm.execute.mock.calls.find(
                (args: unknown[]) => args[0] === GET_URL_CMD
            );
            expect(urlCall?.[1]).toEqual({
                cwd: '/app',
                shell: true,
                timeout: 180000,
                useNodeVersion: 'auto',
                enhancePath: true,
                env: {
                    AIO_RUNTIME_NAMESPACE: 'test-namespace',
                    AIO_RUNTIME_AUTH: 'fake-test-pw-not-a-secret',
                },
            });
        });

        it('should request JSON output from get-url', async () => {
            cm.execute.mockImplementation((command: string) => {
                if (command.includes('get-url')) return Promise.resolve(ok(GET_URL_JSON));
                return Promise.resolve(ok('Deploy successful'));
            });

            await deployAppComponent('/app', cm, logger);

            const commands = cm.execute.mock.calls.map((args: unknown[]) => args[0] as string);
            expect(commands).toContain(GET_URL_CMD);
        });
    });
});

// ─── extension-layout workspace-config import (2026-08-27, measured live) ────
describe('extension layout: workspace config import', () => {
    let cm: ReturnType<typeof createMockCommandManager>;
    let logger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        cm = createMockCommandManager();
        logger = createMockLogger();
        mockFs.access.mockRejectedValue(new Error('ENOENT'));
        // The import helper's scratch-dir lifecycle runs through the mocked fs.
        mockFs.mkdtemp.mockResolvedValue('/tmp/db-use-test');
        mockFs.rm.mockResolvedValue(undefined);
        cm.execute.mockImplementation((command: string) => {
            if (command.includes('get-url')) return Promise.resolve(ok(GET_URL_JSON));
            return Promise.resolve(ok());
        });
    });

    it('downloads and imports the workspace config before building', async () => {
        await deployAppComponent('/app', cm, logger, { layout: 'extension' });

        const commands = cm.execute.mock.calls.map((c: unknown[]) => c[0] as string);
        const downloadIdx = commands.findIndex((c: string) =>
            c.startsWith('aio console workspace download')
        );
        const useIdx = commands.findIndex((c: string) => c.startsWith('aio app use'));
        expect(downloadIdx).toBeGreaterThanOrEqual(0);
        expect(useIdx).toBeGreaterThan(downloadIdx);
        // Non-interactive, overwrite, no service sync — the measured-live shape.
        expect(commands[useIdx]).toContain('--overwrite');
        expect(commands[useIdx]).toContain('--no-input');
    });

    it('standalone (and default) layout never imports workspace config', async () => {
        await deployAppComponent('/app', cm, logger, {});

        const commands = cm.execute.mock.calls.map((c: unknown[]) => c[0] as string);
        expect(commands.some((c: string) => c.startsWith('aio app use'))).toBe(false);
    });

    /** The options a command was RUN with, by the prefix of its command string. */
    const optionsFor = (prefix: string) =>
        cm.execute.mock.calls.find((c: unknown[]) => (c[0] as string).startsWith(prefix))?.[1];

    it('downloads and imports under the app’s node version and enhanced PATH', async () => {
        // Both run `aio`, which is resolved from the CLI's node silo — without
        // enhancePath the command is simply not found on a fresh machine.
        await deployAppComponent('/app', cm, logger, { layout: 'extension' });

        expect(optionsFor('aio console workspace download')).toEqual({
            shell: true,
            timeout: 180000,
            useNodeVersion: 'auto',
            enhancePath: true,
        });
        expect(optionsFor('aio app use')).toEqual({
            cwd: '/app',
            shell: true,
            timeout: 180000,
            useNodeVersion: 'auto',
            enhancePath: true,
        });
    });

    it('goes on to deploy once the import succeeds', async () => {
        // The three tests around this one read the COMMANDS that ran, which an
        // import that always failed would still satisfy — it fails after
        // running. This is the one that says the deploy actually happened.
        const result = await deployAppComponent('/app', cm, logger, { layout: 'extension' });

        expect(result.success).toBe(true);
        const commands = cm.execute.mock.calls.map((c: unknown[]) => c[0] as string);
        expect(commands).toContain('aio app deploy');
    });

    it('removes the scratch directory AND the .env that `aio app use` writes', async () => {
        // `aio app use` drops the workspace's Runtime auth key into the app's
        // .env. This pipeline injects credentials per-invocation and keeps
        // secrets off disk, so both have to go — on every path, not just this one.
        await deployAppComponent('/app', cm, logger, { layout: 'extension' });

        expect(mockFs.rm).toHaveBeenCalledWith('/tmp/db-use-test', {
            recursive: true,
            force: true,
        });
        expect(mockFs.rm).toHaveBeenCalledWith('/app/.env', { force: true });
    });

    it('cleans up even when the import fails', async () => {
        cm.execute.mockImplementation((command: string) =>
            command.startsWith('aio app use')
                ? Promise.resolve({ code: 1, stdout: '', stderr: '', duration: 0 })
                : Promise.resolve(ok()),
        );

        await deployAppComponent('/app', cm, logger, { layout: 'extension' });

        expect(mockFs.rm).toHaveBeenCalledWith('/app/.env', { force: true });
    });

    it('stops at a failed download, and says what Adobe said', async () => {
        cm.execute.mockImplementation((command: string) =>
            command.startsWith('aio console workspace download')
                ? Promise.resolve({
                      code: 1,
                      stdout: '',
                      stderr: '› Error: workspace not found',
                      duration: 0,
                  })
                : Promise.resolve(ok()),
        );

        const result = await deployAppComponent('/app', cm, logger, { layout: 'extension' });

        expect(result.success).toBe(false);
        expect(result.error).toBe(
            'Could not download workspace configuration: Error: workspace not found',
        );
        const commands = cm.execute.mock.calls.map((c: unknown[]) => c[0] as string);
        expect(commands.some((c: string) => c.startsWith('aio app use'))).toBe(false);
        expect(commands.some((c: string) => c === 'aio app deploy')).toBe(false);
    });

    it('names the exit code when a failed download printed nothing usable', async () => {
        cm.execute.mockImplementation((command: string) =>
            command.startsWith('aio console workspace download')
                ? Promise.resolve({ code: 7, stdout: '', stderr: '', duration: 0 })
                : Promise.resolve(ok()),
        );

        const result = await deployAppComponent('/app', cm, logger, { layout: 'extension' });

        expect(result.error).toBe('Could not download workspace configuration: exit code 7');
    });

    it('stops at a failed import, and says what Adobe said', async () => {
        cm.execute.mockImplementation((command: string) =>
            command.startsWith('aio app use')
                ? Promise.resolve({
                      code: 1,
                      stdout: '',
                      stderr: '› Error: not entitled',
                      duration: 0,
                  })
                : Promise.resolve(ok()),
        );

        const result = await deployAppComponent('/app', cm, logger, { layout: 'extension' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Could not import workspace configuration: Error: not entitled');
        const commands = cm.execute.mock.calls.map((c: unknown[]) => c[0] as string);
        expect(commands.some((c: string) => c === 'aio app deploy')).toBe(false);
    });

    it('names the exit code when a failed import printed nothing usable', async () => {
        cm.execute.mockImplementation((command: string) =>
            command.startsWith('aio app use')
                ? Promise.resolve({ code: 9, stdout: '', stderr: '', duration: 0 })
                : Promise.resolve(ok()),
        );

        const result = await deployAppComponent('/app', cm, logger, { layout: 'extension' });

        expect(result.error).toBe('Could not import workspace configuration: exit code 9');
    });
});
