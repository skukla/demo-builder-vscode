/**
 * What a deploy leaves behind: actions deployed in a package the app declares but no
 * longer declared in it, and the rules and triggers (timers) that started them.
 *
 * `aio app deploy` adds and updates; it does not delete an action the app stopped
 * declaring. On 2026-09-27 the ERP integration's order column moved from `erp/order-grid`
 * to `admin-ui/order-grid`, and the old action and its `__secured_` partner stayed
 * deployed until they were deleted by hand. On 2026-10-02 a deploy that stopped declaring
 * the hourly price alarm left its trigger and rule firing into a deleted action (AB-58).
 * A deploy therefore ends here, and so does the agent tool that asks for the same clean-up.
 *
 * Three rules keep this from deleting live code:
 * - Only packages whose declared actions were READ are judged. A package declared nowhere
 *   (another app's, or one whose include could not be read — `listDeclaredActions` reads
 *   an unreadable file as declaring nothing) is left alone.
 * - Rules and triggers belong to the namespace, not to a package, so a rule is judged only
 *   when the action it starts lives in a package the apps declare, and a trigger only when
 *   every rule using it is being deleted. A trigger with no rule is left alone: nothing
 *   says whose it is.
 * - Everything is listed before anything is deleted, and a listing that fails stops the
 *   whole clean-up: "could not look" is never read as "nothing there".
 *
 * Rules and triggers are deleted with the same command a removal uses
 * (`deleteRuntimeEntity`), rules first.
 *
 * Callers run this inside `withOrgContext`, which picks the workspace.
 *
 * @module features/app-builder/services/runtimeUndeclaredActions
 */

import { listDeclaredActions, listDeclaredTriggersAndRules, type DeclaredAction } from './appConfigPackages';
import {
    RUNTIME_ENTITY_NAME,
    commandFailure,
    deleteRuntimeEntity,
    leftoverLabel,
    runInNamespace,
    runtimeNamespaceEnv,
    type DeclaredRuntime,
    type RuntimeNamespaceDeps,
    type RuntimeNamespaceEnv,
} from './runtimeNamespace';
import { parseJSON, toError } from '@/types/typeGuards';

/** The hidden partner `require-adobe-auth` deploys beside a web action, named after it. */
const SECURED_PREFIX = '__secured_';

/** An action name Runtime allows; anything else never reaches the CLI. */
const ACTION_NAME = /^[A-Za-z0-9_.-]+$/u;

/** One deployed action the app no longer declares. */
export interface UndeclaredAction {
    packageName: string;
    actionName: string;
}

/** One deployed rule: the trigger that fires it and the package of the action it starts. */
export interface DeployedRule {
    name: string;
    trigger: string;
    /** Empty when the action is in no package. */
    actionPackage: string;
}

/** The deployed rules and triggers no app sharing the workspace declares. */
export interface UndeclaredRulesAndTriggers {
    rules: string[];
    triggers: string[];
}

/** What the clean-up found and did. */
export interface UndeclaredActionCleanup {
    namespace?: string;
    /** `package/action`, `rule name` or `trigger name`, deleted. */
    deleted: string[];
    /** The same, still deployed after Runtime refused the delete. */
    failed: string[];
    /** Why nothing was judged, when the namespace could not be read. */
    note?: string;
}

const label = (action: UndeclaredAction): string => `${action.packageName}/${action.actionName}`;

/** The declared action names, by package. */
function declaredByPackage(declared: DeclaredAction[]): Map<string, Set<string>> {
    const byPackage = new Map<string, Set<string>>();
    for (const { packageName, actionName } of declared) {
        const names = byPackage.get(packageName) ?? new Set<string>();
        names.add(actionName);
        byPackage.set(packageName, names);
    }
    return byPackage;
}

/**
 * Which deployed actions, in packages the app declares, it no longer declares. A
 * `__secured_x` is judged by `x`. The public action is listed before its partner, since
 * the public one is the sequence that names it.
 */
