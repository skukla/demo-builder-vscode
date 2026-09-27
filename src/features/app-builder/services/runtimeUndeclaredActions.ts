/**
 * The actions a deploy leaves behind: deployed in a package the app declares, but no
 * longer declared in it.
 *
 * `aio app deploy` adds and updates; it does not delete an action the app stopped
 * declaring. On 2026-09-27 the ERP integration's order column moved from `erp/order-grid`
 * to `admin-ui/order-grid`, and the old action and its `__secured_` partner stayed
 * deployed until they were deleted by hand. A deploy therefore ends here, and so does the
 * agent tool that asks for the same clean-up.
 *
 * Two rules keep this from deleting live code:
 * - Only packages whose declared actions were READ are judged. A package declared nowhere
 *   (another app's, or one whose include could not be read — `listDeclaredActions` reads
 *   an unreadable file as declaring nothing) is left alone.
 * - Every package is listed before anything is deleted, and one that cannot be listed
 *   stops the whole clean-up: "could not look" is never read as "nothing there".
 *
 * Callers run this inside `withOrgContext`, which picks the workspace.
 *
 * @module features/app-builder/services/runtimeUndeclaredActions
 */

import { listDeclaredActions, type DeclaredAction } from './appConfigPackages';
import {
    commandFailure,
    runInNamespace,
    runtimeNamespaceEnv,
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

/** What the clean-up found and did. */
export interface UndeclaredActionCleanup {
    namespace?: string;
    /** `package/action`, deleted. */
    deleted: string[];
    /** `package/action`, still deployed after Runtime refused the delete. */
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

/**
 * Delete what the apps in `componentPaths` left behind in their own packages. Pass every
 * component that deploys into the same workspace: a pair shares one, and each app's
 * declarations are what keep the other's actions safe.
 */
export async function deleteUndeclaredActions(
    deps: RuntimeNamespaceDeps,
    componentPaths: string[],
): Promise<UndeclaredActionCleanup> {
    const declared = (await Promise.all(componentPaths.map((p) => listDeclaredActions(p)))).flat();
    const packages = [...declaredByPackage(declared).keys()].filter((name) => ACTION_NAME.test(name));
    if (packages.length === 0) return { deleted: [], failed: [] };

    let env: RuntimeNamespaceEnv;
    let deployed: Record<string, string[]>;
    try {
        env = await runtimeNamespaceEnv(deps);
        deployed = await listDeployedActions(deps, packages, env);
    } catch (error) {
        deps.logger.warn(`[Runtime] Could not check for code left behind: ${toError(error).message}`);
        return { deleted: [], failed: [], note: 'Could not check the namespace for code left behind.' };
    }

    const cleanup: UndeclaredActionCleanup = { namespace: env.AIO_RUNTIME_NAMESPACE, deleted: [], failed: [] };
    for (const action of findUndeclaredActions(declared, deployed)) {
         
        const result = await runInNamespace(deps, `aio runtime action delete ${label(action)}`, env);
        if (result.code === 0) {
            cleanup.deleted.push(label(action));
        } else {
            deps.logger.warn(`[Runtime] ${commandFailure(`delete ${label(action)}`, result)}`);
            cleanup.failed.push(label(action));
        }
    }
    if (cleanup.deleted.length > 0) {
        deps.logger.info(`[Runtime] Deleted code no longer declared: ${cleanup.deleted.join(', ')}`);
    }
    return cleanup;
}
