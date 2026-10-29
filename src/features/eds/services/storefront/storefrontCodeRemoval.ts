/**
 * storefrontCodeRemoval — deleting a storefront's repository AND AEM's copy of its code.
 *
 * AEM keeps its own copy of a site's code (the "code bus"), and deleting the GitHub
 * repository does not clear it. Found walking release row 7.4 (EDS-67, 2026-10-28):
 * after skukla/scratch-1022-b was deleted with every box ticked, every page answered
 * 404 and `https://main--scratch-1022-b--skukla.aem.live/scripts/aem.js` still answered
 * 200. Something Demo Builder made was left behind, against the first property this
 * extension holds: whatever can be done can be undone.
 *
 * The Admin API removes code ONE file at a time (`DELETE /code/{owner}/{repo}/{ref}/{path}`;
 * aem.live/docs/admin.html documents no wildcard for it), so the files have to be
 * known, and once the repository is gone nothing can list them. Hence the order:
 *
 *   1. list the repository's files, while it still exists;
 *   2. delete the repository (the caller's own delete, handed in), only once the DA.live
 *      sign-in step 3 needs is known to work;
 *   3. delete each file from the code bus, a few at a time;
 *   4. ask aem.live for `scripts/aem.js`, past the CDN cache, and say whether it answers.
 *
 * Why 3 follows 2: measured 2026-10-28, a DELETE with the DA.live IMS Bearer AFTER the
 * repository was gone answered 204 and the live URL then answered 404, while an
 * untouched sibling still answered 200. Whether the same DELETE is refused while the
 * file still exists in GitHub is UNKNOWN, so it is not tried that way.
 *
 * **No working DA.live sign-in, no repository delete** (owner, 2026-10-28). Step 3 needs
 * the DA.live sign-in, and once the repository is gone its files can never be listed
 * again, so a storefront's code deleted without a working sign-in could never be removed.
 * So before step 2 the sign-in is put to IMS (`daLiveSignInCheck`): no token, a token IMS
 * refuses, or IMS not answering keeps the repository (`kept`), and the SC is told to sign
 * in to DA.live and delete again. The same day a forced Adobe sign-in had cancelled the
 * DA.live token with 23 hours left, so a token being present proves nothing.
 *
 * Every door that deletes a storefront's repository comes through
 * {@link deleteStorefrontRepository}, so the doors cannot drift (pinned in
 * `tests/templates/spine-chokepoints.test.ts`). A repository with no `scripts/aem.js`
 * is not a storefront, and its code is not touched: Manage GitHub Repositories and the
 * agent's `delete_github_repo` delete repositories of any kind.
 *
 * @module features/eds/services/storefront/storefrontCodeRemoval
 */

import { checkLiveStatus } from './liveStatusCheck';
import { aemLiveBaseUrl } from './storefrontProbe';
import type { DaLiveTokenProvider } from './storefrontTeardown';
import type { LiveStatusCheck } from './storefrontUnpublish';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { runInBatches } from '@/core/utils/promiseUtils';
import { askImsAboutDaLiveToken, type ImsTokenVerdict } from '@/features/eds/services/daLive/daLiveSignInCheck';
import { HelixService } from '@/features/eds/services/helix/helixService';
import type { Logger } from '@/types/logger';

/** The branch a storefront serves from, and the one aem.live's `main--` host reads. */
const BRANCH = 'main';

/** Every storefront template has it; the live check asks for it, and its absence means "not a storefront". */
const PROBE_FILE = 'scripts/aem.js';

/** How many code files are deleted at once: modest, the Admin API rate-limits. */
const CONCURRENCY = 4;

/** The one Helix call the removal makes. */
export interface CodeRemovalHelix {
    deleteCode(org: string, site: string, path: string, branch?: string): Promise<void>;
}

/** How the repository's files are read before it is deleted (`GitHubFileOperations`). */
export interface RepoFileLister {
    listRepoFiles(owner: string, repo: string, branch?: string): Promise<Array<{ path: string }>>;
}

/** What happened to AEM's copy of the code. */
export interface CodeRemovalResult {
    /** How many files were deleted from the code bus (a file already gone counts). */
    removed: number;
    /** The files the code bus kept, each with why. */
    failed: Array<{ path: string; reason: string }>;
    /**
     * Whether aem.live still serves `scripts/aem.js` afterwards; `unknown` when it did
     * not answer. FALSE is the only answer that means the code is gone.
     */
    stillServing: boolean | 'unknown';
    /** One sentence for the SC, set whenever anything may be left. */
    summary?: string;
}