export function findUndeclaredActions(
    declared: DeclaredAction[],
    deployed: Record<string, string[]>,
): UndeclaredAction[] {
    const byPackage = declaredByPackage(declared);
    const found: UndeclaredAction[] = [];
    for (const [packageName, names] of Object.entries(deployed)) {
        const wanted = byPackage.get(packageName);
        if (!wanted) continue;
        for (const actionName of names) {
            const own = actionName.startsWith(SECURED_PREFIX) ? actionName.slice(SECURED_PREFIX.length) : actionName;
            if (ACTION_NAME.test(actionName) && !wanted.has(own)) found.push({ packageName, actionName });
        }
    }
    const secured = (action: UndeclaredAction) => (action.actionName.startsWith(SECURED_PREFIX) ? 1 : 0);
    return found.sort((a, b) => secured(a) - secured(b));
}

/**
 * The action names deployed in each package.
 *
 * @throws When a package cannot be listed — a failure is never an empty list
 */
async function listDeployedActions(
    deps: RuntimeNamespaceDeps,
    packages: string[],
    env: RuntimeNamespaceEnv,
): Promise<Record<string, string[]>> {
    const deployed: Record<string, string[]> = {};
    for (const packageName of packages) {
        const command = `aio runtime action list ${packageName} --json`;
         
        const result = await runInNamespace(deps, command, env);
        if (result.code !== 0) throw new Error(commandFailure(command, result));
        const parsed = parseJSON<Array<{ name?: string }>>(result.stdout.trim());
        if (!Array.isArray(parsed)) throw new Error(`${command}: the answer was not a list`);
        deployed[packageName] = parsed.map((entry) => entry.name ?? '').filter(Boolean);
    }
    return deployed;
}

/** The key a config uses to keep a block in another file, which the declared names do not follow. */
const INCLUDE_KEY = '$include';

/**
 * Which deployed rules, and the triggers only they use, no app declares. A rule is the
 * apps' to judge when the action it starts is in a package they declare; a trigger is kept
 * while a declared rule, or a rule that is not theirs, still uses it.
 */
export function findUndeclaredRulesAndTriggers(
    declared: DeclaredRuntime,
    deployed: DeployedRule[],
): UndeclaredRulesAndTriggers {
    if ([...declared.rules, ...declared.triggers].includes(INCLUDE_KEY)) return { rules: [], triggers: [] };
    const going = deployed.filter(
        (rule) =>
            declared.packages.includes(rule.actionPackage) &&
            !declared.rules.includes(rule.name) &&
            RUNTIME_ENTITY_NAME.test(rule.name),
    );
    const goingNames = new Set(going.map((rule) => rule.name));
    const stillUsed = new Set(deployed.filter((rule) => !goingNames.has(rule.name)).map((rule) => rule.trigger));
    const triggers = [...new Set(going.map((rule) => rule.trigger))].filter(
        (name) => RUNTIME_ENTITY_NAME.test(name) && !declared.triggers.includes(name) && !stillUsed.has(name),
    );
    return { rules: [...goingNames], triggers };
}

/** A rule as `aio runtime rule list --json` prints it (each entry is the rule's own `get`). */
interface ListedRule {
    name?: unknown;
    trigger?: { name?: unknown };
    /** `path` is `namespace` or `namespace/package`. */
    action?: { path?: unknown };
}

/**
 * The rules deployed in the namespace.
 *
 * @throws When they cannot be listed, or one does not say what fires it and what it starts
 */
async function listDeployedRules(deps: RuntimeNamespaceDeps, env: RuntimeNamespaceEnv): Promise<DeployedRule[]> {
    const command = 'aio runtime rule list --json';
    const result = await runInNamespace(deps, command, env);
    if (result.code !== 0) throw new Error(commandFailure(command, result));
    const parsed = parseJSON<ListedRule[]>(result.stdout.trim());
    if (!Array.isArray(parsed)) throw new Error(`${command}: the answer was not a list`);
    return parsed.map((entry) => {
        const { name, trigger, action } = entry;
        if (typeof name !== 'string' || typeof trigger?.name !== 'string' || typeof action?.path !== 'string') {
            throw new Error(`${command}: a rule did not say what fires it and what it starts`);
        }
        return { name, trigger: trigger.name, actionPackage: action.path.split('/')[1] ?? '' };
    });
}

