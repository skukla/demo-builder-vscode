/**
 * Save a blank-starter app to its own GitHub repository, and undo it (AB-1c).
 *
 * An app the SC built out from the blank starter has, as its `source`, the
 * starter's repository — so an exported project hands the receiver an EMPTY
 * starter. Saving it creates a new public repository in the SC's account, pushes
 * the app's files as one commit, and makes that repository the app's `source`;
 * the export then carries the real app with no other change
 * (`settingsSerializer.deriveAppBuilderComponentSources` reads `source`).
 *
 * `promotion` records that Demo Builder made the repository and where the app
 * came from, which is what lets the undo delete it and put the starter back.
 *
 * The files go up through the GitHub API (`pushFiles`, the zip import's push), not
 * `git`: no token on a command line, and the app's own folder and its git state
 * are never touched — the local app keeps working exactly as before, either way.
 *
 * Dialog-free on purpose: the dashboard handler asks and confirms; an agent's
 * tool would pass its own `confirm` gate. Design:
 * `.rptc/plans/promote-app-to-repo/overview.md`.
 *
 * @module features/app-builder/services/appRepoPromotion
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { promotionVerbOf } from './promotionEligibility';
import { getAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { parseIgnoreRules, type IgnoreRule } from '@/core/utils/gitignoreRules';
import type { GitHubRepoOperations } from '@/features/eds/services/github/githubRepoOperations';
import { pushFiles, type TreePushOps } from '@/features/eds/services/github/githubTreePush';
import { isNeverShipped } from '@/features/eds/services/storefront/neverShippedFiles';
import type { AppBuilderComponentState, Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/** The one commit a saved app's repository starts with (after GitHub's own README commit). */
export const PROMOTE_COMMIT_MESSAGE = 'Add the app from Demo Builder';

/**
 * What an App Builder app never ships, even with no `.gitignore`: `.aio` holds
 * the Adobe project and workspace it deploys to, and build output is rebuilt.
 * Secrets (`.env*`) are the never-shipped list's, which every door shares.
 */
const APP_NEVER_SHIPPED_NAMES = ['.aio'];
const APP_NEVER_SHIPPED_DIRS = ['dist', '.parcel-cache'];

/** The app's files as a repository would hold them, and how many were left out. */
export interface AppFiles {
    /** Repository-relative, `/`-separated path → bytes. */
    files: Map<string, Buffer>;
    leftOut: number;
}

function isLeftOut(relative: string, isDirectory: boolean, rules: IgnoreRule[]): boolean {
    // A directory is tested through a child path, so `dist/` and `notes/*` rules
    // (which match a file's parent folders) prune it before it is read.
    const probe = isDirectory ? `${relative}/.probe` : relative;
    const name = relative.split('/').pop() ?? '';
    if (isDirectory && APP_NEVER_SHIPPED_DIRS.includes(name)) return true;
    if (!isDirectory && APP_NEVER_SHIPPED_NAMES.includes(name)) return true;
    return isNeverShipped(probe) || rules.some((rule) => rule(probe));
}

/** How many files lie under a folder that is left out, so the count the SC reads is honest. */
async function countFiles(dir: string): Promise<number> {
    let total = 0;
    for (const entry of await fsPromises.readdir(dir, { withFileTypes: true })) {
        total += entry.isDirectory() ? await countFiles(path.join(dir, entry.name)) : 1;
    }
    return total;
}

/**
 * Read an app's folder as the files its repository would hold: the app's own
 * `.gitignore`, every secret file, `.git/`, `node_modules/`, `.aio` and build
 * output are left out. Symbolic links are skipped.
 *
 * @param root - The app's folder
 * @returns The files and how many were left out
 */
export async function collectAppFiles(root: string): Promise<AppFiles> {
    const ignoreText = await fsPromises
        .readFile(path.join(root, '.gitignore'), 'utf-8')
        .catch(() => '');
    const rules = parseIgnoreRules(ignoreText);
    const files = new Map<string, Buffer>();
    let leftOut = 0;

    async function walk(dir: string, prefix: string): Promise<void> {
        for (const entry of await fsPromises.readdir(dir, { withFileTypes: true })) {
            const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (isLeftOut(relative, true, rules)) leftOut += await countFiles(full);
                else await walk(full, relative);
            } else if (entry.isFile()) {
                if (isLeftOut(relative, false, rules)) leftOut += 1;
                else files.set(relative, await fsPromises.readFile(full));
            }
        }
    }

    await walk(root, '');
    return { files, leftOut };
}

