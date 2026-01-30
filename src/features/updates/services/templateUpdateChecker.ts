/**
 * Template Update Checker
 *
 * Checks for updates to EDS storefront templates by comparing the project's
 * lastSyncedCommit with the upstream template's latest commit.
 *
 * Unlike components (which use GitHub Releases with semantic versioning),
 * templates use commit-based comparison since they don't have versioned releases.
 */

import * as vscode from 'vscode';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types';
import { COMPONENT_IDS } from '@/core/constants';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * Result of checking for template updates
 */
export interface TemplateUpdateResult {
    /** Whether updates are available */
    hasUpdates: boolean;
    /** Project's last synced commit SHA */
    currentCommit: string;
    /** Template's latest commit SHA */
    latestCommit: string;
    /** Number of commits the project is behind */
    commitsBehind: number;
    /** List of changed files (optional, for preview) */
    changedFiles?: string[];
    /** Template owner (GitHub username or org) */
    templateOwner: string;
    /** Template repository name */
    templateRepo: string;
}

/**
 * GitHub commit comparison response (simplified)
 */
interface GitHubCompareResponse {
    ahead_by: number;
    behind_by: number;
    status: 'ahead' | 'behind' | 'identical' | 'diverged';
    files?: Array<{
        filename: string;
        status: 'added' | 'removed' | 'modified' | 'renamed';
    }>;
}

/**
 * Template Update Checker Service
 *
 * Detects available updates for EDS storefronts by comparing commits
 * between the project's lastSyncedCommit and the upstream template.
 */
export class TemplateUpdateChecker {
    private logger: Logger;
    private secrets: vscode.SecretStorage;

    constructor(secrets: vscode.SecretStorage, logger: Logger) {
        this.secrets = secrets;
        this.logger = logger;
    }

    /**
     * Check if an EDS project has upstream template updates available
     *
     * @param project - Project to check for updates
     * @returns Template update result, or null if not an EDS project or missing template info
     */
    async checkForUpdates(project: Project): Promise<TemplateUpdateResult | null> {
        // Extract EDS metadata from component instance
        const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
        if (!edsInstance?.metadata) {
            this.logger.debug(`[TemplateUpdates] No EDS instance in project ${project.name}`);
            return null;
        }

        const metadata = edsInstance.metadata as Record<string, unknown>;
        const templateOwner = metadata.templateOwner as string | undefined;
        const templateRepo = metadata.templateRepo as string | undefined;
        const lastSyncedCommit = metadata.lastSyncedCommit as string | undefined;

        // Validate required template metadata
        if (!templateOwner || !templateRepo) {
            this.logger.debug(`[TemplateUpdates] Missing template info for ${project.name}`);
            return null;
        }

        if (!lastSyncedCommit) {
            this.logger.debug(`[TemplateUpdates] No lastSyncedCommit for ${project.name} - cannot check for updates`);
            return null;
        }

        try {
            // Fetch template's latest commit SHA
            const latestCommit = await this.getLatestCommitSha(templateOwner, templateRepo);
            if (!latestCommit) {
                this.logger.warn(`[TemplateUpdates] Could not fetch latest commit for ${templateOwner}/${templateRepo}`);
                return null;
            }

            // If commits match, no updates available
            if (latestCommit === lastSyncedCommit) {
                return {
                    hasUpdates: false,
                    currentCommit: lastSyncedCommit,
                    latestCommit,
                    commitsBehind: 0,
                    templateOwner,
                    templateRepo,
                };
            }

            // Compare commits to get the number of commits behind
            const comparison = await this.compareCommits(
                templateOwner,
                templateRepo,
                lastSyncedCommit,
                latestCommit,
            );

            return {
                hasUpdates: comparison.behind_by > 0,
                currentCommit: lastSyncedCommit,
                latestCommit,
                commitsBehind: comparison.behind_by,
                changedFiles: comparison.files?.map(f => f.filename),
                templateOwner,
                templateRepo,
            };
        } catch (error) {
            this.logger.error(`[TemplateUpdates] Failed to check updates for ${project.name}`, error as Error);
            return null;
        }
    }

    /**
     * Get list of changed files between commits
     *
     * @param templateOwner - Template repository owner
     * @param templateRepo - Template repository name
     * @param baseCommit - Base commit SHA (project's current state)
     * @param headCommit - Head commit SHA (template's latest state)
     * @returns List of changed file paths
     */
    async getChangedFiles(
        templateOwner: string,
        templateRepo: string,
        baseCommit: string,
        headCommit: string,
    ): Promise<string[]> {
        try {
            const comparison = await this.compareCommits(
                templateOwner,
                templateRepo,
                baseCommit,
                headCommit,
            );

            return comparison.files?.map(f => f.filename) ?? [];
        } catch (error) {
            this.logger.error(`[TemplateUpdates] Failed to get changed files`, error as Error);
            return [];
        }
    }

    /**
     * Fetch the latest commit SHA from the template repository
     */
    private async getLatestCommitSha(owner: string, repo: string): Promise<string | null> {
        try {
            const url = `https://api.github.com/repos/${owner}/${repo}/branches/main`;

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), TIMEOUTS.QUICK);

            try {
                const response = await fetch(url, {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'Demo-Builder-VSCode',
                    },
                    signal: controller.signal,
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        return null;
                    }
                    throw new Error(`GitHub API error: HTTP ${response.status}`);
                }

                const data = await response.json();
                return data.commit?.sha ?? null;
            } finally {
                clearTimeout(timeout);
            }
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                this.logger.warn(`[TemplateUpdates] Timeout fetching latest commit for ${owner}/${repo}`);
            }
            return null;
        }
    }

    /**
     * Compare two commits using GitHub's compare API
     */
    private async compareCommits(
        owner: string,
        repo: string,
        base: string,
        head: string,
    ): Promise<GitHubCompareResponse> {
        const url = `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUTS.QUICK);

        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Demo-Builder-VSCode',
                },
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`GitHub API error: HTTP ${response.status}`);
            }

            return await response.json() as GitHubCompareResponse;
        } finally {
            clearTimeout(timeout);
        }
    }
}
