/**
 * Bring a project's local storefront copy up to GitHub after an update pushed (EDS-57 step 1).
 *
 * Every EDS project has a git clone of its storefront at the eds-storefront instance's
 * `path`, and the generated AGENTS.md tells agents to edit there. Updates commit through
 * a throwaway clone or GitHub's API and never touch it, so it falls behind: JustRite's
 * was 11 commits behind on 2026-10-20. An agent then edits an old copy, and EDS-57's
 * clash fix would start from one.
 *
 * The rule is that nothing local is ever lost. A local change whose content already
 * equals GitHub's copy is dropped, because GitHub holds it: the extension writes
 * `config.json` both locally and through the API, which is what JustRite's uncommitted
 * change was (measured: byte-for-byte GitHub's). Any other local change, or a local
 * commit GitHub does not have, leaves the copy exactly as it is, with the reason.
 *
 * The fetch names the URL rather than `origin`, so the token is never written into the
 * clone's git config. Nothing here pushes.
 *
 * @module features/updates/services/localStorefrontRefresh
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { COMPONENT_IDS } from '@/core/constants';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { OPERATION_STAGES as S } from '@/core/utils/operationStages';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import { injectTokenIntoUrl } from '@/features/eds/services/github/githubHelpers';
import type { GitStep } from '@/features/updates/services/templateMergeBase';
import type { ItemOutcome } from '@/features/updates/services/updateApplyResult';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import type { Project } from '@/types/base';

export type LocalRefreshOutcome =
    | { kind: 'refreshed'; from: string; to: string }
    | { kind: 'current' }
    /** `reason` names the file, for the log and the agent; `plain` names none, for the SC's row (owner, 2026-10-24). */
    | { kind: 'left'; reason: string; plain?: string };

export interface LocalRefreshRequest {
    /** The local copy's folder. */
    storefrontPath: string;
    /** The storefront repository's fetch URL (token injected by the caller). */
    remoteUrl: string;
    /** The branch the storefront deploys from. */
    branch: string;
}

const left = (reason: string, plain?: string): LocalRefreshOutcome => ({ kind: 'left', reason, ...(plain ? { plain } : {}) });

/** One `git status --porcelain=v1 -z` entry: two status letters and a path. */
interface LocalChange {
    status: string;
    file: string;
}

function parseStatus(output: string): LocalChange[] {
    const entries = output.split('\0').filter(Boolean);
    const changes: LocalChange[] = [];
    for (let i = 0; i < entries.length; i++) {
        const status = entries[i].slice(0, 2);
        changes.push({ status, file: entries[i].slice(3) });
        // A rename or copy carries its old path as the next entry.
        if (status.startsWith('R') || status.startsWith('C')) i++;
    }
    return changes;
}

/**
 * Whether a local change holds exactly what GitHub's copy of the file holds, compared by
 * git's own object id so a binary file compares as reliably as text.
 */
async function matchesGitHub(git: GitStep, change: LocalChange): Promise<boolean> {
    // Only a plain modification or an untracked file can be compared by content.
    if (change.status !== ' M' && change.status !== '??') return false;
    const remote = await git(`git rev-parse "FETCH_HEAD:${change.file}"`, TIMEOUTS.QUICK);
    const local = await git(`git hash-object -- "${change.file}"`, TIMEOUTS.QUICK);
    if (remote.code !== 0 || local.code !== 0) return false;
    return local.stdout.trim() === remote.stdout.trim();
}

/** Drop a local change GitHub already holds, so the fast-forward can write the file. */
async function drop(git: GitStep, storefrontPath: string, change: LocalChange): Promise<boolean> {
    if (change.status === '??') {
        await fsPromises.rm(path.join(storefrontPath, change.file), { force: true });
        return true;
    }
    return (await git(`git checkout -- "${change.file}"`, TIMEOUTS.QUICK)).code === 0;
}

/** Clear every local change GitHub already holds; why not, with and without the file, when one it does not. */
async function clearLocalChanges(git: GitStep, storefrontPath: string): Promise<{ reason: string; plain: string } | undefined> {
    const status = await git('git status --porcelain=v1 -z --untracked-files=all', TIMEOUTS.QUICK);
    if (status.code !== 0) return { reason: 'its git status could not be read', plain: 'its git status could not be read' };
    const changes = parseStatus(status.stdout);
    for (const change of changes) {
        if (!(await matchesGitHub(git, change))) {
            return { reason: `it has a local change GitHub does not have (${change.file})`, plain: 'it has a local change GitHub does not have' };
        }
    }
    for (const change of changes) {
        if (!(await drop(git, storefrontPath, change))) return { reason: `${change.file} could not be reset`, plain: 'a local change could not be reset' };
    }
    return undefined;
}

/**
 * Fast-forward the local copy to GitHub's branch, losing nothing.
 *
 * @param git - runs one git command in the local copy
 * @param request - where the copy is and what it follows
 */
