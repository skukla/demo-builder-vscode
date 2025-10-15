import * as vscode from 'vscode';
import * as semver from 'semver';
import { Project } from '../types';
import { Logger } from './logger';
import { TIMEOUTS } from './timeoutConfig';

interface ReleaseInfo {
  version: string;
  downloadUrl: string;
  releaseNotes: string;
  publishedAt: string;
  isPrerelease: boolean;
  commitSha?: string; // Git commit SHA for the release
}

interface UpdateCheckResult {
  hasUpdate: boolean;
  current: string;
  latest: string;
  releaseInfo?: ReleaseInfo;
}

export class UpdateManager {
  private logger: Logger;
  private context: vscode.ExtensionContext;
  
  // Repository configurations
  private readonly EXTENSION_REPO = 'skukla/demo-builder-vscode';
  private readonly COMPONENT_REPOS: Record<string, string> = {
    'citisignal-nextjs': 'skukla/citisignal-nextjs',
    'commerce-mesh': 'skukla/commerce-mesh',
    'integration-service': 'skukla/kukla-integration-service'
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
    
    this.logger.debug(`[Update] Checking for updates: current=${currentVersion}, channel=${channel}`);
    
    const latestRelease = await this.fetchLatestRelease(this.EXTENSION_REPO, channel);
    
    if (!latestRelease) {
      this.logger.debug(`[Update] No release found`);
      return { hasUpdate: false, current: currentVersion, latest: currentVersion };
    }
    
    this.logger.debug(`[Update] Latest release found: ${latestRelease.version}`);
    
    const hasUpdate = this.isNewerVersion(latestRelease.version, currentVersion);
    
    this.logger.debug(`[Update] Comparison: ${latestRelease.version} > ${currentVersion} = ${hasUpdate}`);
    
    return {
      hasUpdate,
      current: currentVersion,
      latest: latestRelease.version,
      releaseInfo: hasUpdate ? latestRelease : undefined
    };
  }

  /**
   * Check for component updates in current project (respects stable/beta channel)
   */
  async checkComponentUpdates(project: Project): Promise<Map<string, UpdateCheckResult>> {
    const results = new Map<string, UpdateCheckResult>();
    const channel = this.getUpdateChannel();
    
    if (!project.componentInstances) return results;
    
    for (const [componentId, instance] of Object.entries(project.componentInstances)) {
      const repoPath = this.COMPONENT_REPOS[componentId];
      if (!repoPath) continue; // Skip components without repos
      
      const currentVersion = project.componentVersions?.[componentId]?.version || 'unknown';
      
      // DEBUG: Log what we're working with
      this.logger.debug(`[Updates] Component ${componentId}:`);
      this.logger.debug(`[Updates]   - currentVersion: "${currentVersion}"`);
      this.logger.debug(`[Updates]   - instance: ${instance ? 'exists' : 'undefined'}`);
      if (instance) {
        this.logger.debug(`[Updates]   - instance.version: "${instance.version || 'undefined'}"`);
      }
      
      const latestRelease = await this.fetchLatestRelease(repoPath, channel);
      
      if (!latestRelease) {
        this.logger.debug(`[Updates]   - No release found on GitHub`);
        results.set(componentId, {
          hasUpdate: false,
          current: currentVersion,
          latest: currentVersion
        });
        continue;
      }
      
      this.logger.debug(`[Updates]   - latestRelease.version: "${latestRelease.version}"`);
      this.logger.debug(`[Updates]   - latestRelease.commitSha: "${latestRelease.commitSha || 'undefined'}"`);
      
      // Check if update is needed
      let hasUpdate = false;
      
      // Detect if current version is "unknown" or looks like a git SHA (40-char hex)
      const looksLikeGitSHA = /^[0-9a-f]{40}$/i.test(currentVersion);
      const isUnknownVersion = currentVersion === 'unknown' || looksLikeGitSHA;
      
      this.logger.debug(`[Updates]   - looksLikeGitSHA: ${looksLikeGitSHA}`);
      this.logger.debug(`[Updates]   - isUnknownVersion: ${isUnknownVersion}`);
      
      if (isUnknownVersion) {
        // For unknown versions or git SHAs, check actual git commit hash
        // If installed commit matches release commit, no update needed
        const installedCommit = instance?.version; // This is the git commit hash
        const releaseCommit = latestRelease.commitSha;
        
        this.logger.debug(`[Updates]   - installedCommit: "${installedCommit || 'undefined'}"`);
        this.logger.debug(`[Updates]   - releaseCommit: "${releaseCommit || 'undefined'}"`);
        this.logger.debug(`[Updates]   - Commits match: ${installedCommit && releaseCommit && installedCommit === releaseCommit}`);
        
        if (installedCommit && releaseCommit && installedCommit === releaseCommit) {
          // Already at this version, just update the tracking
          this.logger.debug(`[Updates] Component ${componentId} is already at ${latestRelease.version} (commit ${installedCommit.substring(0, 7)})`);
          
          // Update componentVersions to track properly going forward
          if (!project.componentVersions) {
            project.componentVersions = {};
          }
          project.componentVersions[componentId] = {
            version: latestRelease.version,
            lastUpdated: new Date().toISOString()
          };
          
          hasUpdate = false;
        } else {
          // Different commit or unknown, show as update available
          this.logger.debug(`[Updates]   - Result: SHOW UPDATE (commits don't match or missing)`);
          hasUpdate = true;
        }
      } else {
        // Known version, use semver comparison
        hasUpdate = this.isNewerVersion(latestRelease.version, currentVersion);
        this.logger.debug(`[Updates]   - Result: ${hasUpdate ? 'SHOW UPDATE' : 'NO UPDATE'} (semver comparison)`);
      }
      
      this.logger.debug(`[Updates]   - Final hasUpdate: ${hasUpdate}`);
      
      results.set(componentId, {
        hasUpdate,
        current: currentVersion,
        latest: latestRelease.version,
        releaseInfo: hasUpdate ? latestRelease : undefined
      });
    }
    
    return results;
  }