/** What the apps declare in Runtime between them: the packages, and every trigger and rule. */
async function declaredRuntime(componentPaths: string[], packages: string[]): Promise<DeclaredRuntime> {
    const each = await Promise.all(componentPaths.map((p) => listDeclaredTriggersAndRules(p)));
    return {
        packages,
        triggers: each.flatMap((one) => one.triggers),
        rules: each.flatMap((one) => one.rules),
    };
}

/** Everything to delete, in order: rules, then triggers, then actions. */
interface Leftovers {
    env: RuntimeNamespaceEnv;
    timers: UndeclaredRulesAndTriggers;
    actions: UndeclaredAction[];
}

/**
 * List the namespace and judge it against what the apps declare. Nothing is deleted here.
 *
 * @throws When anything could not be listed
 */
async function findLeftovers(
    deps: RuntimeNamespaceDeps,
    componentPaths: string[],
    declared: DeclaredAction[],
    packages: string[],
): Promise<Leftovers> {
    const env = await runtimeNamespaceEnv(deps);
    const deployed = await listDeployedActions(deps, packages, env);
    const rules = await listDeployedRules(deps, env);
    return {
        env,
        timers: findUndeclaredRulesAndTriggers(await declaredRuntime(componentPaths, packages), rules),
        actions: findUndeclaredActions(declared, deployed),
    };
}

/** Delete one thing and record under its label whether Runtime did. */
async function deleteOne(
    deps: RuntimeNamespaceDeps,
    cleanup: UndeclaredActionCleanup,
    name: string,
    run: () => Promise<void>,
): Promise<void> {
    try {
        await run();
        cleanup.deleted.push(name);
    } catch (error) {
        deps.logger.warn(`[Runtime] delete ${name}: ${toError(error).message}`);
        cleanup.failed.push(name);
    }
}

/** Delete one undeclared action. @throws When Runtime refuses */
async function deleteAction(deps: RuntimeNamespaceDeps, action: UndeclaredAction, env: RuntimeNamespaceEnv): Promise<void> {
    const command = `aio runtime action delete ${label(action)}`;
    const result = await runInNamespace(deps, command, env);
    if (result.code !== 0) throw new Error(commandFailure(command, result));
}

/**
 * Delete what the apps in `componentPaths` left behind: actions in their own packages, and
 * the rules and triggers that started them. Pass every component that deploys into the
 * same workspace: a pair shares one, and each app's declarations are what keep the other's
 * actions and timers safe.
 */
export async function deleteUndeclaredActions(
    deps: RuntimeNamespaceDeps,
    componentPaths: string[],
): Promise<UndeclaredActionCleanup> {
    const declared = (await Promise.all(componentPaths.map((p) => listDeclaredActions(p)))).flat();
    const packages = [...declaredByPackage(declared).keys()].filter((name) => ACTION_NAME.test(name));
    if (packages.length === 0) return { deleted: [], failed: [] };

    let found: Leftovers;
    try {
        found = await findLeftovers(deps, componentPaths, declared, packages);
    } catch (error) {
        deps.logger.warn(`[Runtime] Could not check for code left behind: ${toError(error).message}`);
        return { deleted: [], failed: [], note: 'Could not check the namespace for code left behind.' };
    }

    const { env, timers, actions } = found;
    const cleanup: UndeclaredActionCleanup = { namespace: env.AIO_RUNTIME_NAMESPACE, deleted: [], failed: [] };
    for (const kind of ['rule', 'trigger'] as const) {
        for (const name of timers[`${kind}s`]) {
            await deleteOne(deps, cleanup, leftoverLabel(kind, name), () => deleteRuntimeEntity(deps, kind, name, env));
        }
    }
    for (const action of actions) {
        await deleteOne(deps, cleanup, label(action), () => deleteAction(deps, action, env));
    }
    if (cleanup.deleted.length > 0) {
        deps.logger.info(`[Runtime] Deleted code no longer declared: ${cleanup.deleted.join(', ')}`);
    }
    return cleanup;
}
