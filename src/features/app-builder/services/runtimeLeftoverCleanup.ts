/**
 * After an undeploy, find what the app left in its Runtime namespace and delete it, trying
 * until it is gone or every avenue is spent (AB-7, AB-33).
 *
 * `aio app undeploy` exits 0 while leaving deployed packages behind (measured live
 * 2026-08-28), so a removal verifies. And a delete can be refused and then succeed later:
 * removing the ERP pair on 2026-09-26, three recursive package deletes answered "package not
 * empty (409)" while eight others succeeded, and the same shapes rebuilt in a throwaway
 * package deleted cleanly. So what is refused is looked for again after a pause and deleted
 * again, three times, longer each time, before the removal reports it (the owner's rule:
 * a complete cleanup, whatever it takes). Split from `appBuilderComponentTeardown` to keep
 * that file within its size limit.
 *
 * @module features/app-builder/services/runtimeLeftoverCleanup
 */

import { deriveOwPackage } from './owPackageName';
import {
    type RuntimeNamespaceDeps,
    deleteRuntimeEntity,
    listRuntimeNames,
    runtimeNamespaceEnv,
    CLEANUP_ORDER,
    leftoverLabel,
    type DeclaredRuntime,
    type RuntimeEntityKind,
    type RuntimeNamespaceEnv,
} from './runtimeNamespace';
import { withOrgContext, type OrgContextTarget } from '@/core/shell/orgContextEnv';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { sleep } from '@/core/utils/sleep';
import { toError } from '@/types/typeGuards';

/**
 * Names safe to interpolate into an `aio runtime` command. Declared names come
 * from config FILES; a name outside the Adobe id charset is never deleted (and
 * never quoted into a shell line).
 */
const RUNTIME_ENTITY_NAME = /^[A-Za-z0-9@._-]+$/;

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
    /** Leftovers still deployed after every attempt to delete them — these are STILL RUNNING. */
    failed: string[];
    note?: string;
}

/** What the check needs: the namespace runner, and optionally progress and the pause. */
export interface LeftoverCleanupDeps extends RuntimeNamespaceDeps {
    onProgress?: (message: string, subMessage?: string) => void;
    /** How the retries pause; a real sleep when absent, a no-op in tests. */
    wait?: (ms: number) => Promise<void>;
}

/** The pauses before each further attempt at what Runtime refused, longest last. */
const LEFTOVER_RETRY_WAITS_MS: readonly number[] = [10_000, 30_000, 60_000];

type Leftover = [RuntimeEntityKind, string];

/** What the app names, by kind: its declared packages plus its derived one, its timers and rules. */
function expectedEntities(id: string, declared: DeclaredRuntime): Record<RuntimeEntityKind, string[]> {
    const safe = (names: string[]) => [...new Set(names)].filter((n) => RUNTIME_ENTITY_NAME.test(n));
    return {
        rule: safe(declared.rules),
        trigger: safe(declared.triggers),
        package: safe([...declared.packages, deriveOwPackage(id)]),
    };
}

/** Which of `wanted` are deployed now. Throws when the namespace cannot be listed. */
async function present(
    deps: LeftoverCleanupDeps,
    env: RuntimeNamespaceEnv,
    wanted: Record<RuntimeEntityKind, string[]>,
): Promise<Leftover[]> {
    const found: Leftover[] = [];
    for (const kind of CLEANUP_ORDER.filter((k) => wanted[k].length > 0)) {
        const names = await listRuntimeNames(deps, kind, env);
        found.push(...wanted[kind].filter((n) => names.includes(n)).map((n): Leftover => [kind, n]));
    }
    return found;
}

const byKind = (items: Leftover[]): Record<RuntimeEntityKind, string[]> => ({
    rule: items.filter(([k]) => k === 'rule').map(([, n]) => n),
    trigger: items.filter(([k]) => k === 'trigger').map(([, n]) => n),
    package: items.filter(([k]) => k === 'package').map(([, n]) => n),
});

/** Delete each; answer the ones Runtime refused. */
async function deleteEach(
    target: OrgContextTarget,
    items: Leftover[],
    env: RuntimeNamespaceEnv,
    deps: LeftoverCleanupDeps,
    deleted: string[],
): Promise<Leftover[]> {
    const refused: Leftover[] = [];
    for (const [kind, name] of items) {
        try {
            await withOrgContext(target, () => deleteRuntimeEntity(deps, kind, name, env));
            deleted.push(leftoverLabel(kind, name));
        } catch (error) {
            deps.logger.warn(
                `[AppBuilderComponent Runner] leftover ${kind} "${name}" delete failed: ${toError(error).message}`,
            );
            refused.push([kind, name]);
        }
    }
    return refused;
}

