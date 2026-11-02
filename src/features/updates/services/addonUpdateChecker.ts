/**
 * Addon Update Checker
 *
 * Checks for updates to installed block libraries and the Demo Inspector SDK
 * by comparing recorded commit SHAs against the latest upstream commits.
 *
 * Uses shared GitHub API utilities from githubApiClient for headers and
 * fetch-with-timeout. Graceful degradation on errors.
 *
 * @module features/updates/services/addonUpdateChecker
 */

import * as vscode from 'vscode';
import {
    compareCommits,
    getLatestBranchCommit,
    type GitHubCompareResponse,
} from './githubApiClient';
import { refOfSource } from '@/core/releases/componentRelease';
import { releasedRepoOf } from '@/core/releases/releasedRepos';
import type { Project } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import type { Logger } from '@/types/logger';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface BlockLibraryUpdateResult {
    library: InstalledBlockLibrary;
    latestCommit: string;
    commitsBehind: number;
    /** The release it would move to, for a repository that ships by release. */
    version?: string;
}

// ---------------------------------------------------------------------------
// What an install copies
// ---------------------------------------------------------------------------

/** The root files a library install merges (`installBlockCollections`); blocks come from `blocks/`. */
const LIBRARY_ROOT_FILES = new Set(['component-definition.json', 'component-filters.json', 'component-models.json']);

const libraryInstalls = (path: string): boolean => path.startsWith('blocks/') || LIBRARY_ROOT_FILES.has(path);

/** GitHub lists at most this many changed files; a list this long may have left one out. */
const COMPARE_FILE_CAP = 300;

/**
 * Whether the commits since the installed one changed nothing the install copies.
 *
 * A new commit alone is not an update: on 2026-10-20 a CI workflow added to the block
 * library offered "1 commit behind" on every project that had it, with no block changed.
 * When the list is missing or full, the answer is no: an update offered for nothing
 * costs a click, one hidden costs the SC the change.
 *
 * @param comparison - GitHub's compare answer, or null when it could not be read
 * @param installs - whether the install copies a repository path
 * @returns true only when every listed file, by its new and its old name, is one the install ignores
 */
function changesNothingInstalled(
    comparison: GitHubCompareResponse | null,
    installs: (path: string) => boolean,
): boolean {
    const files = comparison?.files;
    if (!files || files.length >= COMPARE_FILE_CAP) return false;
    return !files.some((f) => installs(f.filename) || (f.previous_filename !== undefined && installs(f.previous_filename)));
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AddonUpdateChecker {
    private secrets: vscode.SecretStorage;
    private logger: Logger;

    constructor(secrets: vscode.SecretStorage, logger: Logger) {
        this.secrets = secrets;
        this.logger = logger;
    }

    /**
     * Check all installed block libraries for updates.
     * Returns only those with available updates.
     */
    async checkBlockLibraries(project: Project): Promise<BlockLibraryUpdateResult[]> {
        const libraries = project.installedBlockLibraries;
        if (!libraries) {
            return [];
        }

        const results: BlockLibraryUpdateResult[] = [];

        for (const lib of libraries) {
            try {
                if (!lib.source?.owner || !lib.source?.repo || !lib.source?.branch) {
                    this.logger.warn(`[Updates] Skipping library "${lib.name}" — missing source info`);
                    continue;
                }

                // A repository the builder owns offers its newest release, and nothing until it has one.
                const { ref, version } = await refOfSource(lib.source, this.logger);
                if (!version && releasedRepoOf(`https://github.com/${lib.source.owner}/${lib.source.repo}`)) {
                    this.logger.debug(`[Updates] Library "${lib.name}": no release to offer`);
                    continue;
                }

                const latestCommit = await getLatestBranchCommit(
                    this.secrets, lib.source.owner, lib.source.repo, ref,
                );
                if (!latestCommit) {
                    this.logger.warn(`[Updates] Could not fetch latest commit for ${lib.source.owner}/${lib.source.repo}`);
                    continue;
                }

                if (latestCommit === lib.commitSha) {
                    this.logger.debug(`[Updates] Library "${lib.name}": up to date (${lib.commitSha.slice(0, 7)})`);
                    continue;
                }

                this.logger.debug(
                    `[Updates] Library "${lib.name}": ${lib.commitSha.slice(0, 7)} → ${latestCommit.slice(0, 7)}`,
                );

                const comparison = await compareCommits(
                    this.secrets, lib.source.owner, lib.source.repo, lib.commitSha, latestCommit,
                );
                if (changesNothingInstalled(comparison, libraryInstalls)) {
                    this.logger.debug(`[Updates] Library "${lib.name}": newer commits change no block files`);
                    continue;
                }

                results.push({
                    library: lib,
                    latestCommit,
                    commitsBehind: comparison?.ahead_by ?? 0,
                    ...(version ? { version } : {}),
                });
            } catch (error) {
                this.logger.warn(
                    `[Updates] Failed to check library "${lib.name}": ${(error as Error).message}`,
                );
            }
        }

        return results;
    }

}
