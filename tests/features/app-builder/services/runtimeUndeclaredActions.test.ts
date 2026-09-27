/**
 * runtimeUndeclaredActions — the actions a deploy leaves behind in the app's own packages.
 *
 * `aio app deploy` does not delete an action the app stopped declaring. On 2026-09-27 the
 * ERP integration's order column moved from `erp/order-grid` to `admin-ui/order-grid`, and
 * the old action (and its `__secured_` partner) stayed deployed until it was deleted by
 * hand. These pin what counts as left behind, and the rules that keep the clean-up from
 * deleting live code: only packages the config was read for, never "could not look" read
 * as "nothing there".
 */

const mockFetchRuntimeCredentials = jest.fn();
jest.mock('@/features/app-builder/services/runtimeCredentials', () => ({
    ...jest.requireActual('@/features/app-builder/services/runtimeCredentials'),
    fetchRuntimeCredentials: (...args: unknown[]) => mockFetchRuntimeCredentials(...args),
}));

const mockListDeclaredActions = jest.fn();
jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    ...jest.requireActual('@/features/app-builder/services/appConfigPackages'),
    listDeclaredActions: (...args: unknown[]) => mockListDeclaredActions(...args),
}));

import type { DeclaredAction } from '@/features/app-builder/services/appConfigPackages';
import {
    deleteUndeclaredActions,
    findUndeclaredActions,
} from '@/features/app-builder/services/runtimeUndeclaredActions';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createFailureResult, createSuccessResult } from '../../../helpers/commandResultFake';
import { createMockLogger } from '../../../helpers/loggerFake';

const declared = (packageName: string, ...names: string[]): DeclaredAction[] =>
    names.map((actionName) => ({ packageName, actionName, web: true }));

const listing = (...names: string[]) => createSuccessResult(JSON.stringify(names.map((name) => ({ name }))));

function makeDeps() {
    return { commandManager: createMockCommandExecutor(), logger: createMockLogger() };
}

/** Answer `aio runtime action list <pkg>` per package; any other command succeeds. */
function answerListings(deps: ReturnType<typeof makeDeps>, byPackage: Record<string, ReturnType<typeof listing>>) {
    deps.commandManager.execute.mockImplementation(async (command: string) => {
        const match = /^aio runtime action list (\S+) --json$/u.exec(command);
        if (match) return byPackage[match[1]] ?? createFailureResult('The requested resource does not exist.');
        return createSuccessResult('');
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockFetchRuntimeCredentials.mockResolvedValue({ namespace: 'ns-northwind', auth: 'fake-test-auth-not-a-secret' });
});

describe('findUndeclaredActions', () => {
    it('names an action the app no longer declares, with its __secured_ partner', () => {
        const found = findUndeclaredActions(declared('erp', 'status'), {
            erp: ['status', '__secured_status', 'order-grid', '__secured_order-grid'],
        });
        expect(found).toEqual([
            { packageName: 'erp', actionName: 'order-grid' },
            { packageName: 'erp', actionName: '__secured_order-grid' },
        ]);
    });

    it('never touches a package the config was not read for', () => {
        // A package declared nowhere (another app's, or one whose include could not be
        // read) is not this clean-up's to judge.
        const found = findUndeclaredActions(declared('erp', 'status'), {
            'app-management': ['installation'],
        });
        expect(found).toStrictEqual([]);
    });

    it('CONTROL: an app that still declares everything leaves nothing to delete', () => {
        const found = findUndeclaredActions(declared('admin-ui', 'order-grid'), {
            'admin-ui': ['order-grid', '__secured_order-grid'],
        });
        expect(found).toStrictEqual([]);
    });

    it('lists the public action before its __secured_ partner, so a sequence goes first', () => {
        const found = findUndeclaredActions(declared('erp', 'status'), {
            erp: ['__secured_old', 'old'],
        });
        expect(found.map((a) => a.actionName)).toEqual(['old', '__secured_old']);
    });
});

describe('deleteUndeclaredActions', () => {
    it('deletes what the app left behind in its own packages, and says what it deleted', async () => {
        mockListDeclaredActions.mockResolvedValue(declared('erp', 'status'));
        const deps = makeDeps();
        answerListings(deps, { erp: listing('status', 'order-grid', '__secured_order-grid') });

        const result = await deleteUndeclaredActions(deps, ['/components/erp-integration']);

        expect(result).toEqual({
            namespace: 'ns-northwind',
            deleted: ['erp/order-grid', 'erp/__secured_order-grid'],
            failed: [],
        });
        const commands = deps.commandManager.execute.mock.calls.map((call) => call[0]);
        expect(commands).toContain('aio runtime action delete erp/order-grid');
        expect(commands).toContain('aio runtime action delete erp/__secured_order-grid');
        expect(commands).not.toContain('aio runtime action delete erp/status');
    });

    it('reads every component sharing the workspace, so one never deletes the other’s actions', async () => {
        mockListDeclaredActions.mockImplementation(async (componentPath: string) =>
            componentPath.endsWith('demo-erp') ? declared('demo-erp', 'health') : declared('erp', 'status'),
        );
        const deps = makeDeps();
        answerListings(deps, { erp: listing('status'), 'demo-erp': listing('health') });

        const result = await deleteUndeclaredActions(deps, ['/c/erp-integration', '/c/demo-erp']);

        expect(result.deleted).toStrictEqual([]);
        expect(mockListDeclaredActions).toHaveBeenCalledWith('/c/demo-erp');
    });

    it('deletes nothing and says so when a package cannot be listed', async () => {
        mockListDeclaredActions.mockResolvedValue([...declared('erp', 'status'), ...declared('webhook', 'prices')]);
        const deps = makeDeps();
        answerListings(deps, { erp: listing('status', 'order-grid') });

        const result = await deleteUndeclaredActions(deps, ['/c/erp-integration']);

        expect(result.deleted).toStrictEqual([]);
        expect(result.note).toMatch(/could not check/i);
        const commands = deps.commandManager.execute.mock.calls.map((call) => call[0]);
        expect(commands.some((c) => c.startsWith('aio runtime action delete'))).toBe(false);
    });

    it('reports a delete Runtime refused instead of claiming it', async () => {
        mockListDeclaredActions.mockResolvedValue(declared('erp', 'status'));
        const deps = makeDeps();
        deps.commandManager.execute.mockImplementation(async (command: string) => {
            if (command === 'aio runtime action list erp --json') return listing('status', 'old');
            if (command === 'aio runtime action delete erp/old') return createFailureResult('Conflict (409)');
            return createSuccessResult('');
        });

        const result = await deleteUndeclaredActions(deps, ['/c/erp-integration']);

        expect(result.deleted).toStrictEqual([]);
        expect(result.failed).toEqual(['erp/old']);
    });

    it('runs every command with the namespace key', async () => {
        mockListDeclaredActions.mockResolvedValue(declared('erp', 'status'));
        const deps = makeDeps();
        answerListings(deps, { erp: listing('status', 'old') });

        await deleteUndeclaredActions(deps, ['/c/erp-integration']);

        for (const call of deps.commandManager.execute.mock.calls) {
            expect(call[1]?.env).toEqual({
                AIO_RUNTIME_NAMESPACE: 'ns-northwind',
                AIO_RUNTIME_AUTH: 'fake-test-auth-not-a-secret',
            });
        }
    });
});
