/**
 * Reading a storefront repository's origin from GitHub (EDS-13f): what it was
 * built on. The pure half (parsing, wording, the lineage gate) is
 * `storefrontProvenance.ts`, which the webviews share; this half does the reads.
 *
 * Every read answers in three states, because the report built on them must
 * never say "not present" when it means "could not read" (step 07, the
 * verifying rules).
 *
 * @module features/eds/services/storefront/storefrontOrigin
 */

import type { GitHubFileOperations } from '../github/githubFileOperations';
import { readBoilerplate } from './storefrontProvenance';
import type { Logger } from '@/types/logger';
import type { RepositoryRef, StorefrontBoilerplate } from '@/types/projectFile';

/** A read's answer: what was there, that nothing was, or that the read itself failed. */
export type ReadOutcome<T> = { status: 'read'; value: T } | { status: 'absent' } | { status: 'unreadable'; reason: string };

/**
 * What a repository's `package.json` says it was built on.
 *
 * @param fileOps - The GitHub file reader
 * @param repository - The repository to read
 * @param logger - Receives a failed read
 * @param branch - The branch to read; the default branch when omitted
 */
export async function readRepoBoilerplate(
    fileOps: Pick<GitHubFileOperations, 'getFileContent'>,
    repository: RepositoryRef,
    logger: Logger,
    branch?: string,
): Promise<ReadOutcome<StorefrontBoilerplate>> {
    try {
        const file = await fileOps.getFileContent(repository.owner, repository.repo, 'package.json', branch);
        const boilerplate = readBoilerplate(file?.content);
        return boilerplate ? { status: 'read', value: boilerplate } : { status: 'absent' };
    } catch (error) {
        const reason = (error as Error).message;
        logger.debug(`[StorefrontOrigin] Could not read ${repository.owner}/${repository.repo} package.json: ${reason}`);
        return { status: 'unreadable', reason };
    }
}
