/**
 * GitHub Repo Archive — a repository's zip as GitHub serves it, and the reset
 * built from a template's.
 *
 * `downloadRepoArchive` is shared by the template reset (which reads it) and
 * "Storefront as a zip file" (which hands it to the SC). `resetRepoToTemplate`
 * unpacks a template revision and replaces a repository with it through the Git
 * Data primitives in `GitHubTreeCommits`.
 *
 * Split out of `githubFileOperations.ts` on 2026-10-08 (EDS-8). What changes
 * here is ADR-006 (which template revision a thin-layer storefront pins to) and
 * how archived bytes become tree entries; neither touches the Contents API.
 *
 * @module features/eds/services/github/githubRepoArchive
 */

import AdmZip from 'adm-zip';
import type { GitHubTreeInput } from '../types';
import { archiveFileMode, isBinary } from './archiveFile';
import { ERROR_MESSAGES } from './githubHelpers';
import type { GitHubTokenService } from './githubTokenService';
import { batchTreeEntries, type GitHubTreeCommits } from './githubTreeCommits';
import { getLogger } from '@/core/logging/debugLogger';
import type { Logger } from '@/types/logger';

/** One file read out of a repository archive: its exact bytes and the mode its tree entry takes. */
interface ArchivedFile {
    data: Buffer;
    mode: GitHubTreeInput['mode'];
}

/**
 * Build the GitHub archive URL for a repo+ref. Detects whether `ref` is a
 * branch name (e.g. `main`) or a full 40-hex commit SHA — they take
 * different URL shapes:
 *
 *   branch: `archive/refs/heads/{branch}.zip`
 *   SHA:    `archive/{sha}.zip`
 *
 * Used by `downloadRepoContents`. Exported so the SHA-vs-branch routing
 * is directly unit-testable (the wider `resetRepoToTemplate` integration
 * brings extensive Octokit + zip-buffer mocking that obscures this one
 * load-bearing branch).
 *
 * ADR-006 Step 4: passing the LKG SHA here is how reset pins thin-layer
 * storefronts to a verified canonical state instead of canonical HEAD.
 */
export function buildArchiveUrl(
    owner: string,
    repo: string,
    ref: string,
): { url: string; isSha: boolean } {
    const isSha = /^[0-9a-f]{40}$/i.test(ref);
    const url = isSha
        ? `https://github.com/${owner}/${repo}/archive/${ref}.zip`
        : `https://github.com/${owner}/${repo}/archive/refs/heads/${ref}.zip`;
    return { url, isSha };
}

export class GitHubRepoArchive {
    private logger: Logger;
    private tokenService: GitHubTokenService;
    private treeCommits: GitHubTreeCommits;

    constructor(tokenService: GitHubTokenService, treeCommits: GitHubTreeCommits, logger?: Logger) {
        this.tokenService = tokenService;
        this.treeCommits = treeCommits;
        this.logger = logger ?? getLogger();
    }

