/**
 * ComponentUpdater — the plumbing: what it hands the shell, the filesystem, the
 * move to a release, the registry and the file watcher, and the decisions around each.
 *
 * The sibling suites pin the workflow shape (core), the .env merge and error
 * wording (extended) and the snapshot/rollback guarantees (rollback). This one
 * pins the ARGUMENTS: exact options to every `execute`, `fs.rm`, `moveToRelease`
 * and `registerProgrammaticWrites` call, the guards before the snapshot, and the
 * registry lookup both the post-update build and the rollback reinstall share.
 */

// FIRST: this module owns the jest.mock calls the imports below must see.
import {
    ComponentUpdater,
    fs,
    setupUpdater,
    vscode,
    type CommandExecutor,
    type UpdaterHarness,
} from './componentUpdater.testUtils';
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { demoBuilderNode } from '@/core/shell/demoBuilderNode';
import { createMockProject } from '../../../helpers/projectFake';

const TAG = 'v1.0.0';
const COMPONENT = '/path/to/project/components/test-component';
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

const FAILED_MOVE = {
    status: 'failed',
    detail: 'Could not fetch refs/tags/v1.0.0 from GitHub: bad object.',
};

/** Shell answers, in the order the calls will come (install, build...). */
function shellAnswers(
    h: UpdaterHarness,
    ...answers: Array<Partial<{ code: number; stdout?: string; stderr?: string }>>
): void {
    for (const a of answers) h.executor.execute.mockResolvedValueOnce({ duration: 1, ...a });
}

