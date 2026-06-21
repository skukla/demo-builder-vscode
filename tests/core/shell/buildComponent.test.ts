import { buildComponent } from '@/core/shell/buildComponent';
import { createMockCommandManager, createMockLogger } from './buildComponent.testUtils';
import { mockFs } from './buildComponent.testUtils';

/**
 * buildComponent Test Suite
 *
 * Shared build step extracted from buildMeshComponent (Option A: share ONLY
 * the byte-identical build step). Behavior must match the mesh build exactly:
 * - no package.json -> no-op (no commands run)
 * - package.json without a build script -> early return (no commands run)
 * - install failure (non-zero) -> warn, continue (does NOT throw)
 * - build failure (non-zero) -> throws
 * - passes useNodeVersion / enhancePath
 * - honors buildArgs (mesh '-- --force' vs app none)
 *
 * Total tests: 13
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

const PKG_WITH_BUILD = JSON.stringify({ scripts: { build: 'node scripts/build.js' } });
const PKG_NO_BUILD = JSON.stringify({ scripts: { start: 'node index.js' } });

const INSTALL_CMD = 'npm install --production --no-fund --ignore-scripts';
const INTEGRATION_INSTALL_CMD = 'npm install --no-fund --ignore-scripts';

describe('buildComponent', () => {
    let cm: ReturnType<typeof createMockCommandManager>;
    let logger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        cm = createMockCommandManager();
        logger = createMockLogger();
    });

    describe('guards (no-op cases)', () => {
        it('should be a no-op when package.json is missing', async () => {
            mockFs.access.mockRejectedValue(new Error('ENOENT'));

            await buildComponent('/p', cm as any, { nodeVersion: '20' }, logger as any);

            expect(cm.execute).not.toHaveBeenCalled();
        });

        it('should early return when package.json has no build script', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(PKG_NO_BUILD);

            await buildComponent('/p', cm as any, { nodeVersion: '20' }, logger as any);

            expect(cm.execute).not.toHaveBeenCalled();
        });
    });

    describe('install step', () => {
        beforeEach(() => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(PKG_WITH_BUILD);
        });

        it('should run npm install with the exact mesh install flags', async () => {
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

            await buildComponent('/p', cm as any, { nodeVersion: '20' }, logger as any);

            expect(cm.execute).toHaveBeenNthCalledWith(1, INSTALL_CMD, expect.any(Object));
        });

        it('should pass useNodeVersion and enhancePath to install', async () => {
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

            await buildComponent('/p', cm as any, { nodeVersion: '22' }, logger as any);

            expect(cm.execute).toHaveBeenNthCalledWith(
                1,
                INSTALL_CMD,
                expect.objectContaining({
                    cwd: '/p',
                    shell: true,
                    timeout: 180000,
                    useNodeVersion: '22',
                    enhancePath: true,
                }),
            );
        });

        it('should warn (not throw) when install exits non-zero', async () => {
            cm.execute
                .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'install warn' })
                .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

            await expect(
                buildComponent('/p', cm as any, { nodeVersion: '20' }, logger as any),
            ).resolves.toBeUndefined();

            expect(logger.warn).toHaveBeenCalled();
            // build still runs after install warning
            expect(cm.execute).toHaveBeenCalledTimes(2);
        });
    });

    describe('build step', () => {
        beforeEach(() => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(PKG_WITH_BUILD);
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
        });

        it('should issue byte-identical mesh build command with buildArgs "-- --force"', async () => {
            await buildComponent(
                '/p',
                cm as any,
                { nodeVersion: '20', buildArgs: '-- --force' },
                logger as any,
            );

            expect(cm.execute).toHaveBeenNthCalledWith(
                2,
                'npm run build -- --force',
                expect.any(Object),
            );
        });

        it('should issue plain "npm run build" when buildArgs is undefined (app case)', async () => {
            await buildComponent('/p', cm as any, { nodeVersion: '20' }, logger as any);

            expect(cm.execute).toHaveBeenNthCalledWith(
                2,
                'npm run build',
                expect.any(Object),
            );
        });

        it('should pass useNodeVersion and enhancePath to build', async () => {
            await buildComponent('/p', cm as any, { nodeVersion: '18' }, logger as any);

            expect(cm.execute).toHaveBeenNthCalledWith(
                2,
                expect.stringContaining('npm run build'),
                expect.objectContaining({
                    cwd: '/p',
                    shell: true,
                    timeout: 180000,
                    useNodeVersion: '18',
                    enhancePath: true,
                }),
            );
        });

        it('should throw when build exits non-zero (using stderr)', async () => {
            cm.execute
                .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
                .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'boom' });

            await expect(
                buildComponent('/p', cm as any, { nodeVersion: '20' }, logger as any),
            ).rejects.toThrow('boom');
        });

        it('should throw when build exits non-zero (falls back to stdout)', async () => {
            cm.execute
                .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
                .mockResolvedValueOnce({ code: 1, stdout: 'stdout boom', stderr: '' });

            await expect(
                buildComponent('/p', cm as any, { nodeVersion: '20' }, logger as any),
            ).rejects.toThrow('stdout boom');
        });
    });

    describe('progress + logging', () => {
        beforeEach(() => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(PKG_WITH_BUILD);
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
        });

        it('should invoke onProgress during install and build', async () => {
            const onProgress = jest.fn();

            await buildComponent(
                '/p',
                cm as any,
                { nodeVersion: '20', buildArgs: '-- --force' },
                logger as any,
                onProgress,
            );

            expect(onProgress).toHaveBeenCalled();
        });

        it('should use the provided logPrefix in debug logs', async () => {
            await buildComponent(
                '/p',
                cm as any,
                { nodeVersion: '20', logPrefix: '[App Builder]' },
                logger as any,
            );

            const calledWithPrefix = logger.debug.mock.calls.some(
                (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('[App Builder]'),
            );
            expect(calledWithPrefix).toBe(true);
        });
    });

    /**
     * Step 06: kind-aware build. INTEGRATION kind gets a FULL npm install
     * (devDeps included), run UNCONDITIONALLY when a package.json exists (NOT
     * gated on a `build` script), then lets `aio app deploy` drive the build —
     * so buildComponent itself does NOT run `npm run build` for integrations.
     */
    describe('kind: integration', () => {
        it('should run npm install even with NO top-level build script (THE spike-mandated test)', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(PKG_NO_BUILD);
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

            await buildComponent(
                '/p',
                cm as any,
                { nodeVersion: '20', kind: 'integration' },
                logger as any,
            );

            expect(cm.execute).toHaveBeenCalledWith(
                INTEGRATION_INSTALL_CMD,
                expect.any(Object),
            );
        });

        it('should NOT use --production for the integration install (devDeps included)', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(PKG_NO_BUILD);
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

            await buildComponent(
                '/p',
                cm as any,
                { nodeVersion: '20', kind: 'integration' },
                logger as any,
            );

            const installCmd = cm.execute.mock.calls[0][0] as string;
            expect(installCmd).not.toContain('--production');
        });

        it('should install but NOT run "npm run build" even when a build script IS present', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(PKG_WITH_BUILD);
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

            await buildComponent(
                '/p',
                cm as any,
                { nodeVersion: '20', kind: 'integration' },
                logger as any,
            );

            expect(cm.execute).toHaveBeenCalledTimes(1);
            expect(cm.execute).toHaveBeenCalledWith(INTEGRATION_INSTALL_CMD, expect.any(Object));
            const ranBuild = cm.execute.mock.calls.some(
                (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).startsWith('npm run build'),
            );
            expect(ranBuild).toBe(false);
        });

        it('should pass useNodeVersion and enhancePath to the integration install', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(PKG_NO_BUILD);
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

            await buildComponent(
                '/p',
                cm as any,
                { nodeVersion: '22', kind: 'integration' },
                logger as any,
            );

            expect(cm.execute).toHaveBeenCalledWith(
                INTEGRATION_INSTALL_CMD,
                expect.objectContaining({
                    cwd: '/p',
                    shell: true,
                    timeout: 180000,
                    useNodeVersion: '22',
                    enhancePath: true,
                }),
            );
        });

        it('should be a no-op when package.json is missing (integration)', async () => {
            mockFs.access.mockRejectedValue(new Error('ENOENT'));

            await buildComponent(
                '/p',
                cm as any,
                { nodeVersion: '20', kind: 'integration' },
                logger as any,
            );

            expect(cm.execute).not.toHaveBeenCalled();
        });

        it('should warn (not throw) when the integration install exits non-zero', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(PKG_NO_BUILD);
            cm.execute.mockResolvedValue({ code: 1, stdout: '', stderr: 'install warn' });

            await expect(
                buildComponent('/p', cm as any, { nodeVersion: '20', kind: 'integration' }, logger as any),
            ).resolves.toBeUndefined();

            expect(logger.warn).toHaveBeenCalled();
        });
    });

    /**
     * Step 06: mesh regression guard. `kind: 'mesh'` (explicit) must issue the
     * BYTE-IDENTICAL command sequence the default path always has.
     */
    describe('kind: mesh (explicit) — byte-identical regression guard', () => {
        beforeEach(() => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(PKG_WITH_BUILD);
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
        });

        it('should issue the byte-identical mesh install then build commands', async () => {
            await buildComponent(
                '/p',
                cm as any,
                { nodeVersion: '20', kind: 'mesh', buildArgs: '-- --force' },
                logger as any,
            );

            expect(cm.execute).toHaveBeenNthCalledWith(1, INSTALL_CMD, expect.any(Object));
            expect(cm.execute).toHaveBeenNthCalledWith(2, 'npm run build -- --force', expect.any(Object));
        });

        it('should early return (no commands) when mesh has no build script', async () => {
            mockFs.readFile.mockResolvedValue(PKG_NO_BUILD);

            await buildComponent(
                '/p',
                cm as any,
                { nodeVersion: '20', kind: 'mesh', buildArgs: '-- --force' },
                logger as any,
            );

            expect(cm.execute).not.toHaveBeenCalled();
        });

        it('should be a no-op when package.json is missing (mesh)', async () => {
            mockFs.access.mockRejectedValue(new Error('ENOENT'));

            await buildComponent(
                '/p',
                cm as any,
                { nodeVersion: '20', kind: 'mesh' },
                logger as any,
            );

            expect(cm.execute).not.toHaveBeenCalled();
        });
    });
});
