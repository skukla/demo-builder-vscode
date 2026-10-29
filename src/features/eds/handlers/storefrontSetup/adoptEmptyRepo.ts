/**
 * Adopt an EMPTY existing repository (EDS-17).
 *
 * An SC who cannot create repositories in their organization asks an owner for an
 * empty one and picks it. The Storefront step reads it as `empty` and shows "it
 * will be set up from the template" (`describeResetOption`), so there is nothing
 * to consent to — but the template reset clones `--branch main`, and a repository
 * with no commits has no branch at all. One first commit through the contents API
 * creates the default branch (GitHub accepts a create there on an empty
 * repository); the caller then runs the same reset a not-a-storefront repo gets.
 *
 * The verdict comes from `classifyRepoForStorefront`, the classifier the step
 * itself calls, so setup and the step cannot disagree about what "empty" means.
 *
 * @module features/eds/handlers/storefrontSetup/adoptEmptyRepo
 */

import type { GitHubFileOperations } from '../../services/github/githubFileOperations';
import { classifyRepoForStorefront } from '../../services/storefront/repoStorefrontReadiness';
import type { Logger } from '@/types/logger';

/** The first commit's only file. The reset that follows replaces the tree with the template's. */
const FIRST_COMMIT_README = '# Storefront\n\nSet up by Adobe Demo Builder.\n';

/**
 * When the repository is empty, give it a first commit so it can be reset.
 *
 * @param fileOps - GitHub file reads and the contents-API write
 * @param owner - repository owner (a user or an organization)
 * @param repo - repository name
 * @param logger - receives the verdict
 * @returns true when the repo WAS empty and now has a first commit; the caller resets it
 */
export async function seedIfEmpty(
    fileOps: Pick<GitHubFileOperations, 'getFileContent' | 'createOrUpdateFile'>,
    owner: string,
    repo: string,
    logger: Logger,
): Promise<boolean> {
    const readiness = await classifyRepoForStorefront(fileOps, owner, repo, logger);
    if (readiness.kind !== 'empty') return false;
    logger.info(`[Storefront Setup] ${owner}/${repo} is empty — writing a first commit before the template`);
    await fileOps.createOrUpdateFile(
        owner,
        repo,
        'README.md',
        FIRST_COMMIT_README,
        'chore: first commit, so the storefront template can be applied',
    );
    return true;
}
