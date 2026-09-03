/**
 * ComponentUpdater — the plumbing: what it hands the shell, the filesystem, the
 * download, the registry and the file watcher, and the decisions around each.
 *
 * The sibling suites pin the workflow shape (core), the .env merge and error
 * wording (extended) and the snapshot/rollback guarantees (rollback). This one
 * pins the ARGUMENTS: exact options to every `execute`, `fs.rm`, `fs.mkdir`,
 * `fetch` and `registerProgrammaticWrites` call, the download timeout and its
 * cleanup, the guards before the snapshot, and the registry lookup both the
 * post-update build and the rollback reinstall share.
 */

// FIRST: this module owns the jest.mock calls the imports below must see.
import { fs, setupUpdater, vscode, type UpdaterHarness } from './componentUpdater.testUtils';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateGitHubDownloadURL } from '@/core/validation/URLValidator';
import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { createMockProject } from '../../../helpers/projectFake';

const DOWNLOAD = 'https://github.com/test/repo/archive/v1.0.0.zip';
const COMPONENT = '/path/to/project/components/test-component';
const TEMP_ZIP = '/path/to/project/components/test-component-temp.zip';
const RM_OPTS = { recursive: true, force: true };
const npmOpts = (useNodeVersion: string | null) => ({
    cwd: COMPONENT,
    timeout: TIMEOUTS.VERY_LONG,
    shell: DEFAULT_SHELL,
    enhancePath: true,
    useNodeVersion,
});

/** What the registry says about the component under test. */
function registryAnswers(definition: unknown): void {
    (ComponentRegistryManager as jest.Mock).mockImplementation(() => ({
        getComponentById: jest.fn().mockResolvedValue(definition),
    }));
}

const OK = { code: 0, stdout: '', stderr: '' };

/** Shell answers, in the order the calls will come (extract, install, build...). */
function shellAnswers(
    h: UpdaterHarness,
    ...answers: Array<Partial<{ code: number; stdout?: string; stderr?: string }>>
): void {
    for (const a of answers) h.executor.execute.mockResolvedValueOnce({ duration: 1, ...a });
}

async function rejection(h: UpdaterHarness, componentId = 'test-component'): Promise<string> {
    let message = '';
    await h.updater.updateComponent(h.project, componentId, DOWNLOAD, '1.0.0').catch((e: Error) => {
        message = e.message;
    });
    expect(message).not.toBe('');
    return message;
}

