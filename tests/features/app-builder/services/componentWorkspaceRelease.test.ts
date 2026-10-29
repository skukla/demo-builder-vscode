/**
 * Releasing a removal's workspaces (`componentWorkspace.ts`) and confirming Adobe really
 * deletes what was in them (`componentWorkspaceRelease.ts`).
 *
 * Measured on Bodea on 2026-09-27: a deleted workspace's own Runtime key kept working for
 * ten minutes and answered 401 "the supplied authentication is invalid" at eleven. These pin
 * that the key is read BEFORE the delete, that only a refusal of that key counts as gone,
 * and which workspaces may take a component's leftovers with them.
 */

import { releaseWorkspaces, workspaceTakesLeftovers } from '@/features/app-builder/services/componentWorkspace';
import {
    buildWorkspaceReleaseDeps,
    watchNamespaceRemoval,
} from '@/features/app-builder/services/componentWorkspaceRelease';
import type { Project } from '@/types/base';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createFailureResult, createSuccessResult } from '../../../helpers/commandResultFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

const SOURCE = { owner: 'acme', repo: 'app', branch: 'main' };
const NORTHWIND = { id: 'ws-nw', name: 'NorthwindERP', title: 'Northwind ERP' };
const KEY = { AIO_RUNTIME_NAMESPACE: 'ns-northwind', AIO_RUNTIME_AUTH: 'fake-test-auth-not-a-secret' };
const REFUSED = 'Error: failed to list namespaces: the supplied authentication is invalid (401 Unauthorized)';

function pairProject(): Project {
    return createMockProject({
        appBuilderComponents: {
            'erp-integration': { kind: 'integration', status: 'deployed', source: SOURCE, workspace: NORTHWIND },
            'demo-erp': { kind: 'system', status: 'deployed', source: SOURCE, workspace: NORTHWIND },
            'other-app': { kind: 'integration', status: 'deployed', source: SOURCE },
        },
    });
}

describe('workspaceTakesLeftovers', () => {
    it('answers true for a workspace used only by what this removal removes', () => {
        expect(workspaceTakesLeftovers(pairProject(), 'erp-integration', ['erp-integration', 'demo-erp'])).toBe(true);
    });

    it('answers false while something that stays still uses it', () => {
        expect(workspaceTakesLeftovers(pairProject(), 'erp-integration', ['erp-integration'])).toBe(false);
    });

    it("answers false for a component in the project's own workspace, which is never deleted", () => {
        expect(workspaceTakesLeftovers(pairProject(), 'other-app', ['other-app'])).toBe(false);
    });
});

describe('releaseWorkspaces', () => {
    function makeDeps() {
        const order: string[] = [];
        return {
            order,
            deleteComponentWorkspace: jest.fn(async (): Promise<{ error: string } | undefined> => {
                order.push('delete');
                return undefined;
            }),
            namespaceKeyOf: jest.fn(async () => {
                order.push('key');
                return KEY;
            }),
            watchNamespaceRemoval: jest.fn(),
            progressLabel: 'Removing the workspace',
            logger: createMockLogger(),
        };
    }

    it('reads the key before the delete, then watches it, and names the workspace deleted', async () => {
        const deps = makeDeps();

        const release = await releaseWorkspaces(pairProject(), [NORTHWIND], deps);

        expect(deps.order).toStrictEqual(['key', 'delete']);
        expect(deps.watchNamespaceRemoval).toHaveBeenCalledWith(KEY, 'Northwind ERP');
        expect(release).toStrictEqual({ deleted: ['Northwind ERP'], warnings: [] });
    });

    it('a workspace Adobe would not delete is a warning, and nothing is watched', async () => {
        const deps = makeDeps();
        deps.deleteComponentWorkspace.mockResolvedValueOnce({ error: 'Conflict (409)' });

        const release = await releaseWorkspaces(pairProject(), [NORTHWIND], deps);

        expect(release.deleted).toStrictEqual([]);
        expect(release.warnings).toStrictEqual([
            'The Northwind ERP workspace could not be deleted, so anything still deployed in it keeps running: ' +
                'Conflict (409)',
        ]);
        expect(deps.watchNamespaceRemoval).not.toHaveBeenCalled();
    });

    it('still deletes when the key cannot be read, with nothing to watch', async () => {
        const deps = makeDeps();
        deps.namespaceKeyOf.mockRejectedValueOnce(new Error('no credentials'));

        const release = await releaseWorkspaces(pairProject(), [NORTHWIND], deps);

        expect(release.deleted).toStrictEqual(['Northwind ERP']);
        expect(deps.watchNamespaceRemoval).not.toHaveBeenCalled();
    });

    describe("the Commerce REST credential kept for the workspace (PL-64)", () => {
        const KEPT = 'demoBuilder.commerceRest.credential.ws-nw';

        function withCredential() {
            const { secrets, store } = createMockSecretStorage({ [KEPT]: '{}' });
            const { forgetWorkspaceCredential } = buildWorkspaceReleaseDeps(
                { commandManager: createMockCommandExecutor(), logger: createMockLogger(), secrets },
                jest.fn(),
            );
            return { deps: { ...makeDeps(), forgetWorkspaceCredential }, store };
        }

        it('goes when the workspace is deleted', async () => {
            const { deps, store } = withCredential();

            await releaseWorkspaces(pairProject(), [NORTHWIND], deps);

            expect(store.has(KEPT)).toBe(false);
        });

        it('stays while the workspace does', async () => {
            const { deps, store } = withCredential();
            deps.deleteComponentWorkspace.mockResolvedValueOnce({ error: 'Conflict (409)' });

            await releaseWorkspaces(pairProject(), [NORTHWIND], deps);

            expect(store.has(KEPT)).toBe(true);
        });
    });
});

describe('watchNamespaceRemoval', () => {
    function watchDeps() {
        return { commandManager: createMockCommandExecutor(), logger: createMockLogger() };
    }

    it('answers gone once Runtime refuses the old key, asking with that key every time', async () => {
        const deps = watchDeps();
        deps.commandManager.execute
            .mockResolvedValueOnce(createSuccessResult('["ns-northwind"]'))
            .mockResolvedValueOnce(createSuccessResult('["ns-northwind"]'))
            .mockResolvedValueOnce(createFailureResult(REFUSED));
        const wait = jest.fn(async () => undefined);

        await expect(watchNamespaceRemoval(deps, KEY, { wait, intervalMs: 1, limitMs: 10 })).resolves.toBe('gone');

        expect(deps.commandManager.execute).toHaveBeenCalledTimes(3);
        for (const call of deps.commandManager.execute.mock.calls) {
            expect(call[0]).toBe('aio runtime namespace list --json');
            expect(call[1]?.env).toStrictEqual(KEY);
        }
    });

    it('answers still-there when the key keeps working past the limit', async () => {
        const deps = watchDeps();
        deps.commandManager.execute.mockResolvedValue(createSuccessResult('["ns-northwind"]'));

        const outcome = await watchNamespaceRemoval(deps, KEY, { wait: async () => undefined, intervalMs: 5, limitMs: 10 });

        expect(outcome).toBe('still-there');
        expect(deps.commandManager.execute).toHaveBeenCalledTimes(3);
    });

    it('does not read any other failure (a network error) as gone', async () => {
        const deps = watchDeps();
        deps.commandManager.execute.mockResolvedValue(createFailureResult('getaddrinfo ENOTFOUND adobeioruntime.net'));

        const outcome = await watchNamespaceRemoval(deps, KEY, { wait: async () => undefined, intervalMs: 5, limitMs: 5 });

        expect(outcome).toBe('still-there');
    });
});
