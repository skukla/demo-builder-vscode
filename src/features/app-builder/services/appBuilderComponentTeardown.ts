/**
 * Removing an App Builder component, the remote half: the clean-up only its
 * deployed code can do, then the undeploy, then a check of what the undeploy
 * left running.
 *
 * The clean-up comes first because the undeploy deletes the code that does it:
 * the ERP integration's undo of its Commerce writes, an App Management app's
 * uninstall from Commerce, a system's wipe of its records. A clean-up that
 * fails stops the removal (`cleanUpBeforeUndeploy` answers the reasons),
 * unless the SC chose to remove anyway; then the same reasons are reported as
 * what stays behind.
 *
 * Split from `appBuilderComponentRunner`, which orchestrates the removal.
 *
 * @module features/app-builder/services/appBuilderComponentTeardown
 */

import type { CommerceDetachResult } from './erpDetach';
import { deriveOwPackage } from './owPackageName';
import {
    commandFailure,
    deleteRuntimeEntity,
    listRuntimeNames,
    runInNamespace,
    runtimeNamespaceEnv,
    CLEANUP_ORDER,
    leftoverLabel,
    type DeclaredRuntime,
    type RuntimeEntityKind,
    type RuntimeNamespaceEnv,
} from './runtimeNamespace';
import type { SystemWipeResult } from './systemRecordsWipe';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { MESH_DELETE_COMMAND } from '@/core/shell/meshDeleteCommand';
import { withOrgContext, type OrgContextTarget } from '@/core/shell/orgContextEnv';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { Logger } from '@/types/logger';
import { toError } from '@/types/typeGuards';

/**
 * What the post-undeploy verification found and did (AB-7). `aio app undeploy`
 * exits 0 while leaving deployed packages behind — measured live 2026-08-28:
 * a full remove "succeeded" in 5.4s with the whole app still serving, and a
 * kit removal left 12 packages. So removal VERIFIES: it lists the namespace
 * and deletes leftovers it can attribute to this integration by name.
 */
export interface RuntimeCleanupSummary {
    /** False when the namespace could not be listed — said, never silent. */
    verified: boolean;
    /** Leftover packages found after undeploy and deleted. */
    deleted: string[];
    /** Leftovers whose delete failed — these are STILL RUNNING. */
    failed: string[];
    note?: string;
}

/** What removal needs from the runner's dependencies. */
export interface TeardownDeps {
    commandManager: CommandExecutor;
    logger: Logger;
    onProgress?: (message: string, subMessage?: string) => void;
    /**
     * Undo the ERP integration's writes onto Commerce (erpDetach) BEFORE its
     * uninstall and undeploy take the action away. Skipped for every component
     * that deploys no `erp/detach`. Optional: bare unit tests never need it.
     */
    detachFromCommerce?: (
        project: Project,
        deployedUrls: Record<string, string> | undefined,
        onProgress?: (message: string) => void,
    ) => Promise<CommerceDetachResult>;
    /**
     * Uninstall an app-management lifecycle app from Commerce BEFORE its remove
     * tears the actions down (appManagementUninstaller). `aio app undeploy`
     * removes only the actions — the app's installer created I/O Events
     * registrations, binding packages, and Commerce-side eventing config that
     * only the app's own uninstall API removes, and once the actions are gone
     * that API is gone with them. Optional: mesh paths and bare tests never need it.
     */
    uninstallAppManagement?: (
        project: Project,
        componentId: string,
        onProgress?: (message: string) => void,
    ) => Promise<{ status: 'uninstalled' | 'skipped' | 'failed'; detail?: string }>;
    /** Delete a system's records before its undeploy (systemRecordsWipe). */
    wipeSystemRecords?: (
        project: Project,
        entry: AppBuilderComponentCatalogEntry,
        deployedUrls: Record<string, string> | undefined,
        name: string,
    ) => Promise<SystemWipeResult>;
}

/** One component about to be removed, as the clean-up needs it. */
export interface TeardownTarget {
    project: Project;
    id: string;
    state: AppBuilderComponentState;
    entry: AppBuilderComponentCatalogEntry;
}

/** One clean-up that did not finish: what failed, and what removing anyway leaves. */
interface Unfinished {
    what: string;
    leaves: string;
}

/** What the clean-up did, and what it could not do. */
export interface CleanupOutcome {
    commerceDetach?: CommerceDetachResult;
    unfinished: Unfinished[];
}

/**
 * Undo what the ERP integration wrote onto Commerce. Undefined when nothing
 * applied.
 */
async function detachIfErpIntegration(
    { project, id, state }: TeardownTarget,
    deps: TeardownDeps,
): Promise<CommerceDetachResult | undefined> {
    if (!deps.detachFromCommerce || state.kind !== 'integration') {
        return undefined;
    }
    const result = await deps.detachFromCommerce(project, state.deployedUrls, (message) =>
        deps.onProgress?.(OPERATION_STAGES.undoingCommerceChanges.label, message),
    );
    if (result.status === 'skipped') {
        return undefined;
    }
    if (result.status === 'failed') {
        deps.logger.warn(`[AppBuilderComponent Runner] ${id} Commerce detach did not finish: ${result.detail}`);
    }
    return result;
}