export interface StorefrontRepoDeletion {
    /** What happened to the site's code; undefined when the repository was not a storefront. */
    code?: CodeRemovalResult;
    /**
     * Set when the repository was NOT deleted, because there was no working DA.live
     * sign-in to remove its site code with: the SC's sentence. Nothing was changed.
     */
    kept?: string;
}

export interface StorefrontRepoDeletionDeps {
    /** Reads the repository's files; called BEFORE the repository is deleted. */
    files: RepoFileLister;
    /** Deletes the repository. What it throws, {@link deleteStorefrontRepository} throws. */
    deleteRepository: (owner: string, repo: string) => Promise<void>;
    /**
     * The DA.live sign-in the code bus DELETE is made with (`tryCreateDaLiveTokenProvider`);
     * null or undefined when there is none, and then a storefront's repository is kept
     * (`kept`) so its code can still be removed later.
     */
    tokenProvider?: { getAccessToken(): Promise<string | null | undefined> } | null;
    logger: Logger;
    /** Injectable for tests; defaults to the real Helix service. */
    makeHelix?: (logger: Logger, tokenProvider: DaLiveTokenProvider) => CodeRemovalHelix;
    /** The status of a URL on aem.live; defaults to a GET. */
    checkLive?: LiveStatusCheck;
    /** Whether IMS accepts the DA.live token; defaults to IMS's validate_token. */
    checkSignIn?: (token: string) => Promise<ImsTokenVerdict>;
    /** The step as it starts, for a caller narrating progress. */
    onStep?: (step: string) => void;
}

/** Why a storefront's repository was kept (owner's words, 2026-10-28). */
export const KEPT_FOR_SITE_CODE =
    'The repository was kept so its site code can still be removed. Sign in to DA.live and delete again.';
/** The same, when IMS could not be asked whether the sign-in works. */
export const KEPT_SIGN_IN_UNCHECKED =
    'The repository was kept so its site code can still be removed: the DA.live sign-in could ' +
    'not be checked. Delete again in a moment.';
/** Why the code was not removed, when nothing was attempted. */
const NOT_LISTED =
    "The site's code could not be removed from aem.live: its files could not be listed " +
    'before the repository was deleted.';

/** The token, or null when there is none or reading it failed. */
async function usableToken(tokenProvider: StorefrontRepoDeletionDeps['tokenProvider']): Promise<string | null> {
    try {
        return (await tokenProvider?.getAccessToken()) ?? null;
    } catch {
        return null;
    }
}

/** The repository's files as code-bus paths, or an Error when they could not be read. */
async function listCodePaths(
    owner: string,
    repo: string,
    deps: StorefrontRepoDeletionDeps,
): Promise<string[] | Error> {
    try {
        const files = await deps.files.listRepoFiles(owner, repo, BRANCH);
        return files.map((file) => `/${file.path.replace(/^\/+/, '')}`);
    } catch (error) {
        deps.logger.warn(`[Code Removal] Could not list ${owner}/${repo}: ${(error as Error).message}`);
        return error instanceof Error ? error : new Error(String(error));
    }
}

/** Whether aem.live still serves the probe file, asked past the CDN cache. */
async function stillServes(owner: string, repo: string, checkLive: LiveStatusCheck): Promise<boolean | 'unknown'> {
    const status = await checkLive(`${aemLiveBaseUrl(owner, repo)}/${PROBE_FILE}?ck=${Date.now()}`);
    if (status === 404) return false;
    if (status >= 200 && status < 400) return true;
    return 'unknown';
}

/** The SC's sentence for a removal that ran; undefined when nothing is left. */
function removalSummary(total: number, failed: number, stillServing: boolean | 'unknown'): string | undefined {
    if (failed > 0) {
        return (
            `${failed} of the site's ${total} code files could not be removed from aem.live, ` +
            'so some of its code may still be served there.'
        );
    }
    if (stillServing === true) {
        return `The site's code was removed from aem.live, but aem.live still serves its ${PROBE_FILE}.`;
    }
    if (stillServing === 'unknown') {
        return "The site's code was removed from aem.live, but whether aem.live still serves it could not be checked.";
    }
    return undefined;
}

