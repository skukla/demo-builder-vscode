/**
 * Read the storefront's code from the SC's own repository and derive its paths.
 *
 * In every flow that copies content, the SC's GitHub repository holds the final
 * code before the copy starts: created from the template, reset onto it, or made
 * from an added demo. That makes it the one source common to creation and reset,
 * so the content pipeline reads the code there, once, just before the copy: one
 * archive download per create or reset (accepted, EDS-40).
 *
 * Best-effort. When the archive cannot be downloaded, or holds no storefront code,
 * the answer is `undefined` ("not read") and the copy falls back to the fixed
 * lists. An empty list is never returned for that, because to the copy an empty
 * list means "this storefront loads nothing".
 *
 * @module features/eds/services/storefrontCodeReader
 */

import type { GitHubRepoArchive } from './github/githubRepoArchive';
import {
    deriveStorefrontCodePaths,
    isStorefrontCodeFile,
    type StorefrontCodeFile,
} from './storefrontCodePaths';
import type { Logger } from '@/types/logger';

/**
 * The site paths the storefront in this repository loads from its own code.
 *
 * @param repoArchive - downloads a repository's archive (`githubFileOps.repoArchive`)
 * @param repo - the SC's repository: GitHub owner and name
 * @returns the derived paths, or `undefined` when the code could not be read
 */
export async function readStorefrontCodePaths(
    repoArchive: Pick<GitHubRepoArchive, 'downloadRepoContents'>,
    repo: { owner: string; repo: string },
    logger: Logger,
): Promise<string[] | undefined> {
    try {
        const contents = await repoArchive.downloadRepoContents(repo.owner, repo.repo);
        const files: StorefrontCodeFile[] = [];
        for (const [path, file] of contents) {
            if (isStorefrontCodeFile(path)) files.push({ path, content: file.data.toString('utf8') });
        }
        if (files.length === 0) {
            logger.warn(
                `[EdsPipeline] No storefront code found in ${repo.owner}/${repo.repo}; the content copy uses the fixed lists`,
            );
            return undefined;
        }
        const paths = deriveStorefrontCodePaths(files);
        logger.info(
            `[EdsPipeline] Read ${files.length} code files from ${repo.owner}/${repo.repo}: they load ${paths.length} site paths`,
        );
        return paths;
    } catch (error) {
        logger.warn(
            `[EdsPipeline] Could not read the storefront's code from ${repo.owner}/${repo.repo} ` +
                `(${(error as Error).message}); the content copy uses the fixed lists`,
        );
        return undefined;
    }
}