export async function refreshLocalStorefront(
    git: GitStep,
    request: LocalRefreshRequest,
): Promise<LocalRefreshOutcome> {
    const { storefrontPath, remoteUrl, branch } = request;
    const current = await git('git rev-parse --abbrev-ref HEAD', TIMEOUTS.QUICK);
    if (current.code !== 0) return left('it is not a git repository');
    if (current.stdout.trim() !== branch) return left(`it is on ${current.stdout.trim()}, not ${branch}`);

    const fetched = await git(`git fetch --quiet "${remoteUrl}" "${branch}"`, TIMEOUTS.LONG);
    if (fetched.code !== 0) return left('GitHub could not be reached');
    const head = (await git('git rev-parse HEAD', TIMEOUTS.QUICK)).stdout.trim();
    const target = (await git('git rev-parse FETCH_HEAD', TIMEOUTS.QUICK)).stdout.trim();

    const behind = await git(`git merge-base --is-ancestor ${head} ${target}`, TIMEOUTS.QUICK);
    if (behind.code !== 0) return left('it has commits GitHub does not have');

    const unsafe = await clearLocalChanges(git, storefrontPath);
    if (unsafe) return left(unsafe.reason, unsafe.plain);
    if (head === target) return { kind: 'current' };

    const merged = await git(`git merge --ff-only --quiet ${target}`, TIMEOUTS.NORMAL);
    if (merged.code !== 0) return left('the fast-forward failed');
    return { kind: 'refreshed', from: head, to: target };
}

/** The local copy's folder and its GitHub repository, when the project has both. */
function localCopyOf(project: Project): { storefrontPath: string; repo: string } | undefined {
    const instance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const repo = instance?.metadata?.githubRepo;
    if (!instance?.path || typeof repo !== 'string' || !repo.includes('/')) return undefined;
    return { storefrontPath: instance.path, repo };
}

async function hasGitFolder(storefrontPath: string): Promise<boolean> {
    try {
        await fsPromises.access(path.join(storefrontPath, '.git'));
        return true;
    } catch {
        return false;
    }
}

/** A project's local storefront copy, ready to run git in, with its GitHub fetch URL. */
export interface LocalCopy extends LocalRefreshRequest {
    git: GitStep;
}

/**
 * The project's local copy when it exists on disk as a git repository, or undefined.
 *
 * @param token - the SC's GitHub token, injected into the fetch URL only
 */
export async function openLocalCopy(project: Project, ctx: UpdateContext, token: string): Promise<LocalCopy | undefined> {
    const copy = localCopyOf(project);
    if (!copy || !(await hasGitFolder(copy.storefrontPath))) return undefined;
    const git: GitStep = (command, timeout) =>
        ctx.commandManager.execute(command, { cwd: copy.storefrontPath, timeout, shell: DEFAULT_SHELL });
    const remoteUrl = injectTokenIntoUrl(`https://github.com/${copy.repo}.git`, token);
    return { storefrontPath: copy.storefrontPath, remoteUrl, branch: 'main', git };
}

/**
 * After an update pushed, refresh each touched project's local copy. Best effort: a copy
 * that cannot be refreshed is logged with the reason and never fails the update, which has
 * already landed on GitHub. Each copy it refreshes is reported as a stage: it runs after
 * the last update has ended, and a window told nothing looked finished but still running.
 *
 * @param projects - the projects whose storefront an update wrote to (repeats are ignored)
 * @param onProgress - told the stage, and the project, as each copy is refreshed
 * @param onCopy - told as each copy starts and ends, as a step of its own: done when it is
 *   up to GitHub, left alone with why when it was left as it is
 */
export async function refreshLocalStorefronts(
    projects: Project[],
    ctx: UpdateContext,
    onProgress?: (stage: string, item?: string) => void,
    onCopy?: (project: Project, outcome: ItemOutcome) => void,
): Promise<void> {
    const seen = new Set<string>();
    const token = (await getGitHubServices(ctx.secrets).tokenService.getToken())?.token;
    if (!token) return;
    for (const project of projects) {
        const copy = await openLocalCopy(project, ctx, token);
        if (!copy || seen.has(copy.storefrontPath)) continue;
        seen.add(copy.storefrontPath);
        onProgress?.(S.updatingLocalCopy.label, getProjectDisplayName(project));
        onCopy?.(project, { state: 'running' });
        try {
            const outcome = await refreshLocalStorefront(copy.git, copy);
            if (outcome.kind === 'left') {
                ctx.logger.info(`[Updates] Local storefront copy of ${project.name} left as it is: ${outcome.reason}`);
                onCopy?.(project, { state: 'skipped', message: `Left as it is: ${outcome.plain ?? outcome.reason}.` });
                continue;
            }
            if (outcome.kind === 'refreshed') {
                ctx.logger.info(`[Updates] Local storefront copy of ${project.name} brought up to GitHub`);
            }
            onCopy?.(project, { state: 'done' });
        } catch (error) {
            ctx.logger.warn(`[Updates] Could not refresh the local storefront copy of ${project.name}: ${(error as Error).message}`);
            onCopy?.(project, { state: 'skipped', message: 'Not brought up to date — details are in Debug Logs.' });
        }
    }
}
