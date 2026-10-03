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
const mockListDeclaredTriggersAndRules = jest.fn();
jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    ...jest.requireActual('@/features/app-builder/services/appConfigPackages'),
    listDeclaredActions: (...args: unknown[]) => mockListDeclaredActions(...args),
    listDeclaredTriggersAndRules: (...args: unknown[]) => mockListDeclaredTriggersAndRules(...args),
}));

import type { DeclaredAction } from '@/features/app-builder/services/appConfigPackages';
import {
    deleteUndeclaredActions,
    findUndeclaredActions,
    findUndeclaredRulesAndTriggers,
    type DeployedRule,
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

/** A rule as `aio runtime rule list --json` prints it: the trigger that fires it, the action it starts. */
const ruleEntry = (name: string, trigger: string, action: string) => {
    const [pkg, actionName] = action.split('/');
    return {
        name,
        namespace: 'ns-northwind',
        status: 'active',
        trigger: { name: trigger, path: 'ns-northwind' },
        action: { name: actionName, path: `ns-northwind/${pkg}` },
    };
};

const RULE_LIST = 'aio runtime rule list --json';

/**
 * Answer `aio runtime action list <pkg>` per package and the rule list; any other command
 * succeeds.
 */
function answerListings(
    deps: ReturnType<typeof makeDeps>,
    byPackage: Record<string, ReturnType<typeof listing>>,
    rules: Array<ReturnType<typeof ruleEntry>> = [],
) {
    deps.commandManager.execute.mockImplementation(async (command: string) => {
        if (command === RULE_LIST) return createSuccessResult(JSON.stringify(rules));
        const match = /^aio runtime action list (\S+) --json$/u.exec(command);
        if (match) return byPackage[match[1]] ?? createFailureResult('The requested resource does not exist.');
        return createSuccessResult('');
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockFetchRuntimeCredentials.mockResolvedValue({ namespace: 'ns-northwind', auth: 'fake-test-auth-not-a-secret' });
    mockListDeclaredTriggersAndRules.mockResolvedValue({ triggers: [], rules: [] });
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
            if (command === RULE_LIST) return createSuccessResult('[]');
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

// AB-58: on 2026-10-02 a deploy stopped declaring the hourly price alarm and its rule, and
// both stayed in the namespace, firing into a deleted action. They are namespace-level, so
// what ties one to an app is the action its rule starts.
describe('findUndeclaredRulesAndTriggers', () => {
    const rule = (name: string, trigger: string, actionPackage: string): DeployedRule => ({ name, trigger, actionPackage });
    const declaredRuntime = { packages: ['erp'], triggers: ['erp-schedule-heartbeat'], rules: ['erp-schedule-on-heartbeat'] };

    it('names a rule the app no longer declares, and the trigger only it used', () => {
        const found = findUndeclaredRulesAndTriggers(declaredRuntime, [
            rule('erp-prices-hourly-on-timer', 'erp-prices-hourly-timer', 'erp'),
            rule('erp-schedule-on-heartbeat', 'erp-schedule-heartbeat', 'erp'),
        ]);
        expect(found).toEqual({ rules: ['erp-prices-hourly-on-timer'], triggers: ['erp-prices-hourly-timer'] });
    });

    it('CONTROL: declared rules and triggers are never named', () => {
        const found = findUndeclaredRulesAndTriggers(declaredRuntime, [
            rule('erp-schedule-on-heartbeat', 'erp-schedule-heartbeat', 'erp'),
        ]);
        expect(found).toStrictEqual({ rules: [], triggers: [] });
    });

    it('never touches a rule that starts an action in a package no app declares', () => {
        const found = findUndeclaredRulesAndTriggers(declaredRuntime, [
            rule('their-rule', 'their-timer', 'someone-elses'),
            rule('bare-rule', 'bare-timer', ''),
        ]);
        expect(found).toStrictEqual({ rules: [], triggers: [] });
    });

    it('keeps a trigger a declared rule or another app’s rule still uses', () => {
        const found = findUndeclaredRulesAndTriggers(declaredRuntime, [
            rule('old-rule', 'erp-schedule-heartbeat', 'erp'),
            rule('old-rule-2', 'shared-timer', 'erp'),
            rule('their-rule', 'shared-timer', 'someone-elses'),
        ]);
        expect(found).toEqual({ rules: ['old-rule', 'old-rule-2'], triggers: [] });
    });

    it('judges nothing when the config keeps its rules or triggers in an include it did not read', () => {
        const found = findUndeclaredRulesAndTriggers(
            { packages: ['erp'], triggers: ['$include'], rules: [] },
            [rule('erp-prices-hourly-on-timer', 'erp-prices-hourly-timer', 'erp')],
        );
        expect(found).toStrictEqual({ rules: [], triggers: [] });
    });

    it('never names something the command line could not carry safely', () => {
        const found = findUndeclaredRulesAndTriggers(declaredRuntime, [rule('old; rm -rf', 'old timer', 'erp')]);
        expect(found).toStrictEqual({ rules: [], triggers: [] });
    });
});

describe('deleteUndeclaredActions — rules and triggers (AB-58)', () => {
    const HEARTBEAT = ruleEntry('erp-schedule-on-heartbeat', 'erp-schedule-heartbeat', 'erp/schedule');
    const OLD_ALARM = ruleEntry('erp-prices-hourly-on-timer', 'erp-prices-hourly-timer', 'erp/prices-scheduled');

    beforeEach(() => {
        mockListDeclaredActions.mockResolvedValue(declared('erp', 'schedule'));
        mockListDeclaredTriggersAndRules.mockResolvedValue({
            triggers: ['erp-schedule-heartbeat'],
            rules: ['erp-schedule-on-heartbeat'],
        });
    });

    it('deletes the undeclared rule, then its trigger, and says so; declared ones stay', async () => {
        const deps = makeDeps();
        answerListings(deps, { erp: listing('schedule') }, [HEARTBEAT, OLD_ALARM]);

        const result = await deleteUndeclaredActions(deps, ['/c/erp-integration']);

        expect(result).toEqual({
            namespace: 'ns-northwind',
            deleted: ['rule erp-prices-hourly-on-timer', 'trigger erp-prices-hourly-timer'],
            failed: [],
        });
        const deletes = deps.commandManager.execute.mock.calls
            .map((call) => call[0] as string)
            .filter((command) => / delete /u.test(command));
        // The same commands a removal uses (`deleteRuntimeEntity`), rule before trigger.
        expect(deletes).toEqual([
            'aio runtime rule delete erp-prices-hourly-on-timer',
            'aio runtime trigger delete erp-prices-hourly-timer',
        ]);
        expect(mockListDeclaredTriggersAndRules).toHaveBeenCalledWith('/c/erp-integration');
    });

    it('reads what every app sharing the workspace declares, so one never deletes the other’s timer', async () => {
        mockListDeclaredActions.mockImplementation(async (componentPath: string) =>
            componentPath.endsWith('demo-erp') ? declared('demo-erp', 'health') : declared('erp', 'schedule'),
        );
        mockListDeclaredTriggersAndRules.mockImplementation(async (componentPath: string) =>
            componentPath.endsWith('demo-erp')
                ? { triggers: ['erp-prices-hourly-timer'], rules: ['erp-prices-hourly-on-timer'] }
                : { triggers: ['erp-schedule-heartbeat'], rules: ['erp-schedule-on-heartbeat'] },
        );
        const deps = makeDeps();
        answerListings(deps, { erp: listing('schedule'), 'demo-erp': listing('health') }, [HEARTBEAT, OLD_ALARM]);

        const result = await deleteUndeclaredActions(deps, ['/c/erp-integration', '/c/demo-erp']);

        expect(result.deleted).toStrictEqual([]);
    });

    it('deletes nothing, actions included, when the rules cannot be listed', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockImplementation(async (command: string) => {
            if (command === 'aio runtime action list erp --json') return listing('schedule', 'old');
            if (command === RULE_LIST) return createFailureResult('An AUTH key must be specified');
            return createSuccessResult('');
        });

        const result = await deleteUndeclaredActions(deps, ['/c/erp-integration']);

        expect(result.note).toMatch(/could not check/i);
        const commands = deps.commandManager.execute.mock.calls.map((call) => call[0] as string);
        expect(commands.some((c) => / delete /u.test(c))).toBe(false);
    });

    it('deletes nothing when a listed rule does not say what it starts', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockImplementation(async (command: string) => {
            if (command === 'aio runtime action list erp --json') return listing('schedule');
            if (command === RULE_LIST) return createSuccessResult(JSON.stringify([{ name: 'erp-prices-hourly-on-timer' }]));
            return createSuccessResult('');
        });

        const result = await deleteUndeclaredActions(deps, ['/c/erp-integration']);

        expect(result.note).toMatch(/could not check/i);
        const commands = deps.commandManager.execute.mock.calls.map((call) => call[0] as string);
        expect(commands.some((c) => / delete /u.test(c))).toBe(false);
    });

    it('reports a rule or trigger Runtime refused to delete instead of claiming it', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockImplementation(async (command: string) => {
            if (command === 'aio runtime action list erp --json') return listing('schedule');
            if (command === RULE_LIST) return createSuccessResult(JSON.stringify([HEARTBEAT, OLD_ALARM]));
            if (command === 'aio runtime trigger delete erp-prices-hourly-timer') return createFailureResult('400');
            return createSuccessResult('');
        });

        const result = await deleteUndeclaredActions(deps, ['/c/erp-integration']);

        expect(result.deleted).toEqual(['rule erp-prices-hourly-on-timer']);
        expect(result.failed).toEqual(['trigger erp-prices-hourly-timer']);
    });
});