  /**
   * Fetch latest release from GitHub based on channel
   * Stable: Latest non-prerelease
   * Beta: Latest release (including prereleases)
   */
  private async fetchLatestRelease(repo: string, channel: 'stable' | 'beta'): Promise<ReleaseInfo | null> {
    try {
      // For stable: use /releases/latest (non-prereleases only)
      // For beta: fetch recent releases and find the highest version by semver
      const url = channel === 'stable'
        ? `https://api.github.com/repos/${repo}/releases/latest`
        : `https://api.github.com/repos/${repo}/releases?per_page=20`;
      
      this.logger.debug(`[Update] Fetching latest ${channel} release for ${repo}`);
      
      // Create timeout controller
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUTS.UPDATE_CHECK);
      
      try {
        const response = await fetch(url, { signal: controller.signal });
        const data = await response.json();
        
        // Beta channel returns array, stable returns object
        let release;
        if (Array.isArray(data)) {
          // For beta: find the latest version by semver, not by GitHub's order
          const nonDraftReleases = data.filter((r: any) => !r.draft);
          if (nonDraftReleases.length === 0) return null;
          
          // Sort by version using semver
          release = nonDraftReleases.sort((a: any, b: any) => {
            const versionA = a.tag_name.replace(/^v/, '');
            const versionB = b.tag_name.replace(/^v/, '');
            return semver.gt(versionA, versionB) ? -1 : 1;
          })[0];
        } else {
          release = data;
        }
        
        if (!release || release.message === 'Not Found') {
          this.logger.debug(`[Update] No releases found for ${repo}`);
          return null;
        }
        
        // Find VSIX asset for extension, or source archive for components
        const isExtension = repo === this.EXTENSION_REPO;
        const asset = isExtension
          ? release.assets.find((a: any) => a.name.endsWith('.vsix'))
          : release.zipball_url;
        
        if (!asset) {
          this.logger.debug(`[Update] No valid asset found in release for ${repo}`);
          return null;
        }
        
        return {
          version: release.tag_name.replace(/^v/, ''),
          downloadUrl: isExtension ? asset.browser_download_url : release.zipball_url,
          releaseNotes: release.body || 'No release notes available',
          publishedAt: release.published_at,
          isPrerelease: release.prerelease,
          commitSha: release.target_commitish // Git commit SHA
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      this.logger.debug(`[Update] Failed to fetch release for ${repo}:`, error);
      return null;
    }
  }

  private getUpdateChannel(): 'stable' | 'beta' {
    return vscode.workspace.getConfiguration('demoBuilder')
      .get<'stable' | 'beta'>('updateChannel', 'stable');
  }

  private isNewerVersion(latest: string, current: string): boolean {
    try {
      // Use semver for proper version comparison including prerelease tags
      // semver.gt() properly handles: 1.0.0-beta.6 > 1.0.0-beta.5
      return semver.gt(latest, current);
    } catch (error) {
      this.logger.debug(`[Update] Version comparison failed: ${error}`);
      return false;
    }
  }
}

