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
    GITHUB_API_BASE,
    buildGitHubHeaders,
    fetchWithTimeout,
} from './githubApiClient';
import { SDK_SOURCE } from '@/features/eds/services/inspectorHelpers';
import type { Project } from '@/types';
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
        if (!libraries || libraries.length === 0) {
            return [];
        }

        const results: BlockLibraryUpdateResult[] = [];

        for (const lib of libraries) {
            try {
                if (!lib.source?.owner || !lib.source?.repo || !lib.source?.branch) {
                    this.logger.warn(`[Updates] Skipping library "${lib.name}" — missing source info`);
                    continue;
                }

                const latestCommit = await this.getLatestCommitSha(
                    lib.source.owner, lib.source.repo, lib.source.branch,
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

                const commitsBehind = await this.getCommitsBehind(
                    lib.source.owner, lib.source.repo, lib.commitSha, latestCommit,
                );

                results.push({ library: lib, latestCommit, commitsBehind });
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
            const latestCommit = await this.getLatestCommitSha(
                SDK_SOURCE.owner, SDK_SOURCE.repo, SDK_SOURCE.branch,
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

            const commitsBehind = await this.getCommitsBehind(
                SDK_SOURCE.owner, SDK_SOURCE.repo, currentCommit, latestCommit,
            );

            return { hasUpdate: true, currentCommit, latestCommit, commitsBehind };
        } catch (error) {
            this.logger.error(`[Updates] Failed to check Inspector SDK updates`, error as Error);
            return null;
        }
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private async getLatestCommitSha(
        owner: string, repo: string, branch: string,
    ): Promise<string | null> {
        try {
            const headers = await buildGitHubHeaders(this.secrets);
            const response = await fetchWithTimeout(
                `${GITHUB_API_BASE}/repos/${owner}/${repo}/branches/${branch}`,
                { headers },
            );

            if (!response.ok) {
                return null;
            }

            const data = await response.json();
            return data.commit?.sha ?? null;
        } catch {
            return null;
        }
    }

    private async getCommitsBehind(
        owner: string, repo: string, base: string, head: string,
    ): Promise<number> {
        try {
            const headers = await buildGitHubHeaders(this.secrets);
            const response = await fetchWithTimeout(
                `${GITHUB_API_BASE}/repos/${owner}/${repo}/compare/${base}...${head}`,
                { headers },
            );

            if (!response.ok) {
                return 0;
            }

            const data = await response.json();
            return data.ahead_by ?? 0;
        } catch {
            return 0;
        }
    }
}