async function rejection(h: UpdaterHarness, componentId = 'test-component'): Promise<string> {
    let message = '';
    await h.updater.updateComponent(h.project, componentId, TAG, '1.0.0').catch((e: Error) => {
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
            await h.updater.updateComponent(h.project, 'test-component', TAG, '1.0.0');

            await expect(
                h.updater.updateComponent(h.project, 'test-component', TAG, '1.0.1')
            ).resolves.toBeUndefined();
        });
    });

    describe('the happy path, call by call', () => {
        it('moves the component path, its repoUrl and the release, after the snapshot', async () => {
            const repoUrl = 'https://github.com/skukla/citisignal-nextjs';
            h.project.componentInstances!['test-component'].repoUrl = repoUrl;

            await h.updater.updateComponent(h.project, 'test-component', 'v1.1.0', '1.1.0');

            expect(h.moveToRelease).toHaveBeenCalledTimes(1);
            expect(h.moveToRelease).toHaveBeenCalledWith(COMPONENT, repoUrl, {
                tag: 'v1.1.0',
                version: '1.1.0',
            });
            expect((fs.cp as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
                h.moveToRelease.mock.invocationCallOrder[0]
            );
        });

        it("never removes the component's own folder: only the snapshot goes", async () => {
            await h.updater.updateComponent(h.project, 'test-component', TAG, '1.0.0');

            const removed = (fs.rm as jest.Mock).mock.calls.map(([target]) => target);
            expect(removed).toStrictEqual([expect.stringMatching(/test-component\.snapshot-\d+$/)]);
            expect(fs.rename).not.toHaveBeenCalled();
        });

        it('a folder already at the release still installs and records the version', async () => {
            h.moveToRelease.mockResolvedValueOnce({ status: 'current', detail: 'Up to date.' });

            await h.updater.updateComponent(h.project, 'test-component', TAG, '1.0.0');

            expect(h.executor.execute).toHaveBeenCalledWith(
                'npm install --no-fund',
                expect.objectContaining({ cwd: COMPONENT })
            );
            expect(h.project.componentVersions?.['test-component']).toMatchObject({
                version: '1.0.0',
            });
            expect(h.project.componentInstances?.['test-component'].version).toBe('1.0.0');
        });

        it("keeps other components' version records when writing this one", async () => {
            h.project.componentVersions = { other: { version: '0.1.0', lastUpdated: 'x' } };

            await h.updater.updateComponent(h.project, 'test-component', TAG, '1.0.0');

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

            await h.updater.updateComponent(h.project, 'test-component', TAG, '1.0.0');

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.registerProgrammaticWrites',
                [`${COMPONENT}/.env`]
            );
        });
    });

    describe('verification', () => {
        it('requires package.json after the move', async () => {
            (fs.access as jest.Mock).mockImplementation(async (p: string) => {
                if (p.endsWith('/package.json')) throw new Error('ENOENT');
            });

            await rejection(h);

            expect(h.logger.error).toHaveBeenCalledWith(
                '[Updates] Update failed, rolling back to snapshot',
                expect.objectContaining({
                    message: 'Component verification failed: package.json missing after the update',
                })
            );
        });
    });

    describe('post-update build', () => {
        it('installs with the exact shell options and no build when the registry has no entry', async () => {
            registryAnswers(undefined);

            await h.updater.updateComponent(h.project, 'test-component', TAG, '1.0.0');

            expect(h.executor.execute).toHaveBeenNthCalledWith(
                1,
                'npm install --no-fund',
                npmOpts(null)
            );
            expect(h.executor.execute).toHaveBeenCalledTimes(1);
        });

        it('tolerates a catalog entry with no configuration block', async () => {
            registryAnswers({ id: 'test-component', name: 'Test' });

            await expect(
                h.updater.updateComponent(h.project, 'test-component', TAG, '1.0.0')
            ).resolves.toBeUndefined();
            expect(h.executor.execute).toHaveBeenNthCalledWith(
                1,
                'npm install --no-fund',
                npmOpts(demoBuilderNode())
            );
        });

        it("runs the configured build on Demo Builder's Node", async () => {
            registryAnswers({ id: 'test-component', configuration: { buildScript: 'build' } });

            await h.updater.updateComponent(h.project, 'test-component', TAG, '1.0.0');

            expect(h.executor.execute).toHaveBeenNthCalledWith(
                1,
                'npm install --no-fund',
                npmOpts(demoBuilderNode())
            );
            expect(h.executor.execute).toHaveBeenNthCalledWith(
                2,
                'npm run build -- --force',
                npmOpts(demoBuilderNode())
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
            shellAnswers(h, result);

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
            shellAnswers(h, OK, result);

            expect(await rejection(h)).toBe(
                'Update failed and was rolled back: ' +
                    `Post-update setup failed for test-component: Build failed (exit 1): ${detail}`
            );
        });

        it('dumps at most the first 500 characters of each build stream, and copes with a missing one', async () => {
            registryAnswers({ id: 'test-component', configuration: { buildScript: 'build' } });
            shellAnswers(h, OK, { code: 1, stderr: 'e'.repeat(600) });

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
            shellAnswers(h, OK, { code: 1, stdout: 'o'.repeat(600) });

            await rejection(h);

            const dump = h.logger.debug.mock.calls.find(
                (call: unknown[]) => typeof call[1] === 'object' && call[1] !== null
            );
            expect(dump?.[1]).toEqual({ code: 1, stdout: 'o'.repeat(500), stderr: undefined });
        });
    });

    describe('the recorded Node version (PR-1a)', () => {
        it('rewrites the record to the Node it was just installed under', async () => {
            registryAnswers({ id: 'test-component', configuration: {} });

            await h.updater.updateComponent(h.project, 'test-component', TAG, '1.0.0');

            expect(h.project.componentInstances?.['test-component'].metadata?.nodeVersion).toBe(
                demoBuilderNode()
            );
        });

        it('leaves the record alone for a component that installs nothing', async () => {
            registryAnswers({ id: 'test-component', configuration: { skipNpmInstall: true } });
            const before = h.project.componentInstances?.['test-component'].metadata;

            await h.updater.updateComponent(h.project, 'test-component', TAG, '1.0.0');

            expect(h.project.componentInstances?.['test-component'].metadata).toBe(before);
        });
    });

    describe('rollback', () => {
        it("removes the broken tree recursively before restoring, then reinstalls on Demo Builder's Node", async () => {
            registryAnswers({ id: 'test-component', configuration: {} });
            h.moveToRelease.mockRejectedValueOnce(new Error(FAILED_MOVE.detail));

            await rejection(h);

            expect(fs.rm).toHaveBeenNthCalledWith(1, COMPONENT, RM_OPTS);
            expect(h.executor.execute).toHaveBeenLastCalledWith(
                'npm install --no-fund',
                npmOpts(demoBuilderNode())
            );
            expect(h.logger.warn).not.toHaveBeenCalled();
        });

        it('reinstalls with the default node version when the registry cannot be read', async () => {
            (ComponentRegistryManager as jest.Mock).mockImplementation(() => ({
                getComponentById: jest.fn().mockRejectedValue(new Error('registry unreadable')),
            }));
            h.moveToRelease.mockRejectedValueOnce(new Error(FAILED_MOVE.detail));

            await rejection(h);

            expect(h.executor.execute).toHaveBeenLastCalledWith(
                'npm install --no-fund',
                npmOpts(null)
            );
        });
    });

    describe('the move a real updater makes when none is handed in', () => {
        let clone: string;

        beforeEach(() => {
            // The folder test is on the real disk, so the clone's .git has to exist there.
            clone = mkdtempSync(path.join(os.tmpdir(), 'component-updater-'));
            mkdirSync(path.join(clone, '.git'));
            h.project.componentInstances!['test-component'].path = clone;
        });

        afterEach(() => rmSync(clone, { recursive: true, force: true }));

        it('runs git in the folder through the executor, with the tag it was given', async () => {
            registryAnswers({ id: 'test-component', configuration: {} });
            const updater = new ComponentUpdater(
                h.logger,
                '/mock/extension/path',
                h.executor as unknown as CommandExecutor
            );

            await updater.updateComponent(h.project, 'test-component', 'v1.1.0', '1.1.0');

            expect(h.executor.execute).toHaveBeenCalledWith('git fetch origin refs/tags/v1.1.0', {
                cwd: clone,
                enhancePath: true,
                shell: DEFAULT_SHELL,
                timeout: TIMEOUTS.LONG,
            });
            expect(h.moveToRelease).not.toHaveBeenCalled();
        });
    });
});
