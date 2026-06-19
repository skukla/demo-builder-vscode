/**
 * App Component Manager — additive add/remove of ONE App Builder app on a LIVE
 * project.
 *
 * Adds a single custom app to an already-created project WITHOUT re-cloning the
 * rest of the project, and removes it cleanly (remote undeploy + local cleanup).
 * A demo workspace holds at most one custom app (singular — see
 * getAppBuilderInstance), so both operations guard on that.
 *
 * REUSE (no plumbing re-implemented here):
 * - ComponentManager.installComponent (git clone+install) / removeComponent (file
 *   delete + instance drop).
 * - withOrgContext / buildOrgTargetFromProjectAdobe for per-invocation Adobe org
 *   targeting — exactly like the mesh reset/deploy callers (projectResetService,
 *   edsResetMeshHelper). The undeploy never mutates the shared `aio` global.
 * - parseGitHubUrl + validateURL for fail-fast public-git-URL validation.
 * - normalizeRepositoryName to derive a safe component id from the repo name.
 */

import { buildOrgTargetFromProjectAdobe, withOrgContext, type CachedOrgRef , CommandExecutor } from '@/core/shell';
import { parseGitHubUrl } from '@/core/utils/githubUrlParser';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { normalizeRepositoryName, validateURL } from '@/core/validation';
import type { ComponentManager } from '@/features/components/services/componentManager';
import type { Project, TransformedComponentDefinition } from '@/types';
import type { Logger } from '@/types/logger';
import { getAppBuilderInstance, toError } from '@/types/typeGuards';

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
        return { error: 'App URL must be a public GitHub repository (https://github.com/owner/repo).' };
    }
    if (!GITHUB_NAME.test(parsed.owner) || !GITHUB_NAME.test(parsed.repo)) {
        return { error: 'App URL must be a public GitHub repository (https://github.com/owner/repo).' };
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
 * Add ONE App Builder app to a live project.
 *
 * Validates the URL, enforces the singular guard, clones+installs via
 * ComponentManager (additive — leaves siblings untouched), records the selection,
 * and persists.
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

    if (getAppBuilderInstance(project)) {
        return {
            success: false,
            error: 'This demo already has an App Builder app. Remove the existing app first.',
        };
    }

    const appId = normalizeRepositoryName(resolved.repo);
    const definition = buildAppDefinition(appId, resolved.cloneUrl);

    const installResult = await deps.componentManager.installComponent(project, definition);
    if (!installResult.success) {
        return { success: false, error: installResult.error || 'App installation failed.' };
    }

    project.componentSelections = project.componentSelections ?? {};
    project.componentSelections.appBuilder = [appId];

    await deps.saveProject(project);
    deps.logger.info(`[App Builder] Added app "${appId}" from ${resolved.cloneUrl}`);

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
        const result = await withOrgContext(target, () =>
            deps.commandManager.execute('aio app undeploy', {
                cwd: appPath,
                useNodeVersion: 'auto',
                enhancePath: true,
                streaming: true,
                shell: true,
                timeout: TIMEOUTS.LONG,
            }),
        );
        if (result.code !== 0) {
            const detail = result.stderr?.trim() || result.stdout?.trim() ||
                `aio app undeploy exited with code ${result.code}`;
            return `App undeploy reported a problem: ${detail}`;
        }
        return undefined;
    } catch (error) {
        return `App undeploy failed: ${toError(error).message}`;
    }
}

/**
 * Remove the project's App Builder app: remote undeploy (best-effort, org-context
 * targeted), local file+instance cleanup, and state/selection clearing.
 */
export async function removeAppComponent(
    project: Project,
    deps: AppComponentManagerDeps,
): Promise<RemoveAppResult> {
    const app = getAppBuilderInstance(project);
    if (!app) {
        return { success: true };
    }

    const undeployWarning = app.path
        ? await undeployApp(project, app.path, deps)
        : undefined;
    if (undeployWarning) {
        deps.logger.warn(`[App Builder] ${undeployWarning}`);
    }

    await deps.componentManager.removeComponent(project, app.id, true);

    project.appState = undefined;
    project.appStatusSummary = undefined;
    if (project.componentSelections?.appBuilder) {
        project.componentSelections.appBuilder =
            project.componentSelections.appBuilder.filter((id) => id !== app.id);
    }

    await deps.saveProject(project);
    deps.logger.info(`[App Builder] Removed app "${app.id}"`);

    return { success: true, undeployWarning };
}