/** Delete each path from the code bus, a few at a time; never throws. */
async function removeCodePaths(
    owner: string,
    repo: string,
    paths: string[],
    helix: CodeRemovalHelix,
    logger: Logger,
): Promise<Array<{ path: string; reason: string }>> {
    const outcomes = await runInBatches(paths, CONCURRENCY, async (path) => {
        try {
            await helix.deleteCode(owner, repo, path, BRANCH);
            return undefined;
        } catch (failure) {
            const reason = failure instanceof Error ? failure.message : String(failure);
            logger.warn(`[Code Removal] ${owner}/${repo}${path} was not removed: ${reason}`);
            return { path, reason };
        }
    });
    return outcomes.filter((outcome): outcome is { path: string; reason: string } => outcome !== undefined);
}

/** Why a storefront's repository must be kept, or undefined when the sign-in works. */
async function keepReason(deps: StorefrontRepoDeletionDeps): Promise<string | undefined> {
    const token = await usableToken(deps.tokenProvider);
    if (!token) return KEPT_FOR_SITE_CODE;
    const verdict = await (deps.checkSignIn ?? askImsAboutDaLiveToken)(token);
    if (verdict === 'valid') return undefined;
    return verdict === 'refused' ? KEPT_FOR_SITE_CODE : KEPT_SIGN_IN_UNCHECKED;
}

/**
 * Delete a storefront's repository, then AEM's copy of its code, in the order the
 * module docstring gives.
 *
 * Throws only what the repository delete throws, and then nothing else has run: the
 * repository is still there, so its code is left alone. A storefront with no working
 * DA.live sign-in is not deleted at all (`kept`). Everything after the delete reports
 * in the result instead: an unreadable file list still deletes the repository, and
 * says the code was not removed.
 *
 * @param target - the repository, `owner` and `repo`
 * @param deps - how to list, delete and remove; see {@link StorefrontRepoDeletionDeps}
 * @returns what happened to the code (`code` undefined when it was not a storefront),
 *   or why the repository was kept
 */
export async function deleteStorefrontRepository(
    target: { owner: string; repo: string },
    deps: StorefrontRepoDeletionDeps,
): Promise<StorefrontRepoDeletion> {
    const { owner, repo } = target;
    const { logger } = deps;
    const paths = await listCodePaths(owner, repo, deps);
    const listed = Array.isArray(paths);

    if (listed && paths.includes(`/${PROBE_FILE}`)) {
        const kept = await keepReason(deps);
        if (kept) {
            logger.warn(`[Code Removal] ${owner}/${repo} kept: ${kept}`);
            return { kept };
        }
    }

    await deps.deleteRepository(owner, repo);

    if (listed && !paths.includes(`/${PROBE_FILE}`)) {
        logger.debug(`[Code Removal] ${owner}/${repo} has no ${PROBE_FILE}; not a storefront, no code to remove`);
        return {};
    }

    deps.onStep?.(OPERATION_STAGES.removingSiteCode.label);
    const checkLive = deps.checkLive ?? checkLiveStatus;
    if (!listed) {
        logger.warn(`[Code Removal] ${owner}/${repo}: ${NOT_LISTED}`);
        return { code: { removed: 0, failed: [], stillServing: await stillServes(owner, repo, checkLive), summary: NOT_LISTED } };
    }

    const tokenProvider: DaLiveTokenProvider = { getAccessToken: () => usableToken(deps.tokenProvider) };
    const helix = (deps.makeHelix ?? ((l, tp) => new HelixService(l, undefined, tp)))(logger, tokenProvider);
    const failed = await removeCodePaths(owner, repo, paths, helix, logger);
    const stillServing = await stillServes(owner, repo, checkLive);
    const summary = removalSummary(paths.length, failed.length, stillServing);
    logger.info(
        `[Code Removal] ${owner}/${repo}: ${paths.length - failed.length} of ${paths.length} code files removed; ` +
            `aem.live still serves ${PROBE_FILE}: ${stillServing}`,
    );
    return {
        code: { removed: paths.length - failed.length, failed, stillServing, ...(summary ? { summary } : {}) },
    };
}
