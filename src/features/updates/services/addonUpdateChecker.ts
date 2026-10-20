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
import { SDK_SOURCE } from '@/features/eds/services/inspectorHelpers';
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
}

export interface InspectorSdkUpdateResult {
    hasUpdate: boolean;
    currentCommit: string;
    latestCommit: string;
    commitsBehind: number;
}

// ---------------------------------------------------------------------------
// What an install copies
// ---------------------------------------------------------------------------

/** The root files a library install merges (`installBlockCollections`); blocks come from `blocks/`. */
const LIBRARY_ROOT_FILES = new Set(['component-definition.json', 'component-filters.json', 'component-models.json']);

const libraryInstalls = (path: string): boolean => path.startsWith('blocks/') || LIBRARY_ROOT_FILES.has(path);

/** The SDK install vendors the `.js` files under its source folder (`inspectorHelpers`). */
const sdkInstalls = (path: string): boolean => path.startsWith(`${SDK_SOURCE.srcDir}/`) && path.endsWith('.js');

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

                const latestCommit = await getLatestBranchCommit(
                    this.secrets, lib.source.owner, lib.source.repo, lib.source.branch,
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

                results.push({ library: lib, latestCommit, commitsBehind: comparison?.ahead_by ?? 0 });
            } catch (error) {
                this.logger.warn(
                    `[Updates] Failed to check library "${lib.name}": ${(error as Error).message}`,
                );
            }
        }

        return results;
    }

    /**
     * Check if the Demo Inspector SDK has updates available.
     * Returns null if the SDK is not installed.
     */
    async checkInspectorSdk(project: Project): Promise<InspectorSdkUpdateResult | null> {
        if (!project.installedInspectorSdk) {
            return null;
        }

        const { commitSha: currentCommit } = project.installedInspectorSdk;

        try {
            const latestCommit = await getLatestBranchCommit(
                this.secrets, SDK_SOURCE.owner, SDK_SOURCE.repo, SDK_SOURCE.branch,
            );
            if (!latestCommit) {
                this.logger.warn(`[Updates] Could not fetch latest commit for Inspector SDK`);
                return null;
            }

            if (latestCommit === currentCommit) {
                this.logger.debug(`[Updates] Inspector SDK: up to date (${currentCommit.slice(0, 7)})`);
                return { hasUpdate: false, currentCommit, latestCommit, commitsBehind: 0 };
            }

            this.logger.debug(
                `[Updates] Inspector SDK: ${currentCommit.slice(0, 7)} → ${latestCommit.slice(0, 7)}`,
            );

            const comparison = await compareCommits(
                this.secrets, SDK_SOURCE.owner, SDK_SOURCE.repo, currentCommit, latestCommit,
            );
            if (changesNothingInstalled(comparison, sdkInstalls)) {
                this.logger.debug(`[Updates] Inspector SDK: newer commits change no SDK files`);
                return { hasUpdate: false, currentCommit, latestCommit, commitsBehind: 0 };
            }

            return {
                hasUpdate: true,
                currentCommit,
                latestCommit,
                commitsBehind: comparison?.ahead_by ?? 0,
            };
        } catch (error) {
            this.logger.error(`[Updates] Failed to check Inspector SDK updates`, error as Error);
            return null;
        }
    }
}