/**
 * The uninstall pass for `lifecycle: 'app-management'` apps. No-op for every
 * other entry, and when the caller wired no uninstaller. Never throws.
 *
 * @returns why it did not finish, or undefined
 */
async function uninstallIfAppManagement(
    { project, id, state, entry }: TeardownTarget,
    deps: TeardownDeps,
): Promise<string | undefined> {
    if (!deps.uninstallAppManagement || state.kind !== 'integration' || entry.lifecycle !== 'app-management') {
        return undefined;
    }
    try {
        const result = await deps.uninstallAppManagement(project, id, (message) =>
            deps.onProgress?.(OPERATION_STAGES.removingFromCommerce.label, message),
        );
        return result.status === 'failed' ? (result.detail ?? 'no reason given') : undefined;
    } catch (error) {
        return toError(error).message;
    }
}

/**
 * Delete a system's records. No-op for every other kind, and when the caller
 * wired no wipe.
 *
 * @returns why it did not finish, or undefined
 */
async function wipeIfSystem({ project, state, entry }: TeardownTarget, deps: TeardownDeps): Promise<string | undefined> {
    if (!deps.wipeSystemRecords || state.kind !== 'system') {
        return undefined;
    }
    deps.onProgress?.(OPERATION_STAGES.clearingRecords.label);
    const result = await deps.wipeSystemRecords(project, entry, state.deployedUrls, state.name ?? entry.name);
    return result.status === 'failed' ? (result.detail ?? 'no reason given') : undefined;
}

/**
 * Everything only the deployed code can clean up, run before the undeploy
 * takes that code away. Each step is attempted even when an earlier one
 * failed, so a retry has less to do and the SC hears every reason at once.
 *
 * @param target - the component, its record and its catalog entry
 * @param deps - the clean-up calls
 * @returns what was undone in Commerce, and what did not finish
 */
export async function cleanUpBeforeUndeploy(target: TeardownTarget, deps: TeardownDeps): Promise<CleanupOutcome> {
    const name = target.state.name ?? target.id;
    const unfinished: Unfinished[] = [];
    const commerceDetach = await detachIfErpIntegration(target, deps);
    if (commerceDetach?.status === 'failed') {
        unfinished.push({
            what: (commerceDetach.detail ?? `Not everything ${name} changed in Commerce was undone.`).replace(/\.$/, ''),
            leaves: 'those changes in Commerce',
        });
    }
    const uninstall = await uninstallIfAppManagement(target, deps);
    if (uninstall) {
        deps.logger.warn(`[AppBuilderComponent Runner] ${target.id} Commerce uninstall did not finish: ${uninstall}`);
        unfinished.push({
            what: `${name} could not be uninstalled from Commerce (${uninstall})`,
            leaves: 'its webhooks and event subscriptions in Commerce',
        });
    }
    const wipe = await wipeIfSystem(target, deps);
    if (wipe) {
        deps.logger.warn(`[AppBuilderComponent Runner] ${target.id} records wipe did not finish: ${wipe}`);
        unfinished.push({
            what: `${name}'s records could not be deleted (${wipe})`,
            leaves: `its records in the workspace's database, and they come back if ${name} is added again`,
        });
    }
    return { ...(commerceDetach ? { commerceDetach } : {}), unfinished };
}

/**
 * The words for a removal that stopped: nothing was undeployed, and why.
 *
 * @param unfinished - what did not finish
 * @returns the failed result, with the code the card and the agent act on
 */
export function removalStopped(unfinished: Unfinished[]): {
    success: false;
    error: string;
    code: ErrorCode;
} {
    const reasons = unfinished.map((u) => `${u.what}; removing anyway leaves ${u.leaves}.`).join(' ');
    return {
        success: false,
        error: `Nothing was removed. ${reasons} Remove again to retry, or remove anyway.`,
        code: ErrorCode.COMPONENT_REMOVAL_STOPPED,
    };
}

/**
 * What a forced removal leaves behind, as warnings. The Commerce undo is left
 * out: its result travels as `commerceDetach`, which the handler words itself.
 *
 * @param outcome - the clean-up outcome
 * @returns one sentence per unfinished step
 */
export function leftBehind(outcome: CleanupOutcome): string[] {
    const detachFailed = outcome.commerceDetach?.status === 'failed';
    return outcome.unfinished
        .slice(detachFailed ? 1 : 0)
        .map((u) => `${u.what}; ${u.leaves} stay behind.`);
}

/**
 * Tear down a component's REMOTE artifacts, leaving the local clone and the keyed
 * state alone. A move between destinations never calls this: undeploy is the
 * only irreversible step, and a move leaves the old one serving.
 *
 * @param target - the org context to run under
 * @param componentPath - the component's folder
 * @param kind - mesh or app
 * @param deps - the command runner
 */
