/**
 * Which deployed integrations (and their bound systems) have newer code.
 *
 * Three signals, any one is enough:
 * - the source branch on GitHub has commits the clone lacks (a fetch, which
 *   changes nothing the SC can see);
 * - the clone is at a commit the last good deploy did not ship
 *   (`deployedCommit`): an update moved it and its deploy failed (AB-71), so the
 *   badge stays on until the new code is live. Update reads the same rule;
 * - the clone's app version differs from the one installed in Commerce (code
 *   that reached the folder some other way and was never deployed).
 *
 * The answer is recorded on `appBuilderComponents[id].updateAvailable`, where
 * the card and `get_project` read it. A check git could not finish leaves the
 * previous answer in place rather than guessing.
 *
 * @module features/app-builder/services/integrationUpdateCheck
 */

import type { UpdateCheckResult } from './integrationSourceUpdate';
import { clearUpdateAvailable, runsOlderCode } from '@/core/state/appBuilderComponentState';
import type { AppBuilderComponentState, Project } from '@/types/base';

export interface UpdateCheckDeps {
    checkClone: (componentPath: string, branch: string) => Promise<UpdateCheckResult>;
    readAppVersion?: (componentPath: string) => Promise<string | undefined>;
    /** ISO timestamp source; injectable for tests. */
    now?: () => string;
}

export interface IntegrationUpdateReport {
    id: string;
    available: boolean;
    /** Why the check could not finish, when it could not. */
    detail?: string;
}

export interface IntegrationUpdateCheck {
    reports: IntegrationUpdateReport[];
    /** Whether any recorded answer changed (the caller saves only then). */
    changed: boolean;
}

type UpdateAvailable = NonNullable<AppBuilderComponentState['updateAvailable']>;

/** Deployed integrations and systems that have a clone to compare. */
function candidates(project: Project): Array<{ id: string; state: AppBuilderComponentState; path: string }> {
    return Object.entries(project.appBuilderComponents ?? {}).flatMap(([id, state]) => {
        const path = project.componentInstances?.[id]?.path;
        const eligible = state.kind !== 'mesh' && state.status === 'deployed' && Boolean(path);
        return eligible && path ? [{ id, state, path }] : [];
    });
}

/** The clone's version, when it differs from the one Commerce has installed. */
async function versionAhead(
    state: AppBuilderComponentState,
    path: string,
    deps: UpdateCheckDeps,
): Promise<string | undefined> {
    const installed = state.installation?.version;
    if (!installed || !deps.readAppVersion) return undefined;
    const onDisk = await deps.readAppVersion(path);
    return onDisk && onDisk !== installed ? onDisk : undefined;
}

function sameAnswer(a: UpdateAvailable | undefined, b: UpdateAvailable | undefined): boolean {
    return a?.commit === b?.commit && a?.version === b?.version && Boolean(a) === Boolean(b);
}

async function checkOne(
    id: string,
    state: AppBuilderComponentState,
    path: string,
    deps: UpdateCheckDeps,
): Promise<{ report: IntegrationUpdateReport; changed: boolean }> {
    const [clone, version] = await Promise.all([
        deps.checkClone(path, state.source.branch ?? 'main'),
        versionAhead(state, path, deps),
    ]);
    if (clone.status === 'unknown' && !version) {
        return { report: { id, available: Boolean(state.updateAvailable), detail: clone.detail }, changed: false };
    }
    const commit = newerCommit(clone, state);
    const next: UpdateAvailable | undefined =
        commit || version
            ? {
                  ...(commit ? { commit } : {}),
                  ...(version ? { version } : {}),
                  checkedAt: (deps.now ?? (() => new Date().toISOString()))(),
              }
            : undefined;
    const changed = !sameAnswer(state.updateAvailable, next);
    if (changed) {
        setUpdateAvailable(state, next);
    }
    return { report: { id, available: Boolean(next) }, changed };
}

/** The commit an update would put live: the branch head, or a fetched commit never deployed. */
function newerCommit(clone: UpdateCheckResult, state: AppBuilderComponentState): string | undefined {
    if (clone.status === 'available') return clone.to;
    return runsOlderCode(state.deployedCommit, clone.from) ? clone.from : undefined;
}

function setUpdateAvailable(state: AppBuilderComponentState, value: UpdateAvailable | undefined): void {
    if (value) {
        state.updateAvailable = value;
    } else {
        clearUpdateAvailable(state);
    }
}

/**
 * Check every deployed integration and system in `project`, in parallel, and
 * record the answers on it.
 */
export async function checkIntegrationUpdates(
    project: Project,
    deps: UpdateCheckDeps,
): Promise<IntegrationUpdateCheck> {
    const results = await Promise.all(
        candidates(project).map(({ id, state, path }) => checkOne(id, state, path, deps)),
    );
    return {
        reports: results.map((result) => result.report),
        changed: results.some((result) => result.changed),
    };
}
