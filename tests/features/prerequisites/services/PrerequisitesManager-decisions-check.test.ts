/**
 * PrerequisitesManager — decision coverage (PL-22): the check routing, the cache seam,
 * the standard check, and the error path.
 *
 * These assert the ARGUMENTS the manager hands its collaborators — which shell options
 * a check runs under, what it writes into the cache and under which key — rather than
 * the answers the mocks give back. A mock cannot see a malformed call.
 */

jest.mock('@/core/config/ConfigurationLoader');

// The wall FIRST: this module installs jest.mock at its top level, and a mock
// registers only when the file's body runs — after a subject import, too late.
import { setupMocks, setupConfigLoader, type TestMocks } from './PrerequisitesManager.testUtils';

import { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import { PrerequisitesCacheManager } from '@/features/prerequisites/services/prerequisitesCacheManager';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { CachedPrerequisiteResult, PrerequisiteDefinition } from '@/features/prerequisites/services/types';
import { createSuccessResult } from '../../../helpers/commandResultFake';
import { GIT, DOCKER, BARE, AIO } from './PrerequisitesManager-decisions.testUtils';

describe('PrerequisitesManager — check routing, caching and errors', () => {
    let manager: PrerequisitesManager;
    let cache: PrerequisitesCacheManager;
    let mocks: TestMocks;

    beforeEach(() => {
        mocks = setupMocks();
        setupConfigLoader();
        cache = new PrerequisitesCacheManager();
        manager = new PrerequisitesManager('/mock/extension/path', mocks.logger, mocks.executor, cache);
    });

    describe('the cache seam', () => {
        it('answers from the cache without running the check command at all', async () => {
            const cached: CachedPrerequisiteResult = {
                data: { id: 'git', name: 'Git', description: 'd', installed: true, optional: false, canInstall: true },
                expiry: Date.now() + 60_000,
            };
            const getCached = jest.spyOn(cache, 'getCachedResult').mockReturnValue(cached);

            const status = await manager.checkPrerequisite(GIT, '20');

            expect(getCached).toHaveBeenCalledWith('git', '20');
            expect(status).toEqual({
                id: 'git', name: 'Git', description: 'd', installed: true, optional: false, canInstall: true,
            });
            expect(mocks.executor.execute).not.toHaveBeenCalled();
        });

        it('looks the cache up without a Node version when none is asked for', async () => {
            const getCached = jest.spyOn(cache, 'getCachedResult');
            mocks.executor.execute.mockResolvedValue(createSuccessResult('git version 2.44.0'));

            await manager.checkPrerequisite(GIT);

            expect(getCached).toHaveBeenCalledWith('git', undefined);
        });

        it('writes the finished result back under the prerequisite id and Node version', async () => {
            const setCached = jest.spyOn(cache, 'setCachedResult');
            mocks.executor.execute.mockResolvedValue(createSuccessResult('git version 2.44.0'));

            const status = await manager.checkPrerequisite(GIT, '22');

            expect(setCached).toHaveBeenCalledWith('git', status, undefined, '22');
        });
    });

    describe('the standard check', () => {
        it('runs node and npm under the CURRENT Node version rather than a login shell', async () => {
            mocks.executor.execute.mockResolvedValue(createSuccessResult('v20.11.0'));
            const node = { id: 'node', name: 'Node.js', description: 'r', check: { command: 'node --version' } };

            await manager.checkPrerequisite(node);

            expect(mocks.executor.execute).toHaveBeenCalledWith('node --version', {
                useNodeVersion: 'current',
                timeout: TIMEOUTS.PREREQUISITE_CHECK,
            });
        });

        it('runs npm under the current Node version too', async () => {
            mocks.executor.execute.mockResolvedValue(createSuccessResult('10.2.4'));
            const npm = { id: 'npm', name: 'npm', description: 'p', check: { command: 'npm --version' } };

            await manager.checkPrerequisite(npm);

            expect(mocks.executor.execute).toHaveBeenCalledWith('npm --version', {
                useNodeVersion: 'current',
                timeout: TIMEOUTS.PREREQUISITE_CHECK,
            });
        });

        it('runs every other tool through the default shell', async () => {
            mocks.executor.execute.mockResolvedValue(createSuccessResult('git version 2.44.0'));

            await manager.checkPrerequisite(GIT);

            expect(mocks.executor.execute).toHaveBeenCalledWith('git --version', {
                shell: DEFAULT_SHELL,
                timeout: TIMEOUTS.PREREQUISITE_CHECK,
            });
        });

        it('reports the captured group of the version regex, not the whole match', async () => {
            mocks.executor.execute.mockResolvedValue(createSuccessResult('git version 2.44.0'));

            expect(await manager.checkPrerequisite(GIT)).toEqual({
                id: 'git',
                name: 'Git',
                description: 'Version control',
                installed: true,
                optional: false,
                canInstall: true,
                version: '2.44.0',
            });
        });

        it('reports NOT installed, and no version, when the version regex does not match', async () => {
            mocks.executor.execute.mockResolvedValue(createSuccessResult('some other tool'));

            expect(await manager.checkPrerequisite(GIT)).toEqual({
                id: 'git',
                name: 'Git',
                description: 'Version control',
                installed: false,
                optional: false,
                canInstall: true,
            });
        });

        it('reports installed when stdout contains the expected substring', async () => {
            mocks.executor.execute.mockResolvedValue(createSuccessResult('Docker version 25.0.3'));

            expect((await manager.checkPrerequisite(DOCKER)).installed).toBe(true);
        });

        it('reports NOT installed when stdout lacks the expected substring', async () => {
            mocks.executor.execute.mockResolvedValue(createSuccessResult('podman version 4.9'));

            expect((await manager.checkPrerequisite(DOCKER)).installed).toBe(false);
        });

        it('treats a command that merely succeeds as installed when nothing more is asked', async () => {
            mocks.executor.execute.mockResolvedValue(createSuccessResult('anything at all'));

            expect(await manager.checkPrerequisite(BARE)).toEqual({
                id: 'bare',
                name: 'Bare',
                description: 'Presence only',
                installed: true,
                optional: false,
                canInstall: true,
            });
        });

        it('carries the prerequisite’s optional flag into the status it builds', async () => {
            mocks.executor.execute.mockResolvedValue(createSuccessResult('git version 2.44.0'));

            expect((await manager.checkPrerequisite({ ...GIT, optional: true })).optional).toBe(true);
        });

        it('defaults optional to false when the definition does not say', async () => {
            mocks.executor.execute.mockResolvedValue(createSuccessResult('git version 2.44.0'));

            expect((await manager.checkPrerequisite(GIT)).optional).toBe(false);
        });
    });

    describe('plugins on a standard prerequisite', () => {
        const withPlugins: PrerequisiteDefinition = {
            ...BARE,
            plugins: [
                { id: 'p1', name: 'One', description: 'First', check: { command: 'p1 --version', contains: 'one' }, install: { steps: [] } },
                { id: 'p2', name: 'Two', description: 'Second', check: { command: 'p2 --version', contains: 'two' }, install: { steps: [] } },
            ],
        };

        it('checks every plugin, in order, and records each verdict', async () => {
            mocks.executor.execute.mockImplementation(async (cmd: string) => {
                if (cmd === 'p1 --version') return createSuccessResult('this is one');
                if (cmd === 'p2 --version') return createSuccessResult('nothing here');
                return createSuccessResult('ok');
            });

            const status = await manager.checkPrerequisite(withPlugins);

            expect(status.plugins).toEqual([
                { id: 'p1', name: 'One', installed: true },
                { id: 'p2', name: 'Two', installed: false },
            ]);
        });

        it('runs each plugin check with a single attempt and no backoff', async () => {
            mocks.executor.execute.mockResolvedValue(createSuccessResult('one two'));

            await manager.checkPrerequisite(withPlugins);

            expect(mocks.executor.execute).toHaveBeenCalledWith('p1 --version', {
                timeout: TIMEOUTS.PREREQUISITE_CHECK,
                retryStrategy: { maxAttempts: 1, initialDelay: 0, maxDelay: 0, backoffFactor: 1 },
            });
        });

        it('treats a plugin whose check throws as not installed rather than failing the prerequisite', async () => {
            mocks.executor.execute.mockImplementation(async (cmd: string) => {
                if (cmd === 'p1 --version') throw new Error('plugin blew up');
                return createSuccessResult('two');
            });

            const status = await manager.checkPrerequisite(withPlugins);

            expect(status.installed).toBe(true);
            expect(status.plugins).toEqual([
                { id: 'p1', name: 'One', installed: false },
                { id: 'p2', name: 'Two', installed: true },
            ]);
        });

        it('treats a plugin check with no expected substring as installed when it merely succeeds', async () => {
            const noContains: PrerequisiteDefinition = {
                ...BARE,
                plugins: [{ id: 'p', name: 'P', description: 'Plain', check: { command: 'p --version' }, install: { steps: [] } }],
            };
            mocks.executor.execute.mockResolvedValue(createSuccessResult(''));

            expect((await manager.checkPrerequisite(noContains)).plugins).toEqual([
                { id: 'p', name: 'P', installed: true },
            ]);
        });

        it('does not check plugins at all when the prerequisite itself is missing', async () => {
            mocks.executor.execute.mockResolvedValue(createSuccessResult('podman'));
            const missingWithPlugins: PrerequisiteDefinition = {
                ...DOCKER,
                plugins: [{ id: 'p', name: 'P', description: 'Plain', check: { command: 'p --version' }, install: { steps: [] } }],
            };

            const status = await manager.checkPrerequisite(missingWithPlugins);

            expect(status.plugins).toBeUndefined();
            expect(mocks.executor.execute).not.toHaveBeenCalledWith('p --version', expect.anything());
        });
    });

    describe('when the check command fails', () => {
        it('records the prerequisite as missing and caches that verdict', async () => {
            const setCached = jest.spyOn(cache, 'setCachedResult');
            mocks.executor.execute.mockRejectedValue(
                Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' }),
            );

            const status = await manager.checkPrerequisite(GIT, '20');

            expect(status).toEqual({
                id: 'git',
                name: 'Git',
                description: 'Version control',
                installed: false,
                optional: false,
                canInstall: true,
            });
            expect(setCached).toHaveBeenCalledWith('git', status, undefined, '20');
        });

        it('caches the missing verdict for a failure that is not a missing command either', async () => {
            const setCached = jest.spyOn(cache, 'setCachedResult');
            mocks.executor.execute.mockRejectedValue(new Error('exited with code 128'));

            const status = await manager.checkPrerequisite(GIT);

            expect(status.installed).toBe(false);
            expect(setCached).toHaveBeenCalledWith('git', status, undefined, undefined);
        });

        it('rethrows a timeout as a named, seconds-bearing error instead of reporting "not installed"', async () => {
            mocks.executor.execute.mockRejectedValue(
                Object.assign(new Error('killed'), { killed: true, signal: 'SIGTERM' }),
            );

            await expect(manager.checkPrerequisite(GIT)).rejects.toThrow(
                `Git check timed out after ${TIMEOUTS.PREREQUISITE_CHECK / 1000} seconds`,
            );
        });

        it('does not treat a killed process with another signal as a timeout', async () => {
            const setCached = jest.spyOn(cache, 'setCachedResult');
            mocks.executor.execute.mockRejectedValue(
                Object.assign(new Error('killed'), { killed: true, signal: 'SIGKILL' }),
            );

            const status = await manager.checkPrerequisite(GIT);

            expect(status.installed).toBe(false);
            expect(setCached).toHaveBeenCalled();
        });

        it('does not cache anything when the failure was a timeout', async () => {
            const setCached = jest.spyOn(cache, 'setCachedResult');
            mocks.executor.execute.mockRejectedValue(
                Object.assign(new Error('killed'), { killed: true, signal: 'SIGTERM' }),
            );

            await expect(manager.checkPrerequisite(GIT)).rejects.toThrow();
            expect(setCached).not.toHaveBeenCalled();
        });
    });

    describe('routing between the two check strategies', () => {
        it('sends node down the STANDARD path even when it is flagged per-node-version', async () => {
            mocks.executor.execute.mockResolvedValue(createSuccessResult('v20.11.0'));
            const perNodeNode = { ...AIO, id: 'node', name: 'Node.js', check: { command: 'node --version' } };

            await manager.checkPrerequisite(perNodeNode);

            expect(mocks.executor.execute).toHaveBeenCalledWith('node --version', expect.anything());
            expect(mocks.executor.execute).not.toHaveBeenCalledWith('fnm list', expect.anything());
        });

        it('sends npm down the STANDARD path even when it is flagged per-node-version', async () => {
            mocks.executor.execute.mockResolvedValue(createSuccessResult('10.2.4'));
            const perNodeNpm = { ...AIO, id: 'npm', name: 'npm', check: { command: 'npm --version' } };

            await manager.checkPrerequisite(perNodeNpm);

            expect(mocks.executor.execute).not.toHaveBeenCalledWith('fnm list', expect.anything());
        });

        it('sends a prerequisite that is not flagged per-node-version down the standard path', async () => {
            mocks.executor.execute.mockResolvedValue(createSuccessResult('git version 2.44.0'));

            await manager.checkPrerequisite(GIT);

            expect(mocks.executor.execute).not.toHaveBeenCalledWith('fnm list', expect.anything());
        });
    });

    describe('checkAllPrerequisites', () => {
        it('checks each prerequisite in the order given and returns their statuses in that order', async () => {
            mocks.executor.execute.mockImplementation(async (cmd: string) => {
                if (cmd === 'git --version') return createSuccessResult('git version 2.44.0');
                return createSuccessResult('Docker version 25.0.3');
            });

            const results = await manager.checkAllPrerequisites([GIT, DOCKER]);

            expect(results.map((r) => [r.id, r.installed])).toEqual([
                ['git', true],
                ['docker', true],
            ]);
        });

        it('returns an empty list for an empty request', async () => {
            expect(await manager.checkAllPrerequisites([])).toEqual([]);
            expect(mocks.executor.execute).not.toHaveBeenCalled();
        });
    });
});