export async function teardownRemote(
    target: OrgContextTarget,
    componentPath: string | undefined,
    kind: AppBuilderComponentState['kind'],
    deps: TeardownDeps,
): Promise<void> {
    if (kind === 'mesh') {
        await withOrgContext(target, () =>
            deps.commandManager.execute(MESH_DELETE_COMMAND, {
                cwd: componentPath,
                useNodeVersion: 'auto',
                enhancePath: true,
                streaming: true,
                shell: true,
                timeout: TIMEOUTS.LONG,
            }),
        );
        return;
    }
    // With the namespace key, as deploy has it (see runtimeNamespace.ts), and a
    // refusal is thrown: a silent exit 2 left the ERP pair running on 2026-09-21.
    const result = await withOrgContext(target, async () =>
        runInNamespace(deps, 'aio app undeploy', await runtimeNamespaceEnv(deps), {
            cwd: componentPath,
            streaming: true,
        }),
    );
    if (result.code !== 0) {
        throw new Error(commandFailure('aio app undeploy', result));
    }
}

/**
 * Names safe to interpolate into an `aio runtime` command. Declared names come
 * from config FILES; a name outside the Adobe id charset is never deleted (and
 * never quoted into a shell line).
 */
const RUNTIME_ENTITY_NAME = /^[A-Za-z0-9@._-]+$/;

/**
 * Verify the undeploy actually cleared the namespace, and delete what it left
 * (AB-7). Attribution is exact and conservative: only what the app itself names
 * is a candidate — its declared packages plus the derived isolation package, and
 * the triggers and rules its packages declare. Triggers and rules are checked
 * too because deleting a package does not delete them: on 2026-09-21 the ERP's
 * one-minute timer kept firing at a removed action. Anything else in the
 * namespace is not ours to touch. Best-effort like the rest of teardown, but
 * never SILENT: the summary lands on the result, and an unverifiable namespace
 * says so.
 *
 * @param target - the org context to run under
 * @param id - the component id
 * @param declared - what its config declared
 * @param deps - the command runner and logger
 * @returns what was found and done
 */
export async function verifyRuntimeTeardown(
    target: OrgContextTarget,
    id: string,
    declared: DeclaredRuntime,
    deps: TeardownDeps,
): Promise<RuntimeCleanupSummary> {
    const safe = (names: string[]) => [...new Set(names)].filter((n) => RUNTIME_ENTITY_NAME.test(n));
    const expected: Record<RuntimeEntityKind, string[]> = {
        rule: safe(declared.rules),
        trigger: safe(declared.triggers),
        package: safe([...declared.packages, deriveOwPackage(id)]),
    };
    // The key is fetched once and used for every list and delete. A list that
    // cannot answer THROWS (runtimeNamespace.ts), so it lands here as "not
    // verified" — it used to parse the empty output of a failed list as "nothing
    // deployed" and report the namespace clean.
    const leftovers: Array<[RuntimeEntityKind, string]> = [];
    let env: RuntimeNamespaceEnv;
    try {
        env = await withOrgContext(target, async () => {
            const namespaceEnv = await runtimeNamespaceEnv(deps);
            for (const kind of CLEANUP_ORDER.filter((k) => expected[k].length > 0)) {
                const present = await listRuntimeNames(deps, kind, namespaceEnv);
                leftovers.push(...expected[kind].filter((n) => present.includes(n)).map((n) => [kind, n] as [RuntimeEntityKind, string]));
            }
            return namespaceEnv;
        });
    } catch (error) {
        return {
            verified: false,
            deleted: [],
            failed: [],
            note: `Could not list the Runtime namespace to verify the undeploy: ${toError(error).message}`,
        };
    }

    const deleted: string[] = [];
    const failed: string[] = [];
    for (const [kind, name] of leftovers) {
        try {
            await withOrgContext(target, () => deleteRuntimeEntity(deps, kind, name, env));
            deleted.push(leftoverLabel(kind, name));
        } catch (error) {
            deps.logger.warn(
                `[AppBuilderComponent Runner] leftover ${kind} "${name}" delete failed: ${toError(error).message}`,
            );
            failed.push(leftoverLabel(kind, name));
        }
    }
    if (leftovers.length > 0) {
        const labels = leftovers.map(([kind, name]) => leftoverLabel(kind, name));
        deps.logger.warn(
            `[AppBuilderComponent Runner] undeploy left ${leftovers.length} item(s) running ` +
                `(${labels.join(', ')}); deleted ${deleted.length}, failed ${failed.length}`,
        );
    }
    return { verified: true, deleted, failed };
}

/**
 * One Runtime summary for an integration and the systems removed with it, so a
 * system's leftover package is reported like the integration's own.
 *
 * @param own - the integration's summary
 * @param systems - its systems' merged summary
 * @returns the two as one
 */
export function mergeCleanup(
    own: RuntimeCleanupSummary | undefined,
    systems: RuntimeCleanupSummary | undefined,
): RuntimeCleanupSummary | undefined {
    if (!own || !systems) return own ?? systems;
    const note = [own.note, systems.note].filter(Boolean).join(' ');
    return {
        verified: own.verified && systems.verified,
        deleted: [...own.deleted, ...systems.deleted],
        failed: [...own.failed, ...systems.failed],
        ...(note ? { note } : {}),
    };
}
