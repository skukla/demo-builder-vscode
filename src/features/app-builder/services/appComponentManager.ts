/**
 * App Component Manager — additive add / per-id remove of custom App Builder
 * integrations on a LIVE project (URL-based add door).
 *
 * Adds a custom integration to an already-created project WITHOUT re-cloning the
 * rest of the project, and removes ONE integration cleanly by id (remote
 * undeploy + local cleanup) leaving siblings untouched. N integrations coexist
 * (ADR-011 D3 Step 05 dropped the one-app guard): each is keyed in
 * `project.appBuilderComponents` and appended to `componentSelections.appBuilder`.
 *
 * REUSE (no plumbing re-implemented here):
 * - ComponentManager.installComponent (git clone+install) / removeComponent (file
 *   delete + instance drop) — the same install path the keyed runner uses.
 * - resolveKeyedComponentId so remove clears the SAME keyed entry a deploy
 *   outcome would have written (legacy-twin resolution).
 * - withOrgContext / buildOrgTargetFromProjectAdobe for per-invocation Adobe org
 *   targeting — exactly like the mesh reset/deploy callers (projectResetService,
 *   edsResetMeshHelper). The undeploy never mutates the shared `aio` global.
 * - parseGitHubUrl + validateURL for fail-fast public-git-URL validation.
 * - normalizeRepositoryName to derive a safe component id from the repo name.
 */

import { resolveKeyedComponentId } from './appBuilderDeployOutcome';
import { extractAioErrorDetail, fetchRuntimeCredentials } from './runtimeCredentials';
import {
    buildOrgTargetFromProjectAdobe,
    withOrgContext,
    type CachedOrgRef,
    CommandExecutor,
} from '@/core/shell';
import { parseGitHubUrl } from '@/core/utils/githubUrlParser';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { normalizeRepositoryName, validateURL } from '@/core/validation';
import type { ComponentManager } from '@/features/components/services/componentManager';
import type { Project, TransformedComponentDefinition } from '@/types';
import type { Logger } from '@/types/logger';
import { toError } from '@/types/typeGuards';

/** Dependencies for app add/remove. Mirrors the codebase's explicit-deps shape. */
export interface AppComponentManagerDeps {
    componentManager: ComponentManager;
    commandManager: CommandExecutor;
    logger: Logger;
    saveProject: (project: Project) => Promise<void>;
    /** Cached Adobe org, used to enrich the org-context target (id-match only). */
    getCachedOrganization: () => CachedOrgRef | undefined;
}

export interface AddAppResult {
    success: boolean;
    appId?: string;
    error?: string;
}

export interface RemoveAppResult {
    success: boolean;
    /** Surfaced when remote undeploy failed but local cleanup still completed. */
    undeployWarning?: string;
    error?: string;
}

/**
 * GitHub owner/repo segments are restricted to this alphabet. The resolved
 * owner/repo are interpolated into a shell-executed `git clone`, so anything
 * outside this set (shell metacharacters, whitespace, `$()`, backticks, `;`) is
 * rejected fail-fast rather than canonicalized.
 */
const GITHUB_NAME = /^[A-Za-z0-9._-]+$/;

/**
 * Resolve a public GitHub repo from a URL into a CANONICAL clone URL, or return
 * an error string. Fail-fast: rejects SSH/`git@`, non-https, private/localhost
 * (SSRF), garbage, non-github hosts, and any owner/repo carrying shell
 * metacharacters. The returned `cloneUrl` is reconstructed from the validated
 * owner/repo (never the raw input), so embedded credentials/userinfo and stray
 * path segments are dropped.
 */
function resolvePublicRepo(
    gitUrl: string,
): { owner: string; repo: string; cloneUrl: string } | { error: string } {
    try {
        validateURL(gitUrl, ['https']); // throws on non-https / SSRF / garbage
    } catch (error) {
        return { error: `Invalid app URL: ${toError(error).message}` };
    }

    const parsed = parseGitHubUrl(gitUrl);
    if (!parsed) {
        return {
            error: 'App URL must be a public GitHub repository (https://github.com/owner/repo).',
        };
    }
    if (!GITHUB_NAME.test(parsed.owner) || !GITHUB_NAME.test(parsed.repo)) {
        return {
            error: 'App URL must be a public GitHub repository (https://github.com/owner/repo).',
        };
    }
    return {
        owner: parsed.owner,
        repo: parsed.repo,
        cloneUrl: `https://github.com/${parsed.owner}/${parsed.repo}.git`,
    };
}

/** Build a runtime git ComponentDefinition for the app from its clone URL + id. */
function buildAppDefinition(appId: string, cloneUrl: string): TransformedComponentDefinition {
    return {
        id: appId,
        name: appId,
        type: 'app-builder',
        subType: 'app',
        source: { type: 'git', url: cloneUrl, branch: 'main' },
        configuration: {
            // Node version is intentionally omitted — deploy resolves it via 'auto'.
            requiresDeployment: true,
            deploymentTarget: 'adobe-io',
        },
    } as TransformedComponentDefinition;
}

/**
 * Key the newly added integration in `appBuilderComponents` (with its source —
 * durable provenance) and APPEND its id to the appBuilder selection. Never
 * overwrites siblings: N integrations coexist (ADR-011 D3 Step 05).
 */
