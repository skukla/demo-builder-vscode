import * as path from 'path';
import * as semver from 'semver';
import * as vscode from 'vscode';
import type { ReleaseInfo, UpdateCheckResult, GitHubRelease, GitHubReleaseAsset } from './types';
import { ServiceLocator } from '@/core/di';
import { Logger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { Project, SubmoduleConfig } from '@/types';
import { DEFAULT_SHELL } from '@/types/shell';
import { getComponentIds, getComponentVersion } from '@/types/typeGuards';

export type { UpdateCheckResult };

/**
 * Result of checking updates across all projects
 */
export interface MultiProjectUpdateResult {
    /** Component ID */
    componentId: string;
    /** Latest available version */
    latestVersion: string;
    /** Release info for updates */
    releaseInfo?: ReleaseInfo;
    /** Projects that have this component with outdated version */
    outdatedProjects: Array<{
        project: Project;
        currentVersion: string;
    }>;
}

export class UpdateManager {
    private logger: Logger;
    private context: vscode.ExtensionContext;
  
    // Repository configurations
    private readonly EXTENSION_REPO = 'skukla/demo-builder-vscode';
    private readonly COMPONENT_REPOS: Record<string, string> = {
        'citisignal-nextjs': 'skukla/citisignal-nextjs',
        'commerce-mesh': 'skukla/commerce-mesh',
        'integration-service': 'skukla/kukla-integration-service',
        'demo-inspector': 'skukla/demo-inspector',
    };

    constructor(context: vscode.ExtensionContext, logger: Logger) {
        this.context = context;
        this.logger = logger;
    }

    /**
   * Check for extension updates (respects stable/beta channel)
   */
    async checkExtensionUpdate(): Promise<UpdateCheckResult> {
        const currentVersion = this.context.extension.packageJSON.version;
        const channel = this.getUpdateChannel();
    
        const latestRelease = await this.fetchLatestRelease(this.EXTENSION_REPO, channel);
    
        if (!latestRelease) {
            return { hasUpdate: false, current: currentVersion, latest: currentVersion };
        }
    
        const hasUpdate = this.isNewerVersion(latestRelease.version, currentVersion);
    
        return {
            hasUpdate,
            current: currentVersion,
            latest: latestRelease.version,
            releaseInfo: hasUpdate ? latestRelease : undefined,
        };
    }

    /**
   * Check for component updates in current project (respects stable/beta channel)
   */
    async checkComponentUpdates(project: Project): Promise<Map<string, UpdateCheckResult>> {
        const results = new Map<string, UpdateCheckResult>();
        const channel = this.getUpdateChannel();

        if (!project.componentInstances) {
            this.logger.debug('[Updates] No componentInstances in project');
            return results;
        }

        const componentIds = getComponentIds(project.componentInstances);
        this.logger.debug(`[Updates] Checking ${componentIds.length} components: ${componentIds.join(', ')}`);

        for (const componentId of componentIds) {
            const repoPath = this.COMPONENT_REPOS[componentId];
            if (!repoPath) {
                this.logger.debug(`[Updates] Skipping ${componentId}: no repository mapping`);
                continue;
            }

            const currentVersion = getComponentVersion(project, componentId) || 'unknown';
            this.logger.debug(`[Updates] ${componentId}: current=${currentVersion}, channel=${channel}`);

            const latestRelease = await this.fetchLatestRelease(repoPath, channel);

            if (!latestRelease) {
                this.logger.debug(`[Updates] ${componentId}: no release found`);
                results.set(componentId, {
                    hasUpdate: false,
                    current: currentVersion,
                    latest: currentVersion,
                });
                continue;
            }

            this.logger.debug(`[Updates] ${componentId}: latest=${latestRelease.version}`);

            const hasUpdate = currentVersion === 'unknown' ||
                        this.isNewerVersion(latestRelease.version, currentVersion);

            this.logger.debug(`[Updates] ${componentId}: hasUpdate=${hasUpdate}`);

            results.set(componentId, {
                hasUpdate,
                current: currentVersion,
                latest: latestRelease.version,
                releaseInfo: hasUpdate ? latestRelease : undefined,
            });
        }

        return results;
    }

    /**
     * Check for component updates across ALL projects
     * Groups results by component with list of outdated projects for each
     *
     * @param projects - Array of projects to check
     * @returns Array of components with updates, each containing list of affected projects
     */
    async checkAllProjectsForUpdates(projects: Project[]): Promise<MultiProjectUpdateResult[]> {
        const channel = this.getUpdateChannel();

        // Collect all unique component IDs across all projects
        const componentProjectMap = new Map<string, Array<{ project: Project; currentVersion: string }>>();

        for (const project of projects) {
            if (!project.componentInstances) continue;

            const componentIds = getComponentIds(project.componentInstances);
            for (const componentId of componentIds) {
                const currentVersion = getComponentVersion(project, componentId) || 'unknown';

                if (!componentProjectMap.has(componentId)) {
                    componentProjectMap.set(componentId, []);
                }
                componentProjectMap.get(componentId)!.push({ project, currentVersion });
            }
        }

        this.logger.debug(`[Updates] Checking ${componentProjectMap.size} unique components across ${projects.length} projects`);

        const results: MultiProjectUpdateResult[] = [];

        // For each unique component, fetch latest version once and check all projects
        for (const [componentId, projectVersions] of componentProjectMap.entries()) {
            const repoPath = this.COMPONENT_REPOS[componentId];
            if (!repoPath) {
                this.logger.debug(`[Updates] Skipping ${componentId}: no repository mapping`);
                continue;
            }

            const latestRelease = await this.fetchLatestRelease(repoPath, channel);
            if (!latestRelease) {
                this.logger.debug(`[Updates] ${componentId}: no release found`);
                continue;
            }

            // Find projects that are outdated
            const outdatedProjects = projectVersions.filter(({ currentVersion }) => {
                return currentVersion === 'unknown' ||
                    this.isNewerVersion(latestRelease.version, currentVersion);
            });

            if (outdatedProjects.length > 0) {
                this.logger.debug(`[Updates] ${componentId}: ${outdatedProjects.length} project(s) have outdated version (latest: ${latestRelease.version})`);

                results.push({
                    componentId,
                    latestVersion: latestRelease.version,
                    releaseInfo: latestRelease,
                    outdatedProjects,
                });
            }
        }

        return results;
    }

    /**
     * Check for updates to submodules within a parent component
     *
     * @param parentComponentPath - Path to the parent component directory
     * @param submodules - Submodule configurations from component definition
     * @returns Map of submodule IDs to their update status
     */
    async checkSubmoduleUpdates(
        parentComponentPath: string,
        submodules: Record<string, SubmoduleConfig>,
    ): Promise<Map<string, UpdateCheckResult>> {
        const results = new Map<string, UpdateCheckResult>();
        const channel = this.getUpdateChannel();

        for (const [submoduleId, submoduleConfig] of Object.entries(submodules)) {
            const repoPath = this.COMPONENT_REPOS[submoduleId];
            if (!repoPath) {
                this.logger.debug(`[Updates] Skipping submodule ${submoduleId}: no repository mapping`);
                continue;
            }

            // Get current submodule commit
            const submodulePath = path.join(parentComponentPath, submoduleConfig.path);
            const currentCommit = await this.getGitCommit(submodulePath);

            this.logger.debug(`[Updates] Checking submodule ${submoduleId}: current=${currentCommit?.substring(0, 8) || 'unknown'}`);

            // Fetch latest release from GitHub
            const latestRelease = await this.fetchLatestRelease(repoPath, channel);

            if (!latestRelease) {
                results.set(submoduleId, {
                    hasUpdate: false,
                    current: currentCommit?.substring(0, 8) || 'unknown',
                    latest: 'unknown',
                });
                continue;
            }

            // For submodules, we compare commit-based versions
            // If current commit is unknown or different from latest tag, an update may be available
            const hasUpdate = !currentCommit || currentCommit !== latestRelease.version;

            if (hasUpdate) {
                this.logger.debug(`[Updates] ${submoduleId} update available: ${currentCommit?.substring(0, 8) || 'unknown'} -> ${latestRelease.version}`);
            }

            results.set(submoduleId, {
                hasUpdate,
                current: currentCommit?.substring(0, 8) || 'unknown',
                latest: latestRelease.version,
                releaseInfo: hasUpdate ? latestRelease : undefined,
            });
        }

        return results;
    }

    /**
     * Get the current HEAD commit hash from a git repository
     */
    private async getGitCommit(repoPath: string): Promise<string | null> {
        try {
            const executor = ServiceLocator.getCommandExecutor();
            const result = await executor.execute('git rev-parse HEAD', {
                cwd: repoPath,
                timeout: TIMEOUTS.QUICK_SHELL,
                shell: DEFAULT_SHELL,
            });
            return result.code === 0 ? result.stdout.trim() : null;
        } catch {
            return null;
        }
    }

    /**
   * Fetch latest release from GitHub based on channel
   * Stable: Latest non-prerelease
   * Beta: Latest release (including prereleases)
   */
    private async fetchLatestRelease(repo: string, channel: 'stable' | 'beta'): Promise<ReleaseInfo | null> {
        try {
            // For stable: use /releases/latest (non-prereleases only)
            // For beta: use /releases?per_page=20 (includes prereleases, need to sort)
            const url = channel === 'stable'
                ? `https://api.github.com/repos/${repo}/releases/latest`
                : `https://api.github.com/repos/${repo}/releases?per_page=20`;

            // Create timeout controller
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), TIMEOUTS.UPDATE_CHECK);
      
            try {
                const response = await fetch(url, { signal: controller.signal });

                // HTTP status validation (Step 4)
                if (!response.ok) {
                    if (response.status === 404) {
                        this.logger.debug(`[Updates] Release not found for ${repo}`);
                        return null;
                    }
                    if (response.status === 403) {
                        throw new Error('GitHub rate limit exceeded. Try again later.');
                    }
                    if (response.status >= 500) {
                        throw new Error(`GitHub server error: HTTP ${response.status}`);
                    }
                    throw new Error(`GitHub API error: HTTP ${response.status}`);
                }

                const data: GitHubRelease | GitHubRelease[] = await response.json();

                // Beta channel returns array, stable returns object
                let release: GitHubRelease;
                if (Array.isArray(data)) {
                    // For beta: find the latest version by semver, not by GitHub's order
                    const nonDraftReleases = data.filter((r: GitHubRelease) => !r.draft);
                    if (nonDraftReleases.length === 0) return null;

                    // Sort by version using semver
                    release = nonDraftReleases.sort((a: GitHubRelease, b: GitHubRelease) => {
                        const versionA = this.parseVersionFromTag(a.tag_name);
                        const versionB = this.parseVersionFromTag(b.tag_name);
                        return semver.gt(versionA, versionB) ? -1 : 1;
                    })[0];
                } else {
                    release = data;
                }

                if (!release || release.message === 'Not Found') {
                    this.logger.debug(`[Updates] No releases found for ${repo}`);
                    return null;
                }

                // Find VSIX asset for extension, or source archive for components
                const isExtension = repo === this.EXTENSION_REPO;
                const asset: GitHubReleaseAsset | string | undefined = isExtension
                    ? release.assets.find((a: GitHubReleaseAsset) => a.name.endsWith('.vsix'))
                    : release.zipball_url;

                if (!asset) {
                    this.logger.debug(`[Updates] No valid asset found in release for ${repo}`);
                    return null;
                }

                // Safely extract download URL based on asset type
                const downloadUrl = isExtension && typeof asset !== 'string'
                    ? asset.browser_download_url
                    : release.zipball_url;

                // SECURITY: Validate GitHub download URL before returning
                const { validateGitHubDownloadURL } = await import('@/core/validation');
                try {
                    validateGitHubDownloadURL(downloadUrl);
                } catch (error) {
                    this.logger.warn(`[Updates] Security check failed for download URL from ${repo}: ${(error as Error).message}`);
                    return null; // Treat as no update available if URL is invalid
                }

                const version = this.parseVersionFromTag(release.tag_name);
                this.logger.debug(`[Updates] Latest ${channel}: v${version} (${repo.split('/')[1]})`);

                return {
                    version,
                    downloadUrl,
                    releaseNotes: release.body || 'No release notes available',
                    publishedAt: release.published_at,
                    isPrerelease: release.prerelease,
                };
            } finally {
                clearTimeout(timeout);
            }
        } catch (error) {
            // INTENTIONALLY SILENT: Network/API errors should not alarm users.
            // Graceful degradation: returning null means "no update available" which
            // is better UX than showing "update check failed" errors for transient
            // network issues, rate limits, or GitHub outages.
            this.logger.debug(`[Updates] Failed to fetch release for ${repo}:`, error);
            return null;
        }
    }

    private getUpdateChannel(): 'stable' | 'beta' {
        return vscode.workspace.getConfiguration('demoBuilder')
            .get<'stable' | 'beta'>('updateChannel', 'stable');
    }

    private isNewerVersion(latest: string, current: string): boolean {
        try {
            // semver.gt() properly handles: 1.0.0-beta.6 > 1.0.0-beta.5
            return semver.gt(latest, current);
        } catch (error) {
            this.logger.debug(`[Updates] Version comparison failed: ${error}`);
            return false;
        }
    }

    /**
     * Extract version string from Git tag (strips leading 'v')
     */
    private parseVersionFromTag(tagName: string): string {
        return tagName.replace(/^v/, '');
    }
}

