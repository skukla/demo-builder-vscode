import * as fs from 'fs/promises';
import * as semver from 'semver';
import * as vscode from 'vscode';
import { isRepoCollaborator } from './collaboratorGate';
import { ComponentRepositoryResolver } from './componentRepositoryResolver';
import { GITHUB_API_BASE, buildGitHubHeaders, fetchWithTimeout } from './githubApiClient';
import { selectLatestForChannel } from './releaseTrack';
import type {
    ReleaseInfo,
    UpdateCheckResult,
    GitHubRelease,
    GitHubReleaseAsset,
    UpdateChannel,
} from './types';
import { validateGitHubDownloadURL } from '@/core/validation/URLValidator';
import { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import { getComponentInstanceEntries, getComponentVersion } from '@/types/typeGuards';

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
    private repositoryResolver: ComponentRepositoryResolver;

    // Extension repository (not in components.json)
    private readonly EXTENSION_REPO = 'skukla/demo-builder-vscode';

    constructor(context: vscode.ExtensionContext, logger: Logger) {
        this.context = context;
        this.logger = logger;
        this.repositoryResolver = new ComponentRepositoryResolver(context.extensionPath, logger);
    }

    /**
     * Check for extension updates (respects stable/beta channel)
     */
    async checkExtensionUpdate(): Promise<UpdateCheckResult> {
        const currentVersion = this.context.extension.packageJSON.version;
        const channel = await this.resolveEffectiveChannel(this.getUpdateChannel());

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
     * Latest final (stable) version string, or null. Used by the graduation
     * off-ramp to detect when an installed -alpha.* has been superseded.
     */
    async getLatestFinalVersion(): Promise<string | null> {
        const release = await this.fetchLatestRelease(this.EXTENSION_REPO, 'stable');
        return release ? release.version : null;
    }

    /**
     * Check for component updates across ALL projects
     * Groups results by component with list of outdated projects for each
     *
     * @param projects - Array of projects to check
     * @returns Array of components with updates, each containing list of affected projects
     */
    async checkAllProjectsForUpdates(projects: Project[]): Promise<MultiProjectUpdateResult[]> {
        // Components ship no -alpha.* builds; early-access collapses to beta for
        // component checks so EA users don't silently skip component updates.
        const configuredChannel = this.getUpdateChannel();
        const channel: UpdateChannel =
            configuredChannel === 'early-access' ? 'beta' : configuredChannel;

        // Collect all unique component IDs across all projects
        const componentProjectMap = new Map<
            string,
            Array<{ project: Project; currentVersion: string }>
        >();

        for (const project of projects) {
            for (const [componentId, component] of getComponentInstanceEntries(project)) {
                // RESILIENCE: Skip components whose paths don't exist on filesystem
                // This handles cases where a component was deleted but still registered in state
                if (!component.path) {
                    this.logger.debug(
                        `[Updates] Skipping ${componentId} in ${project.name}: no path registered`,
                    );
                    continue;
                }

                try {
                    await fs.access(component.path);
                } catch {
                    this.logger.debug(
                        `[Updates] Skipping ${componentId} in ${project.name}: path does not exist (${component.path})`,
                    );
                    continue;
                }

                const currentVersion = getComponentVersion(project, componentId) || 'unknown';

                const entries = componentProjectMap.get(componentId) ?? [];
                entries.push({ project, currentVersion });
                componentProjectMap.set(componentId, entries);
            }
        }

        const results: MultiProjectUpdateResult[] = [];

        // For each unique component, fetch latest version once and check all projects
        for (const [componentId, projectVersions] of componentProjectMap.entries()) {
            // Resolve repository: try components.json first, then any project's instance repoUrl
            let repository: string | null = null;
            for (const { project: proj } of projectVersions) {
                repository = await this.resolveComponentRepository(
                    componentId,
                    proj.componentInstances?.[componentId],
                );
                if (repository) break;
            }

            if (!repository) {
                continue;
            }

            const latestRelease = await this.fetchLatestRelease(repository, channel);
            if (!latestRelease) {
                continue;
            }

            // Find projects that are outdated
            const outdatedProjects = projectVersions.filter(({ currentVersion }) => {
                return (
                    currentVersion === 'unknown' ||
                    this.isNewerVersion(latestRelease.version, currentVersion)
                );
            });

            if (outdatedProjects.length > 0) {
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
     * Fetch latest release from GitHub based on channel
     * Stable: Latest non-prerelease
     * Beta: Latest release (including prereleases)
     */
    private async fetchLatestRelease(
        repo: string,
        channel: UpdateChannel,
    ): Promise<ReleaseInfo | null> {
        try {
            // For stable: use /releases/latest (non-prereleases only)
            // For beta: use /releases?per_page=20 (includes prereleases, need to sort)
            const url =
                channel === 'stable'
                    ? `${GITHUB_API_BASE}/repos/${repo}/releases/latest`
                    : `${GITHUB_API_BASE}/repos/${repo}/releases?per_page=20`;

            const headers = await buildGitHubHeaders(this.context.secrets);

            const response = await fetchWithTimeout(url, { headers });

            // HTTP status validation
            if (!response.ok) {
                if (response.status === 404) {
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

            // Stable returns a single object; beta/early-access return an array.
            // For arrays, pick the highest release the channel ACCEPTS by track
            // (beta excludes -alpha.*, early-access takes -alpha.* only).
            const release = Array.isArray(data) ? selectLatestForChannel(data, channel) : data;

            if (!release || release.message === 'Not Found') {
                return null;
            }

            // Find VSIX asset for extension, or source archive for components
            const isExtension = repo === this.EXTENSION_REPO;
            const downloadUrl = isExtension
                ? release.assets.find((a: GitHubReleaseAsset) => a.name.endsWith('.vsix'))
                      ?.browser_download_url
                : release.zipball_url;

            if (!downloadUrl) {
                return null;
            }

            // SECURITY: Validate GitHub download URL before returning
            if (!validateGitHubDownloadURL(downloadUrl)) {
                this.logger.warn(
                    `[Updates] Security check failed for download URL from ${repo}: ${downloadUrl}`,
                );
                return null;
            }

            const version = this.parseVersionFromTag(release.tag_name);

            return {
                version,
                downloadUrl,
                releaseNotes: release.body || 'No release notes available',
                publishedAt: release.published_at,
                isPrerelease: release.prerelease,
            };
        } catch (error) {
            // Graceful degradation: returning null means "no update available" which
            // is better UX than showing errors for transient network issues or GitHub outages.
            this.logger.debug(
                `[Updates] Release check failed for ${repo}: ${(error as Error).message}`,
            );
            return null;
        }
    }

    /**
     * Resolve a component's GitHub repository (owner/repo) using components.json
     * (primary) or the instance's stored repoUrl (fallback for components defined
     * in demo-packages.json).
     */
    private async resolveComponentRepository(
        componentId: string,
        instance?: { repoUrl?: string },
    ): Promise<string | null> {
        const repoInfo = await this.repositoryResolver.getRepositoryInfo(componentId);
        if (repoInfo) return repoInfo.repository;

        if (!instance?.repoUrl) return null;

        return this.repositoryResolver.extractRepositoryFromUrl(instance.repoUrl);
    }

    private getUpdateChannel(): UpdateChannel {
        return vscode.workspace
            .getConfiguration('demoBuilder')
            .get<UpdateChannel>('updateChannel', 'stable');
    }

    /**
     * Resolve the channel actually used for fetching. early-access is honored
     * only for verified repo collaborators; otherwise it falls back to beta.
     * Never throws (the gate itself fails closed).
     */
    private async resolveEffectiveChannel(configured: UpdateChannel): Promise<UpdateChannel> {
        if (configured !== 'early-access') return configured;
        try {
            const allowed = await isRepoCollaborator(this.context.secrets, this.logger);
            return allowed ? 'early-access' : 'beta';
        } catch {
            // Defensive: the gate fails closed internally, but never let an
            // unexpected error block the update check — fall back to beta.
            return 'beta';
        }
    }

    private isNewerVersion(latest: string, current: string): boolean {
        try {
            // semver.gt() properly handles: 1.0.0-beta.6 > 1.0.0-beta.5
            return semver.gt(latest, current);
        } catch {
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
