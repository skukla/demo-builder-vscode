/**
 * Releasing the Adobe workspaces a removal leaves unused, and confirming Adobe really
 * deletes what was in them.
 *
 * Deleting a workspace deletes its Runtime namespace, and with it any code Runtime refused
 * to delete — but not at once. Measured on Bodea on 2026-09-27: the deleted workspace's own
 * key kept working for ten minutes, and answered 401 "the supplied authentication is
 * invalid" at eleven. So the key is read BEFORE the delete, kept only in memory, and asked
 * again in the background until Runtime refuses it; if it still answers after twenty
 * minutes, the SC is told.
 *
 * The decision and the delete itself (`workspaceTakesLeftovers`, `releaseWorkspaces`) live
 * in `componentWorkspace.ts`, which the runner already imports; this module is the key read
 * and the watch, wired in by the runner's deps.
 *
 * @module features/app-builder/services/componentWorkspaceRelease
 */

import type { WorkspaceReleaseDeps } from './componentWorkspace';
import {
    runInNamespace,
    runtimeNamespaceEnv,
    type RuntimeNamespaceDeps,
    type RuntimeNamespaceEnv,
} from './runtimeNamespace';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell/orgContextEnv';
import { sleep } from '@/core/utils/sleep';
import { forgetCredential, type CredentialStore } from '@/features/ai/server/savedRestCredential';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { toError } from '@/types/typeGuards';

type Workspace = NonNullable<AppBuilderComponentState['workspace']>;

/** How often the deleted namespace's key is asked again. */
const NAMESPACE_WATCH_INTERVAL_MS = 60_000;
/** How long before a namespace still answering is reported: twice the measured 11 minutes. */
const NAMESPACE_WATCH_LIMIT_MS = 20 * 60_000;

/** Runtime refusing a key whose namespace is gone (measured wording, 2026-09-27). */
const KEY_REFUSED = /authentication is invalid|401/iu;


/** A workspace's Runtime key, read under its own org context. Undefined when it cannot be read. */
export async function readNamespaceKey(
    deps: RuntimeNamespaceDeps,
    project: Project,
    workspace: Workspace,
): Promise<RuntimeNamespaceEnv | undefined> {
    const target = { ...buildOrgTargetFromProjectAdobe(project.adobe), workspaceId: workspace.id };
    return withOrgContext(target, () => runtimeNamespaceEnv(deps)).catch((error: unknown) => {
        deps.logger.warn(
            `[Runtime] Could not read the ${workspace.name} key: ${toError(error).message}`,
        );
        return undefined;
    });
}

/** What watching needs beyond the namespace runner: the pause and its limits, for tests. */
export interface NamespaceWatchOptions {
    wait?: (ms: number) => Promise<void>;
    intervalMs?: number;
    limitMs?: number;
}

/**
 * Ask a deleted workspace's key until Runtime refuses it. Answers `gone` on the refusal,
 * or `still-there` once the limit passes with the key still answering.
 */
export async function watchNamespaceRemoval(
    deps: RuntimeNamespaceDeps,
    key: RuntimeNamespaceEnv,
    options: NamespaceWatchOptions = {},
): Promise<'gone' | 'still-there'> {
    const wait = options.wait ?? sleep;
    const interval = options.intervalMs ?? NAMESPACE_WATCH_INTERVAL_MS;
    const limit = options.limitMs ?? NAMESPACE_WATCH_LIMIT_MS;
    for (let waited = 0; waited <= limit; waited += interval) {
        const result = await runInNamespace(deps, 'aio runtime namespace list --json', key);
        if (result.code !== 0 && KEY_REFUSED.test(`${result.stderr}\n${result.stdout}`))
            return 'gone';

        await wait(interval);
    }
    return 'still-there';
}

/**
 * The key read, background watch and credential cleanup a removal is wired with. The watch
 * reports only its end: a line in the log when the namespace is gone, `warn` (a
 * notification) when it is not. A deleted workspace's kept Commerce REST credential
 * (`savedRestCredential`) is deleted with it: nothing can sign with it again (PL-64).
 */
export function buildWorkspaceReleaseDeps(
    deps: RuntimeNamespaceDeps & { secrets?: Pick<CredentialStore, 'delete'> },
    warn: (message: string) => void,
): Pick<
    WorkspaceReleaseDeps,
    'namespaceKeyOf' | 'watchNamespaceRemoval' | 'forgetWorkspaceCredential'
> {
    return {
        forgetWorkspaceCredential: (workspaceId) => forgetCredential(deps.secrets, workspaceId),
        namespaceKeyOf: (project, workspace) => readNamespaceKey(deps, project, workspace),
        watchNamespaceRemoval: (key, label) => {
            void watchNamespaceRemoval(deps, key).then((outcome) => {
                if (outcome === 'gone') {
                    deps.logger.info(
                        `[Runtime] ${label}: Adobe finished deleting its Runtime namespace.`,
                    );
                    return;
                }
                warn(
                    `Adobe has not finished deleting the ${label} workspace's Runtime space ` +
                        'after 20 minutes, ' +
                        'so anything left in it may still run. It usually takes about 11 minutes.',
                );
            });
        },
    };
}