/**
 * Why this component cannot be saved to a repository, or undefined when it can:
 * the card's rule (`promotionVerbOf`), plus a folder on this computer to read.
 */
export function promotionRefusal(project: Project, id: string): string | undefined {
    const state = getAppBuilderComponent(project, id);
    if (!state) return `No integration "${id}" in this project.`;
    const verb = promotionVerbOf(id, state);
    if ('refusal' in verb) return verb.refusal;
    if (verb.verb === 'undo') {
        return `It is already saved to ${state.source.owner}/${state.source.repo}.`;
    }
    if (!project.componentInstances?.[id]?.path) return 'Its folder on this computer is missing.';
    return undefined;
}

/** Why the undo cannot run, or undefined when it can: only a repository Demo Builder made. */
export function unpromotionRefusal(project: Project, id: string): string | undefined {
    const state = getAppBuilderComponent(project, id);
    if (!state) return `No integration "${id}" in this project.`;
    if (!state.promotion) {
        return 'It was not saved to GitHub by Demo Builder, so there is nothing to undo.';
    }
    return undefined;
}

export interface PromotionDeps {
    repoOps: Pick<
        GitHubRepoOperations,
        'createEmptyRepository' | 'waitForContent' | 'deleteRepository'
    >;
    fileOps: TreePushOps;
    logger: Logger;
    /** ISO timestamp source; injectable for tests. */
    now?: () => string;
}

interface PromotedRepository {
    owner: string;
    repo: string;
    url: string;
    fileCount: number;
}

/** The component, which the refusal check has just proven is there. */
function stateOf(project: Project, id: string): AppBuilderComponentState {
    const state = getAppBuilderComponent(project, id);
    if (!state) throw new Error(`No integration "${id}" in this project.`);
    return state;
}

/**
 * Create the repository, push the files, and record it on the component. The
 * caller saves the project. Nothing is recorded unless the push landed; a push
 * that fails leaves an empty repository, which the error names.
 *
 * @param deps - GitHub operations and a logger
 * @param project - The project; its component is updated in place
 * @param id - The component's id
 * @param opts - The repository's name, the organisation (absent: the SC's own account), the files
 */
export async function promoteApp(
    deps: PromotionDeps,
    project: Project,
    id: string,
    opts: { repoName: string; owner?: string; files: Map<string, Buffer> },
): Promise<PromotedRepository> {
    const refusal = promotionRefusal(project, id);
    if (refusal) throw new Error(refusal);
    if (opts.files.size === 0) throw new Error('The app has no files a repository would keep.');

    const created = await deps.repoOps.createEmptyRepository(opts.repoName, false, opts.owner);
    const [owner, repo] = created.fullName.split('/');
    deps.logger.info(`[Promote] Created ${created.fullName} (public) for ${id}`);
    let fileCount: number;
    try {
        await deps.repoOps.waitForContent(owner, repo);
        ({ fileCount } = await pushFiles(
            deps.fileOps,
            owner,
            repo,
            opts.files,
            PROMOTE_COMMIT_MESSAGE,
            deps.logger,
        ));
    } catch (error) {
        throw new Error(
            `${created.fullName} was created but the files did not reach it: ${(error as Error).message}`,
        );
    }

    const state = stateOf(project, id);
    state.promotion = { from: state.source, at: (deps.now ?? (() => new Date().toISOString()))() };
    state.source = { owner, repo, branch: created.defaultBranch || 'main' };
    deps.logger.info(
        `[Promote] ${id} is now sourced from ${created.fullName} (${fileCount} files)`,
    );
    return { owner, repo, url: created.htmlUrl, fileCount };
}

/**
 * The undo: delete the repository Demo Builder made and put the app's original
 * source back. A repository already gone counts as deleted; any other refusal
 * changes nothing. The local app is untouched. The caller saves the project.
 */
export async function unpromoteApp(
    deps: PromotionDeps,
    project: Project,
    id: string,
): Promise<void> {
    const refusal = unpromotionRefusal(project, id);
    if (refusal) throw new Error(refusal);
    const state = stateOf(project, id);
    const { owner, repo } = state.source;
    try {
        await deps.repoOps.deleteRepository(owner, repo);
        deps.logger.info(`[Promote] Deleted ${owner}/${repo}, saved from ${id}`);
    } catch (error) {
        if ((error as { status?: number }).status !== 404) throw error;
        deps.logger.info(`[Promote] ${owner}/${repo} was already gone`);
    }
    const promotion = state.promotion;
    if (promotion) state.source = promotion.from;
    delete state.promotion;
}
