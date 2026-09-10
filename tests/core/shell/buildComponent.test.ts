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

            await buildComponent('/p', cm, { nodeVersion: '20' }, logger);

            expect(cm.execute).not.toHaveBeenCalled();
        });

        it('should early return when package.json has no build script', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(PKG_NO_BUILD);

            await buildComponent('/p', cm, { nodeVersion: '20' }, logger);

            expect(cm.execute).not.toHaveBeenCalled();
        });

        // A package.json with no `scripts` block at all is ordinary — a repo that
        // only carries dependencies. "No build script" has to cover it, not throw
        // reaching through a key that is not there.
        it('should early return when package.json declares no scripts at all', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(JSON.stringify({ dependencies: {} }));

            await expect(
                buildComponent('/p', cm, { nodeVersion: '20' }, logger)
            ).resolves.toBeUndefined();
            expect(cm.execute).not.toHaveBeenCalled();
        });

        // parseJSON answers undefined for a file it cannot read, and a component
        // whose package.json is mid-edit or truncated is a real state on disk.
        // Nothing to build is the honest answer; a crash inside the deploy is not.
        it('should treat an unparseable package.json as nothing to build', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue('{ "scripts": { "build"');

            await expect(
                buildComponent('/p', cm, { nodeVersion: '20' }, logger)
            ).resolves.toBeUndefined();
            expect(cm.execute).not.toHaveBeenCalled();
        });
    });

    describe('install step', () => {
        beforeEach(() => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(PKG_WITH_BUILD);
        });

        it('should run npm install with the exact mesh install flags', async () => {
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '', duration: 0 });

            await buildComponent('/p', cm, { nodeVersion: '20' }, logger);

            expect(cm.execute).toHaveBeenNthCalledWith(1, INSTALL_CMD, expect.any(Object));
        });

        it('should pass useNodeVersion and enhancePath to install', async () => {
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '', duration: 0 });

            await buildComponent('/p', cm, { nodeVersion: '22' }, logger);

            expect(cm.execute).toHaveBeenNthCalledWith(
                1,
                INSTALL_CMD,
                expect.objectContaining({
                    cwd: '/p',
                    shell: true,
                    timeout: 180000,
                    useNodeVersion: '22',
                    enhancePath: true,
                })
            );
        });

        // The warning is how a reader knows the install had something to say. A
        // clean install must therefore be SILENT — a warning on every build is
        // one nobody reads by the time it matters.
        it('should not warn when the install exits clean', async () => {
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '', duration: 0 });

            await buildComponent('/p', cm, { nodeVersion: '20' }, logger);

            expect(logger.warn).not.toHaveBeenCalled();
        });

        it('should warn (not throw) when install exits non-zero', async () => {
            cm.execute
                .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'install warn', duration: 0 })
                .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '', duration: 0 });

            await expect(
                buildComponent('/p', cm, { nodeVersion: '20' }, logger)
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
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '', duration: 0 });
        });

        it('should issue byte-identical mesh build command with buildArgs "-- --force"', async () => {
            await buildComponent('/p', cm, { nodeVersion: '20', buildArgs: '-- --force' }, logger);

            expect(cm.execute).toHaveBeenNthCalledWith(
                2,
                'npm run build -- --force',
                expect.any(Object)
            );
        });

        it('should issue plain "npm run build" when buildArgs is undefined (app case)', async () => {
            await buildComponent('/p', cm, { nodeVersion: '20' }, logger);

            expect(cm.execute).toHaveBeenNthCalledWith(2, 'npm run build', expect.any(Object));
        });

        it('should pass useNodeVersion and enhancePath to build', async () => {
            await buildComponent('/p', cm, { nodeVersion: '18' }, logger);

            expect(cm.execute).toHaveBeenNthCalledWith(
                2,
                expect.stringContaining('npm run build'),
                expect.objectContaining({
                    cwd: '/p',
                    shell: true,
                    timeout: 180000,
                    useNodeVersion: '18',
                    enhancePath: true,
                })
            );
        });

        it('should throw when build exits non-zero (using stderr)', async () => {
            cm.execute
                .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '', duration: 0 })
                .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'boom', duration: 0 });

            await expect(buildComponent('/p', cm, { nodeVersion: '20' }, logger)).rejects.toThrow(
                'boom'
            );
        });

        // npm and node both pad their output with blank lines, and the message is
        // rendered inline in a notification. Whitespace-only stderr is NOT a
        // reason: it must fall through to stdout rather than becoming one.
        it('should trim the reason, and read whitespace-only stderr as no reason', async () => {
            cm.execute
                .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '', duration: 0 })
                .mockResolvedValueOnce({
                    code: 1,
                    stdout: '\n  the real reason  \n',
                    stderr: '   \n',
                    duration: 0,
                });

            await expect(buildComponent('/p', cm, { nodeVersion: '20' }, logger)).rejects.toThrow(
                'Build failed (exit 1): the real reason'
            );
        });

        it('should throw when build exits non-zero (falls back to stdout)', async () => {
            cm.execute
                .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '', duration: 0 })
                .mockResolvedValueOnce({ code: 1, stdout: 'stdout boom', stderr: '', duration: 0 });

            await expect(buildComponent('/p', cm, { nodeVersion: '20' }, logger)).rejects.toThrow(
                'stdout boom'
            );
        });

        /**
         * A colleague's mesh build failed on 2026-08-18 and the ONLY trace it
         * left was `Error: Build failed: <path>/`. The reason is a three-step
         * pipeline that each do something reasonable and together destroy the
         * evidence:
         *
         *   1. this function folds multi-line npm/node output into one Error;
         *   2. `sanitizeErrorForLogging` keeps only `message.split('\n')[0]`;
         *   3. the path redactor replaces `/Users/...` up to the next whitespace.
         *
         * Node prints the offending FILE PATH as line 1 of any uncaught
         * exception, so step 2 selects a bare path and step 3 erases it. The
         * message can never be the record. The deploy half of this feature
         * already dumps stdout/stderr before it throws (`handleDeployFailure`);
         * the build half is why that log was undiagnosable.
         */
        describe('a failed build leaves a readable trace, not just a message', () => {
            /** Exactly the shape node emits — path first, everything else after. */
            const NODE_CRASH = [
                '/Users/leah/.demo-builder/projects/demo/components/eds-accs-mesh/mesh.config.js:1',
                "require('dotenv').config();",
                '^',
                "Error: Cannot find module 'dotenv'",
            ].join('\n');

            /**
             * Takes the LOGGER FAKE, not a narrower `{ debug: jest.Mock }`.
             *
             * The narrow parameter is why every call site wrote `dumpFor(logger)`: the
             * canonical fake is a full `jest.Mocked<Logger>` and does not match a one-method
             * shape. Naming the real thing removes four casts and keeps the read checked.
             */
            function dumpFor(
                logger: ReturnType<typeof createMockLogger>
            ): Record<string, unknown> | undefined {
                const call = logger.debug.mock.calls.find(
                    (c: unknown[]) => typeof c[1] === 'object' && c[1] !== null
                );
                return call?.[1] as Record<string, unknown> | undefined;
            }

            it('dumps the build output so the cause survives the message pipeline', async () => {
                cm.execute
                    .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '', duration: 0 })
                    .mockResolvedValueOnce({
                        code: 1,
                        stdout: '',
                        stderr: NODE_CRASH,
                        duration: 0,
                    });

                await expect(
                    buildComponent('/p', cm, { nodeVersion: '20' }, logger)
                ).rejects.toThrow();

                const dump = dumpFor(logger);
                expect(dump).toBeDefined();
                // The line the thrown message can never carry.
                expect(JSON.stringify(dump)).toContain("Cannot find module 'dotenv'");
            });

            it('records the exit code, which survives redaction when the text does not', async () => {
                cm.execute
                    .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '', duration: 0 })
                    .mockResolvedValueOnce({
                        code: 1,
                        stdout: '',
                        stderr: NODE_CRASH,
                        duration: 0,
                    });

                await expect(
                    buildComponent('/p', cm, { nodeVersion: '20' }, logger)
                ).rejects.toThrow();

                expect(dumpFor(logger)?.code).toBe(1);
            });

            /**
             * The dump is BOUNDED at 500 characters a stream, matching
             * `handleDeployFailure` in meshDeployment — the sibling dump a reader
             * is sent to look for. A failing webpack build emits tens of
             * thousands of characters; unbounded, one failure fills the Debug
             * Logs channel and pushes everything around it out of reach.
             *
             * The SIZE is the assertion, deliberately — not a word of the text.
             */
            it('caps each stream at 500 characters so one failure cannot flood the log', async () => {
                cm.execute
                    .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '', duration: 0 })
                    .mockResolvedValueOnce({
                        code: 1,
                        stdout: 'o'.repeat(900),
                        stderr: 'e'.repeat(900),
                        duration: 0,
                    });

                await expect(
                    buildComponent('/p', cm, { nodeVersion: '20' }, logger)
                ).rejects.toThrow();

                const dump = dumpFor(logger);
                expect((dump?.stdout as string)).toHaveLength(500);
                expect((dump?.stderr as string)).toHaveLength(500);
            });

            it('dumps stdout too — npm puts the useful half there', async () => {
                cm.execute
                    .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '', duration: 0 })
                    .mockResolvedValueOnce({
                        code: 1,
                        stdout: 'the real reason',
                        stderr: '',
                        duration: 0,
                    });

                await expect(
                    buildComponent('/p', cm, { nodeVersion: '20' }, logger)
                ).rejects.toThrow();

                expect(JSON.stringify(dumpFor(logger))).toContain('the real reason');
            });

            it('names the exit code in the thrown message, which redaction cannot erase', async () => {
                cm.execute
                    .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '', duration: 0 })
                    .mockResolvedValueOnce({
                        code: 1,
                        stdout: '',
                        stderr: NODE_CRASH,
                        duration: 0,
                    });

                await expect(
                    buildComponent('/p', cm, { nodeVersion: '20' }, logger)
                ).rejects.toThrow(/exit 1/);
            });

            it('dumps nothing on a successful build', async () => {
                cm.execute
                    .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '', duration: 0 })
                    .mockResolvedValueOnce({ code: 0, stdout: 'built', stderr: '', duration: 0 });

                await buildComponent('/p', cm, { nodeVersion: '20' }, logger);

                expect(dumpFor(logger)).toBeUndefined();
            });
        });
    });

    describe('progress + logging', () => {
        beforeEach(() => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(PKG_WITH_BUILD);
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '', duration: 0 });
        });

        it('should invoke onProgress during install and build', async () => {
            const onProgress = jest.fn();

            await buildComponent(
                '/p',
                cm,
                { nodeVersion: '20', buildArgs: '-- --force' },
                logger,
                onProgress
            );

            expect(onProgress).toHaveBeenCalled();
        });

        it('should use the provided logPrefix in debug logs', async () => {
            await buildComponent(
                '/p',
                cm,
                { nodeVersion: '20', logPrefix: '[App Builder]' },
                logger
            );

            const calledWithPrefix = logger.debug.mock.calls.some(
                (args: unknown[]) =>
                    typeof args[0] === 'string' && args[0].includes('[App Builder]')
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
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '', duration: 0 });

            await buildComponent('/p', cm, { nodeVersion: '20', kind: 'integration' }, logger);

            expect(cm.execute).toHaveBeenCalledWith(INTEGRATION_INSTALL_CMD, expect.any(Object));
        });

        it('should NOT use --production for the integration install (devDeps included)', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(PKG_NO_BUILD);
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '', duration: 0 });

            await buildComponent('/p', cm, { nodeVersion: '20', kind: 'integration' }, logger);

            const installCmd = cm.execute.mock.calls[0][0];
            expect(installCmd).not.toContain('--production');
        });

        it('should install but NOT run "npm run build" even when a build script IS present', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(PKG_WITH_BUILD);
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '', duration: 0 });

            await buildComponent('/p', cm, { nodeVersion: '20', kind: 'integration' }, logger);

            expect(cm.execute).toHaveBeenCalledTimes(1);
            expect(cm.execute).toHaveBeenCalledWith(INTEGRATION_INSTALL_CMD, expect.any(Object));
            const ranBuild = cm.execute.mock.calls.some(
                (args: unknown[]) =>
                    typeof args[0] === 'string' && args[0].startsWith('npm run build')
            );
            expect(ranBuild).toBe(false);
        });

        it('should pass useNodeVersion and enhancePath to the integration install', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(PKG_NO_BUILD);
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '', duration: 0 });

            await buildComponent('/p', cm, { nodeVersion: '22', kind: 'integration' }, logger);

            expect(cm.execute).toHaveBeenCalledWith(
                INTEGRATION_INSTALL_CMD,
                expect.objectContaining({
                    cwd: '/p',
                    shell: true,
                    timeout: 180000,
                    useNodeVersion: '22',
                    enhancePath: true,
                })
            );
        });

        it('should be a no-op when package.json is missing (integration)', async () => {
            mockFs.access.mockRejectedValue(new Error('ENOENT'));

            await buildComponent('/p', cm, { nodeVersion: '20', kind: 'integration' }, logger);

            expect(cm.execute).not.toHaveBeenCalled();
        });

        it('should not warn when the integration install exits clean', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(PKG_NO_BUILD);
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '', duration: 0 });

            await buildComponent('/p', cm, { nodeVersion: '20', kind: 'integration' }, logger);

            expect(logger.warn).not.toHaveBeenCalled();
        });

        it('should warn (not throw) when the integration install exits non-zero', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(PKG_NO_BUILD);
            cm.execute.mockResolvedValue({
                code: 1,
                stdout: '',
                stderr: 'install warn',
                duration: 0,
            });

            await expect(
                buildComponent('/p', cm, { nodeVersion: '20', kind: 'integration' }, logger)
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
            cm.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '', duration: 0 });
        });

        it('should issue the byte-identical mesh install then build commands', async () => {
            await buildComponent(
                '/p',
                cm,
                { nodeVersion: '20', kind: 'mesh', buildArgs: '-- --force' },
                logger
            );

            expect(cm.execute).toHaveBeenNthCalledWith(1, INSTALL_CMD, expect.any(Object));
            expect(cm.execute).toHaveBeenNthCalledWith(
                2,
                'npm run build -- --force',
                expect.any(Object)
            );
        });

        it('should early return (no commands) when mesh has no build script', async () => {
            mockFs.readFile.mockResolvedValue(PKG_NO_BUILD);

            await buildComponent(
                '/p',
                cm,
                { nodeVersion: '20', kind: 'mesh', buildArgs: '-- --force' },
                logger
            );

            expect(cm.execute).not.toHaveBeenCalled();
        });

        it('should be a no-op when package.json is missing (mesh)', async () => {
            mockFs.access.mockRejectedValue(new Error('ENOENT'));

            await buildComponent('/p', cm, { nodeVersion: '20', kind: 'mesh' }, logger);

            expect(cm.execute).not.toHaveBeenCalled();
        });
    });
});
