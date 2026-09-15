/**
 * Template commit resolver — which source commit a storefront repository is built from.
 *
 * The answer is recorded as the storefront's `lastSyncedCommit`, which "Check for
 * Updates" compares against. Project creation and reset both record it, so both ask
 * here: two copies would drift, and a reset storefront would then disagree with a
 * freshly created one about which updates it already has.
 *
 * @module features/eds/services/templateCommitResolver
 */

import type { GitHubFileOperations } from './github/githubFileOperations';
import { readLkgSha } from './patches/lkgReader';
import type { CodePatchSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

/** Where a storefront's source comes from. */
interface TemplateCommitSource {
    templateOwner?: string;
    templateRepo?: string;
    /** Present for thin-layer storefronts (ADR-006); names the patches repo's LKG. */
    codePatchSource?: CodePatchSource;
}

/**
 * Resolve the template commit a storefront is (or is about to be) built from.
 *
 * Thin-layer storefronts: the verified Last-Known-Good SHA from the patches repo.
 * If that is unreachable, fall back to the template's `main` head (ADR-006 D1
 * proceed-and-warn). Forked storefronts: the template's `main` head.
 *
 * @param source - the template repository and, for thin-layer storefronts, the patch source
 * @param githubFileOps - reads the template branch head
 * @param logger - receives the fallback and failure warnings
 * @returns the 40-hex commit SHA, or undefined when it cannot be determined
 *   (template unknown, branch missing, or a network failure) — never a guess
 */
export async function resolveTemplateCommitSha(
    source: TemplateCommitSource,
    githubFileOps: Pick<GitHubFileOperations, 'getLatestCommitSha'>,
    logger: Logger,
): Promise<string | undefined> {
    const { templateOwner, templateRepo, codePatchSource } = source;
    if (!templateOwner || !templateRepo) return undefined;

    if (codePatchSource) {
        const { owner, repo, lkgFile } = codePatchSource;
        const lkg = await readLkgSha({ owner, repo, lkgFile }, logger);
        if (lkg) {
            logger.debug(`[TemplateCommit] LKG ${lkg.substring(0, 7)} (from ${owner}/${repo})`);
            return lkg;
        }
        logger.warn(
            `[TemplateCommit] LKG unreachable for ${owner}/${repo} — falling back to template HEAD`,
        );
    }

    try {
        const sha =
            (await githubFileOps.getLatestCommitSha(templateOwner, templateRepo, 'main')) ??
            undefined;
        logger.debug(`[TemplateCommit] Template HEAD: ${sha?.substring(0, 7)}`);
        return sha;
    } catch (error) {
        logger.warn(
            `[TemplateCommit] Could not fetch template commit SHA: ${(error as Error).message}`,
        );
        return undefined;
    }
}