/**
 * Pause, look again for what was refused, and delete what is still there, once per pause.
 * Something gone by the time it is looked for again counts as deleted.
 */
async function retryRefused(
    target: OrgContextTarget,
    refused: Leftover[],
    env: RuntimeNamespaceEnv,
    deps: LeftoverCleanupDeps,
    deleted: string[],
): Promise<Leftover[]> {
    const wait = deps.wait ?? sleep;
    let failing = refused;
    for (const pause of LEFTOVER_RETRY_WAITS_MS) {
        if (failing.length === 0) break;
        deps.onProgress?.(
            OPERATION_STAGES.checkingLeftovers.label,
            `Trying again: ${failing.length} item(s) Runtime would not delete yet`,
        );
        await wait(pause);
        const still = await withOrgContext(target, () => present(deps, env, byKind(failing))).catch(() => failing);
        const stillNames = new Set(still.map(([k, n]) => `${k}/${n}`));
        deleted.push(...failing.filter(([k, n]) => !stillNames.has(`${k}/${n}`)).map(([k, n]) => leftoverLabel(k, n)));
        failing = await deleteEach(target, still, env, deps, deleted);
    }
    return failing;
}

/**
 * Verify the undeploy cleared the namespace, and delete what it left. Attribution is exact
 * and conservative: only what the app itself names is a candidate. Triggers and rules are
 * checked too because deleting a package does not delete them (the ERP's one-minute timer
 * kept firing at a removed action on 2026-09-21). Never SILENT: an unlistable namespace is
 * `verified: false`, and what is still deployed after every attempt is `failed`.
 *
 * @param target - the org context to run under
 * @param id - the component id
 * @param declared - what its config declared
 * @param deps - the command runner, logger and (in tests) the pause
 * @returns what was found and done
 */
export async function verifyRuntimeTeardown(
    target: OrgContextTarget,
    id: string,
    declared: DeclaredRuntime,
    deps: LeftoverCleanupDeps,
): Promise<RuntimeCleanupSummary> {
    // The key is fetched once and used for every list and delete. A list that cannot
    // answer THROWS (runtimeNamespace.ts), so it lands here as "not verified" — it used to
    // parse the empty output of a failed list as "nothing deployed" and report it clean.
    let env: RuntimeNamespaceEnv;
    let leftovers: Leftover[];
    try {
        [env, leftovers] = await withOrgContext(target, async () => {
            const namespaceEnv = await runtimeNamespaceEnv(deps);
            return [namespaceEnv, await present(deps, namespaceEnv, expectedEntities(id, declared))] as const;
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
    const refused = await deleteEach(target, leftovers, env, deps, deleted);
    const failed = (await retryRefused(target, refused, env, deps, deleted)).map(([k, n]) => leftoverLabel(k, n));
    if (leftovers.length > 0) {
        deps.logger.warn(
            `[AppBuilderComponent Runner] undeploy left ${leftovers.length} item(s) running ` +
                `(${leftovers.map(([k, n]) => leftoverLabel(k, n)).join(', ')}); ` +
                `deleted ${deleted.length}, failed ${failed.length}`,
        );
    }
    return { verified: true, deleted, failed };
}

/**
 * Why the check could not call the namespace clean, in words for the SC, or undefined when
 * it could. The removal keeps what names the app when there is a reason.
 *
 * @param name - the component's name as the SC knows it
 * @param cleanup - what the check found
 * @returns the reason, or undefined
 */
export function leftoverReason(name: string, cleanup: RuntimeCleanupSummary | undefined): string | undefined {
    const kept = 'Its card, folder and Adobe workspace are kept so nothing is left behind unseen.';
    if (cleanup && !cleanup.verified) {
        return (
            `${name} was undeployed, but its Runtime namespace could not be checked for leftovers ` +
            `(${cleanup.note ?? 'no reason given'}). ${kept} Remove again to check and finish, or remove anyway.`
        );
    }
    if (cleanup && cleanup.failed.length > 0) {
        return (
            `${name} was undeployed, but Runtime still holds ${cleanup.failed.join(', ')} after ` +
            `${LEFTOVER_RETRY_WAITS_MS.length + 1} attempts to delete it. ${kept} Remove again to try ` +
            'again, or remove anyway.'
        );
    }
    return undefined;
}