describe('ComponentUpdater — plumbing', () => {
    let h: UpdaterHarness;

    beforeEach(() => {
        h = setupUpdater();
    });

    describe('before the snapshot', () => {
        it('refuses a project with no component instances at all', async () => {
            h.project = createMockProject({ componentInstances: undefined });

            expect(await rejection(h)).toBe('Component test-component not found in project state');
            expect(fs.cp).not.toHaveBeenCalled();
        });

        it('refuses a component whose directory is gone, before taking a snapshot', async () => {
            (fs.access as jest.Mock).mockRejectedValueOnce(new Error('ENOENT'));

            expect(await rejection(h)).toContain(
                `Component test-component path does not exist on filesystem: ${COMPONENT}.`
            );
            expect(fs.cp).not.toHaveBeenCalled();
        });

        it('releases the lock afterwards, so the same component can be updated again', async () => {
            await h.updater.updateComponent(h.project, 'test-component', DOWNLOAD, '1.0.0');

            await expect(
                h.updater.updateComponent(h.project, 'test-component', DOWNLOAD, '1.0.1')
            ).resolves.toBeUndefined();
        });
    });

    describe('the happy path, call by call', () => {
        it('removes the old directory recursively, makes the target, extracts with the shell', async () => {
            await h.updater.updateComponent(h.project, 'test-component', DOWNLOAD, '1.0.0');

            expect(fs.rm).toHaveBeenNthCalledWith(1, COMPONENT, RM_OPTS);
            expect(fs.mkdir).toHaveBeenCalledWith(COMPONENT, { recursive: true });
            expect(h.executor.execute).toHaveBeenNthCalledWith(
                1,
                `unzip -q "${TEMP_ZIP}" -d "${COMPONENT}" && mv "${COMPONENT}"/*/* "${COMPONENT}"/ && rm -rf "${COMPONENT}"/*/`,
                { shell: DEFAULT_SHELL, timeout: TIMEOUTS.NORMAL, enhancePath: true }
            );
            expect(fs.unlink).toHaveBeenCalledWith(TEMP_ZIP);
        });

        it('fetches with an abort signal and clears the download timer once the download lands', async () => {
            jest.useFakeTimers();
            try {
                await h.updater.updateComponent(h.project, 'test-component', DOWNLOAD, '1.0.0');

                const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
                expect(url).toBe(DOWNLOAD);
                expect(init.signal).toBeInstanceOf(AbortSignal);
                expect(jest.getTimerCount()).toBe(0);
            } finally {
                jest.useRealTimers();
            }
        });

        it('aborts a download that outlives the browser-auth timeout', async () => {
            jest.useFakeTimers();
            try {
                (global.fetch as jest.Mock).mockImplementationOnce(
                    (_url: string, init: { signal: AbortSignal }) =>
                        new Promise((_resolve, reject) => {
                            init.signal.addEventListener('abort', () =>
                                reject(new Error('aborted'))
                            );
                        })
                );
                const update = h.updater.updateComponent(
                    h.project,
                    'test-component',
                    DOWNLOAD,
                    '1.0.0'
                );
                update.catch(() => undefined);
                await jest.advanceTimersByTimeAsync(TIMEOUTS.AUTH.BROWSER);

                await expect(update).rejects.toThrow();
                expect((global.fetch as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true);
            } finally {
                jest.useRealTimers();
            }
        });

        it('a temp zip that cannot be unlinked does not fail the update', async () => {
            (fs.unlink as jest.Mock).mockRejectedValue(new Error('EBUSY'));

            await expect(
                h.updater.updateComponent(h.project, 'test-component', DOWNLOAD, '1.0.0')
            ).resolves.toBeUndefined();
        });

        it("keeps other components' version records when writing this one", async () => {
            h.project.componentVersions = { other: { version: '0.1.0', lastUpdated: 'x' } };

            await h.updater.updateComponent(h.project, 'test-component', DOWNLOAD, '1.0.0');

            expect(h.project.componentVersions.other).toEqual({
                version: '0.1.0',
                lastUpdated: 'x',
            });
            expect(h.project.componentVersions['test-component']).toMatchObject({
                version: '1.0.0',
            });
        });

        it('registers exactly the .env paths it will write, before writing them', async () => {
            (fs.readFile as jest.Mock).mockImplementation(async (p: string) => {
                if (p.endsWith('/.env')) return 'A=1';
                if (p.endsWith('.env.local') || p.endsWith('.env.example'))
                    throw new Error('ENOENT');
                return '{"name":"test"}';
            });

            await h.updater.updateComponent(h.project, 'test-component', DOWNLOAD, '1.0.0');

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.registerProgrammaticWrites',
                [`${COMPONENT}/.env`]
            );
        });
    });

    describe('download URL validation', () => {
        it('a rejected URL is refused before any download, and rolled back', async () => {
            jest.mocked(validateGitHubDownloadURL).mockImplementation(() => {
                throw new Error('not a GitHub host');
            });

            expect(await rejection(h)).toBe(
                'Update failed and was rolled back: Security check failed: not a GitHub host'
            );
            expect(global.fetch).not.toHaveBeenCalled();
        });
    });

    describe('verification', () => {
        it('requires package.json after extraction', async () => {
            (fs.access as jest.Mock).mockImplementation(async (p: string) => {
                if (p.endsWith('/package.json')) throw new Error('ENOENT');
            });

            await rejection(h);

            expect(h.logger.error).toHaveBeenCalledWith(
                '[Updates] Update failed, rolling back to snapshot',
                expect.objectContaining({
                    message: 'Component verification failed: package.json missing after extraction',
                })
            );
        });

        it('does not ask a non-mesh component for mesh.json', async () => {
            await h.updater.updateComponent(h.project, 'test-component', DOWNLOAD, '1.0.0');

            expect(fs.access).not.toHaveBeenCalledWith(expect.stringContaining('mesh.json'));
        });
    });

    describe('post-update build', () => {
        it('installs with the exact shell options and no build when the registry has no entry', async () => {
            registryAnswers(undefined);

            await h.updater.updateComponent(h.project, 'test-component', DOWNLOAD, '1.0.0');

            expect(h.executor.execute).toHaveBeenNthCalledWith(
                2,
                'npm install --no-fund',
                npmOpts(null)
            );
            expect(h.executor.execute).toHaveBeenCalledTimes(2);
        });

        it('tolerates a catalog entry with no configuration block', async () => {
            registryAnswers({ id: 'test-component', name: 'Test' });

            await expect(
                h.updater.updateComponent(h.project, 'test-component', DOWNLOAD, '1.0.0')
            ).resolves.toBeUndefined();
            expect(h.executor.execute).toHaveBeenNthCalledWith(
                2,
                'npm install --no-fund',
                npmOpts(null)
            );
        });

        it('runs the configured build with the node version from the catalog', async () => {
            registryAnswers({
                id: 'test-component',
                configuration: { buildScript: 'build', nodeVersion: '20' },
            });

            await h.updater.updateComponent(h.project, 'test-component', DOWNLOAD, '1.0.0');

            expect(h.executor.execute).toHaveBeenNthCalledWith(
                2,
                'npm install --no-fund',
                npmOpts('20')
            );
            expect(h.executor.execute).toHaveBeenNthCalledWith(
                3,
                'npm run build -- --force',
                npmOpts('20')
            );
        });

        it.each([
            ['stderr', { code: 1, stderr: 'ERESOLVE', stdout: 'noise' }, 'ERESOLVE'],
            [
                'stdout when stderr is empty',
                { code: 1, stderr: '', stdout: 'peer dep' },
                'peer dep',
            ],
        ])('a failed install reports its %s', async (_label, result, detail) => {
            shellAnswers(h, OK, result);

            expect(await rejection(h)).toBe(
                'Update failed and was rolled back: ' +
                    `Post-update setup failed for test-component: npm install failed: ${detail}`
            );
        });

        it.each([
            ['stderr', { code: 1, stderr: 'tsc: 3 errors', stdout: 'out' }, 'tsc: 3 errors'],
            ['stdout when stderr is empty', { code: 1, stderr: '', stdout: 'out' }, 'out'],
        ])('a failed build reports its exit code and %s', async (_label, result, detail) => {
            registryAnswers({ id: 'test-component', configuration: { buildScript: 'build' } });
            shellAnswers(h, OK, OK, result);

            expect(await rejection(h)).toBe(
                'Update failed and was rolled back: ' +
                    `Post-update setup failed for test-component: Build failed (exit 1): ${detail}`
            );
        });

        it('dumps at most the first 500 characters of each build stream, and copes with a missing one', async () => {
            registryAnswers({ id: 'test-component', configuration: { buildScript: 'build' } });
            shellAnswers(h, OK, OK, { code: 1, stderr: 'e'.repeat(600) }
            );

            expect(await rejection(h)).toContain('Build failed (exit 1): ' + 'e'.repeat(600));
            const dump = h.logger.debug.mock.calls.find(
                (call: unknown[]) => typeof call[1] === 'object' && call[1] !== null
            );
            expect(dump?.[1]).toEqual({ code: 1, stdout: undefined, stderr: 'e'.repeat(500) });
        });
    });

    describe('build output dump, the other way round', () => {
        it('truncates a long stdout and copes with a missing stderr', async () => {
            registryAnswers({ id: 'test-component', configuration: { buildScript: 'build' } });
            shellAnswers(h, OK, OK, { code: 1, stdout: 'o'.repeat(600) });

            await rejection(h);

            const dump = h.logger.debug.mock.calls.find(
                (call: unknown[]) => typeof call[1] === 'object' && call[1] !== null
            );
            expect(dump?.[1]).toEqual({ code: 1, stdout: 'o'.repeat(500), stderr: undefined });
        });
    });

    describe('rollback', () => {
        it('removes the broken tree recursively before restoring, then reinstalls with the catalog node version', async () => {
            registryAnswers({ id: 'test-component', configuration: { nodeVersion: '20' } });
            shellAnswers(h, { code: 1, stderr: 'unzip: bad zip' });

            await rejection(h);

            expect(fs.rm).toHaveBeenNthCalledWith(2, COMPONENT, RM_OPTS);
            expect(h.executor.execute).toHaveBeenLastCalledWith(
                'npm install --no-fund',
                npmOpts('20')
            );
            expect(h.logger.warn).not.toHaveBeenCalled();
        });

        it('reinstalls with the default node version when the registry cannot be read', async () => {
            (ComponentRegistryManager as jest.Mock).mockImplementation(() => ({
                getComponentById: jest.fn().mockRejectedValue(new Error('registry unreadable')),
            }));
            shellAnswers(h, { code: 1, stderr: 'unzip: bad zip' });

            await rejection(h);

            expect(h.executor.execute).toHaveBeenLastCalledWith(
                'npm install --no-fund',
                npmOpts(null)
            );
        });

        it('an extraction failure with no stderr reads as unknown', async () => {
            shellAnswers(h, { code: 1, stderr: '' });

            expect(await rejection(h)).toBe(
                'Update failed and was rolled back: Extraction failed (exit code 1): unknown error'
            );
        });
    });
});