    /**
     * The repository's archive at `ref` as GitHub serves it: a zip with one root
     * folder. Shared by the template reset (which reads it) and "Storefront as a
     * zip file" (which hands it to the SC with the description file added).
     *
     * @returns The zip's bytes
     */
    async downloadRepoArchive(owner: string, repo: string, ref = 'main'): Promise<Buffer> {
        const token = await this.tokenService.getToken();
        if (!token) {
            throw new Error(ERROR_MESSAGES.NOT_AUTHENTICATED);
        }

        const { url: zipUrl, isSha } = buildArchiveUrl(owner, repo, ref);
        this.logger.debug(
            `[GitHub] Downloading repository archive from ${owner}/${repo}@${ref} (${isSha ? 'SHA' : 'branch'})`,
        );

        const response = await fetch(zipUrl, {
            headers: {
                'User-Agent': 'Demo-Builder-VSCode',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to download archive: HTTP ${response.status}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        this.logger.debug(
            `[GitHub] Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)} MB archive`,
        );
        return buffer;
    }

    /**
     * Download repository as a zipball and extract all file contents
     *
     * This is much more efficient than fetching individual blobs:
     * - Single HTTP request regardless of file count
     * - Avoids GitHub API rate limits
     *
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param ref - Git ref (branch/tag/commit) - default: 'main'
     * @returns Map of path -> the file's bytes and its tree mode
     */
    private async downloadRepoContents(
        owner: string,
        repo: string,
        ref = 'main',
    ): Promise<Map<string, ArchivedFile>> {
        const buffer = await this.downloadRepoArchive(owner, repo, ref);

        // Extract files from zipball
        const zip = new AdmZip(buffer);
        const entries = zip.getEntries();
        const contents = new Map<string, ArchivedFile>();

        // Zipball has a root folder like "owner-repo-sha/" - we need to strip it
        let rootPrefix = '';
        for (const entry of entries) {
            if (entry.isDirectory && !rootPrefix) {
                rootPrefix = entry.entryName;
                break;
            }
        }

        for (const entry of entries) {
            if (entry.isDirectory) {
                continue;
            }

            const path = entry.entryName.startsWith(rootPrefix)
                ? entry.entryName.slice(rootPrefix.length)
                : entry.entryName;

            if (!path) {
                continue;
            }

            // Bytes, not a UTF-8 string: a decode corrupts binaries (see archiveFile.ts).
            contents.set(path, { data: entry.getData(), mode: archiveFileMode(entry.header.attr) });
        }

        this.logger.info(`[GitHub] Extracted ${contents.size} files from archive`);
        return contents;
    }

    /**
     * Reset a repository to match a template using archive download
     *
     * This approach:
     * 1. Downloads template as a zipball (single HTTP request)
     * 2. Extracts all files from the archive
     * 3. Creates new tree with content
     * 4. Creates commit and updates branch
     *
     * This is much more efficient than fetching individual blobs:
     * - Single download request vs N blob fetch requests
     * - Avoids GitHub API rate limits
     * - Faster for large repositories (hundreds of files)
     *
     * @param templateOwner - Template repo owner
     * @param templateRepo - Template repo name
     * @param targetOwner - Target repo owner
     * @param targetRepo - Target repo name
     * @param fileOverrides - Map of path -> content for files to override (e.g., fstab.yaml)
     * @param templateRef - Template ref to clone FROM. May be a branch name OR a
     *   40-hex commit SHA (ADR-006 Step 4: thin-layer storefronts pin to LKG SHA).
     *   The target repo's `main` branch is always the destination — `templateRef`
     *   only controls which template revision is downloaded, not which target
     *   branch is reset.
     * @returns Object with commit SHA and file counts
     */
    async resetRepoToTemplate(
        templateOwner: string,
        templateRepo: string,
        targetOwner: string,
        targetRepo: string,
        fileOverrides: Map<string, string>,
        templateRef = 'main',
    ): Promise<{ commitSha: string; fileCount: number }> {
        // Target branch is always `main` regardless of which template revision
        // we're cloning from — the LKG SHA flows into `downloadRepoContents`
        // only. Conflating these two values (the pre-Step-4 code did) makes
        // getBranchInfo hit the GitHub branches API with a SHA, which 404s
        // with "Branch not found".
        const targetBranch = 'main';
        this.logger.info(
            `[GitHub] Resetting ${targetOwner}/${targetRepo}@${targetBranch} to template ${templateOwner}/${templateRepo}@${templateRef}`,
        );

        // Step 1: Get target branch info (need current commit as parent)
        const targetBranchInfo = await this.treeCommits.getBranchInfo(targetOwner, targetRepo, targetBranch);
        this.logger.info(
            `[GitHub] Target branch commit: ${targetBranchInfo.commitSha.substring(0, 7)}`,
        );

        // Step 2: Download entire template repo as zipball (single request - avoids rate limits)
        const templateContents = await this.downloadRepoContents(
            templateOwner,
            templateRepo,
            templateRef,
        );

        // Step 3: Build tree entries. Text travels inline; a binary file goes up as
        // a blob of its exact bytes first, and each file keeps its archived mode.
        const treeEntries: GitHubTreeInput[] = [];
        let binaryCount = 0;

        for (const [path, file] of templateContents) {
            const override = fileOverrides.get(path);
            if (override !== undefined) {
                // Use override content
                treeEntries.push({
                    path,
                    mode: file.mode,
                    type: 'blob',
                    content: override,
                });
            } else if (file.mode !== '120000' && isBinary(file.data)) {
                const sha = await this.treeCommits.createBlob(targetOwner, targetRepo, file.data.toString('base64'));
                treeEntries.push({ path, mode: file.mode, type: 'blob', sha });
                binaryCount += 1;
            } else {
                // Use template content from archive (a symlink's content is its target)
                treeEntries.push({
                    path,
                    mode: file.mode,
                    type: 'blob',
                    content: file.data.toString('utf-8'),
                });
            }
        }
        if (binaryCount > 0) {
            this.logger.debug(`[GitHub] Uploaded ${binaryCount} binary file(s) as blobs`);
        }

        // Add any override files that don't exist in template
        for (const [path, content] of fileOverrides) {
            if (!templateContents.has(path)) {
                treeEntries.push({
                    path,
                    mode: '100644',
                    type: 'blob',
                    content,
                });
            }
        }

        // Step 4: Create the tree INCREMENTALLY.
        //
        // Sending every file's content in one request is what broke reset for
        // large templates: GitHub timed out on a 13.55 MB body and said so
        // explicitly ("Consider building the tree incrementally").
        //
        // The FIRST batch deliberately passes no base_tree. A reset REPLACES
        // the repository, and basing it on the branch's existing tree would let
        // files the template no longer contains survive the reset. Each later
        // batch chains on the previous batch's tree, so the final tree is the
        // union of all batches — exactly the template, nothing stale.
        const batches = batchTreeEntries(treeEntries);
        this.logger.info(
            `[GitHub] Creating tree with ${treeEntries.length} entries ` +
                `in ${batches.length} request(s)`,
        );

        let newTreeSha: string | undefined;
        for (const [index, batch] of batches.entries()) {
            newTreeSha = await this.treeCommits.createTree(targetOwner, targetRepo, batch, newTreeSha);
            if (batches.length > 1) {
                this.logger.debug(
                    `[GitHub] Tree batch ${index + 1}/${batches.length} ` +
                        `(${batch.length} entries) -> ${newTreeSha.substring(0, 7)}`,
                );
            }
        }
        if (!newTreeSha) {
            throw new Error('Template produced no files to commit');
        }
        this.logger.info(`[GitHub] Created tree: ${newTreeSha.substring(0, 7)}`);

        // Step 5: Create commit
        const commitSha = await this.treeCommits.createCommit(
            targetOwner,
            targetRepo,
            'chore: reset repository to template',
            newTreeSha,
            targetBranchInfo.commitSha,
        );
        this.logger.info(`[GitHub] Created commit: ${commitSha.substring(0, 7)}`);

        // Step 6: Update branch to point to new commit.
        //
        // `force` explicitly: a reset REPLACES the repository, and the commit
        // built above is deliberately not a descendant of what is there now.
        // Every other caller of updateBranchRef is additive and must NOT pass it.
        await this.treeCommits.updateBranchRef(targetOwner, targetRepo, targetBranch, commitSha, true);
        this.logger.info(`[GitHub] Updated branch ${targetBranch} to ${commitSha.substring(0, 7)}`);

        return {
            commitSha,
            fileCount: treeEntries.length,
        };
    }
}
