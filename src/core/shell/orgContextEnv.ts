/**
 * orgContextEnv (core) — per-invocation Adobe org-context targeting.
 *
 * Lives in core/shell because the command executor consumes it and core must
 * not depend on features. Feature code re-exports these symbols via
 * `@/features/authentication/services/orgContextEnv`.
 *
 * `aio`'s org/project/workspace selection is a single process-global config and
 * the IMS token is identity-scoped. To target a specific org per `aio` child
 * WITHOUT mutating the shared global store (and without ever running the
 * store-mutating `aio console * select`), we set AIO_CONSOLE_* env vars on the
 * child. A live spike confirmed these env vars drive the API to the target
 * org/project/workspace and override even a poisoned persisted `console.org`.
 *
 * Provides:
 * - `buildAioConsoleEnv(target)` — the pure env builder.
 * - `withOrgContext(target, fn)` / `getActiveOrgContext()` — an AsyncLocalStorage
 *   store so the executor can inject targeting onto `aio` commands run anywhere
 *   inside the wrapped callback. ALS (not a mutable module singleton) keeps
 *   concurrent flows isolated — UI and MCP can run in one host without
 *   clobbering each other's active target.
 */

import { AsyncLocalStorage } from 'async_hooks';

/**
 * The org (and optionally project/workspace) an `aio` invocation should target.
 *
 * `orgCode` / `orgName` are optional: callers that only know the org ID (e.g.
 * the dashboard path, where `project.adobe` stores id+name but not code) can
 * still target ID-only. That is a leaky fallback — some consumers deep-merge
 * env over the persisted store, so a stale `org.code`/`org.name` could survive
 * and mis-target. Resolve the full subkeys before targeting whenever possible.
 */
export interface OrgContextTarget {
    orgId: string;
    orgCode?: string;
    orgName?: string;
    projectId?: string;
    projectName?: string;
    workspaceId?: string;
    workspaceName?: string;
}

/**
 * Build the AIO_CONSOLE_* environment variables for the given target.
 *
 * Emits a var only for fields that are present and non-empty. Returns an empty
 * object (safe no-op) when no org target is provided. Never throws on missing
 * optional fields — ID-only org targeting is a valid (if leaky) fallback.
 */
export function buildAioConsoleEnv(target: OrgContextTarget): Record<string, string> {
    const env: Record<string, string> = {};

    if (!target.orgId) {
        return env;
    }

    env.AIO_CONSOLE_ORG_ID = target.orgId;
    if (target.orgCode) env.AIO_CONSOLE_ORG_CODE = target.orgCode;
    if (target.orgName) env.AIO_CONSOLE_ORG_NAME = target.orgName;

    if (target.projectId) env.AIO_CONSOLE_PROJECT_ID = target.projectId;
    if (target.projectName) env.AIO_CONSOLE_PROJECT_NAME = target.projectName;

    if (target.workspaceId) env.AIO_CONSOLE_WORKSPACE_ID = target.workspaceId;
    if (target.workspaceName) env.AIO_CONSOLE_WORKSPACE_NAME = target.workspaceName;

    return env;
}

/** The Adobe identity an org target is built from (project.adobe-like shape). */
export interface ProjectAdobeRef {
    organization?: string;
    projectId?: string;
    workspace?: string;
}

/** The cached org used to enrich a target (Organization-like: id/code/name). */
export interface CachedOrgRef {
    id: string;
    code?: string;
    name?: string;
}

/**
 * Build an {@link OrgContextTarget} from a project's `adobe` identity, enriching
 * org code/name from the cached org ONLY when its id matches (never a stale
 * mismatch). ID-only is an accepted fallback (buildAioConsoleEnv tolerates the
 * missing optional subkeys). This is the single shared builder used by every
 * "deploy/check mesh against the project's known org" call path so they target
 * per-invocation env consistently instead of mutating the shared `aio` global.
 */
export function buildOrgTargetFromProjectAdobe(
    adobe: ProjectAdobeRef | undefined,
    cachedOrg?: CachedOrgRef,
): OrgContextTarget {
    const orgId = adobe?.organization ?? '';
    const matches = !!cachedOrg && cachedOrg.id === orgId;

    return {
        orgId,
        orgCode: matches ? cachedOrg?.code : undefined,
        orgName: matches ? cachedOrg?.name : undefined,
        projectId: adobe?.projectId,
        workspaceId: adobe?.workspace,
    };
}

/**
 * AsyncLocalStorage holding the active org-context target for the current async
 * flow. The command executor reads this to inject AIO_CONSOLE_* env onto `aio`
 * commands. Call paths that aren't wrapped simply get no targeting (today's
 * behavior) — which is safe.
 */
const orgContextStore = new AsyncLocalStorage<OrgContextTarget>();

/**
 * Run `fn` with `target` as the active org context. Every `aio` command issued
 * (directly or transitively) inside `fn` will be targeted at `target`.
 */
export function withOrgContext<T>(target: OrgContextTarget, fn: () => Promise<T>): Promise<T> {
    return orgContextStore.run(target, fn);
}

/**
 * Get the active org-context target for the current async flow, or undefined
 * when no `withOrgContext` wrapper is in effect.
 */
export function getActiveOrgContext(): OrgContextTarget | undefined {
    return orgContextStore.getStore();
}