function recordAddedIntegration(
    project: Project,
    appId: string,
    source: { owner: string; repo: string },
): void {
    project.appBuilderComponents = {
        ...(project.appBuilderComponents ?? {}),
        [appId]: { kind: 'integration', status: 'not-deployed', source },
    };
    project.componentSelections = project.componentSelections ?? {};
    const current = project.componentSelections.appBuilder ?? [];
    project.componentSelections.appBuilder = current.includes(appId)
        ? current
        : [...current, appId];
}

/**
 * Add a custom App Builder integration to a live project.
 *
 * Validates the URL, rejects a duplicate id fail-fast (same repo added twice
 * would silently overwrite the existing folder), clones+installs via
 * ComponentManager (additive — leaves siblings untouched), keys the new entry,
 * appends the selection, and persists.
 */
export async function addAppComponent(
    project: Project,
    gitUrl: string,
    deps: AppComponentManagerDeps,
): Promise<AddAppResult> {
    const resolved = resolvePublicRepo(gitUrl);
    if ('error' in resolved) {
        return { success: false, error: resolved.error };
    }

    const appId = normalizeRepositoryName(resolved.repo);
    if (project.componentInstances?.[appId]) {
        return {
            success: false,
            error: `This demo already has an integration named "${appId}".`,
        };
    }

    const definition = buildAppDefinition(appId, resolved.cloneUrl);

    const installResult = await deps.componentManager.installComponent(project, definition);
    if (!installResult.success) {
        return { success: false, error: installResult.error || 'App installation failed.' };
    }

    recordAddedIntegration(project, appId, { owner: resolved.owner, repo: resolved.repo });

    await deps.saveProject(project);
    deps.logger.info(`[App Builder] Added integration "${appId}" from ${resolved.cloneUrl}`);

    return { success: true, appId };
}

/**
 * Undeploy the app remotely under org-context targeting. Tolerates a non-zero or
 * throwing undeploy — returns a warning string instead of throwing, so a failed
 * undeploy never strands local state.
 */
async function undeployApp(
    project: Project,
    appPath: string,
    deps: AppComponentManagerDeps,
): Promise<string | undefined> {
    const target = buildOrgTargetFromProjectAdobe(project.adobe, deps.getCachedOrganization());
    try {
        const result = await withOrgContext(target, async () => {
            // Same Runtime-credential contract as the deploy: catalog repos
            // ship no .env, so without these the undeploy always fails with
            // "missing Adobe I/O Runtime namespace".
            const creds = await fetchRuntimeCredentials(deps.commandManager, deps.logger, 'auto');
            return deps.commandManager.execute('aio app undeploy', {
                cwd: appPath,
                useNodeVersion: 'auto',
                enhancePath: true,
                streaming: true,
                shell: true,
                timeout: TIMEOUTS.LONG,
                env: { AIO_RUNTIME_NAMESPACE: creds.namespace, AIO_RUNTIME_AUTH: creds.auth },
            });
        });
        if (result.code !== 0) {
            const detail =
                extractAioErrorDetail(result.stderr) ||
                result.stderr?.trim() ||
                result.stdout?.trim() ||
                `aio app undeploy exited with code ${result.code}`;
            return `App undeploy reported a problem: ${detail}`;
        }
        return undefined;
    } catch (error) {
        return `App undeploy failed: ${toError(error).message}`;
    }
}

/**
 * Clear ONE integration's local state: its keyed entry (resolved so a legacy
 * migrated twin under 'app'/appId is cleared, not stranded), its selection id,
 * and — only when NO integration remains — the singular `appState`/
 * `appStatusSummary` (transitional; the singular fields retire in D3 Step 07).
 */
function clearIntegrationState(project: Project, appId: string, keyedId: string): void {
    if (project.appBuilderComponents) {
        delete project.appBuilderComponents[keyedId];
    }
    if (project.componentSelections?.appBuilder) {
        project.componentSelections.appBuilder = project.componentSelections.appBuilder.filter(
            (id) => id !== appId,
        );
    }
    const integrationsRemain = Object.values(project.appBuilderComponents ?? {}).some(
        (state) => state.kind === 'integration',
    );
    if (!integrationsRemain) {
        project.appState = undefined;
        project.appStatusSummary = undefined;
    }
}

/**
 * Remove ONE App Builder integration by id: remote undeploy (best-effort,
 * org-context targeted — prunes only its own isolated package), local
 * file+instance cleanup, and per-id state/selection clearing. Siblings are
 * untouched. Idempotent: an id with no instance and no keyed entry is a no-op
 * success.
 */
export async function removeAppComponent(
    project: Project,
    appId: string,
    deps: AppComponentManagerDeps,
): Promise<RemoveAppResult> {
    const instance = project.componentInstances?.[appId];
    // The legacy-twin resolution (an entry migrated under 'app'/appId) applies
    // only when the removed INSTANCE exists — an unknown id must never
    // cross-delete a sibling's keyed entry.
    const keyedId = instance ? resolveKeyedComponentId(project, 'integration', appId) : appId;
    if (!instance && !project.appBuilderComponents?.[keyedId]) {
        return { success: true };
    }

    const undeployWarning = instance?.path
        ? await undeployApp(project, instance.path, deps)
        : undefined;
    if (undeployWarning) {
        deps.logger.warn(`[App Builder] ${undeployWarning}`);
    }

    if (instance) {
        await deps.componentManager.removeComponent(project, appId, true);
    }

    clearIntegrationState(project, appId, keyedId);

    await deps.saveProject(project);
    deps.logger.info(`[App Builder] Removed integration "${appId}"`);

    return { success: true, undeployWarning };
}
