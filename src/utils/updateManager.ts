import * as vscode from 'vscode';
import { Project } from '../types';
import { Logger } from './logger';
import { TIMEOUTS } from './timeoutConfig';

interface ReleaseInfo {
  version: string;
  downloadUrl: string;
  releaseNotes: string;
  publishedAt: string;
  isPrerelease: boolean;
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
  private readonly EXTENSION_REPO = 'adobe/demo-builder-vscode';
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
    
    const latestRelease = await this.fetchLatestRelease(this.EXTENSION_REPO, channel);
    
    if (!latestRelease) {
      return { hasUpdate: false, current: currentVersion, latest: currentVersion };
    }
    
    const hasUpdate = this.isNewerVersion(latestRelease.version, currentVersion);
    
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
      const latestRelease = await this.fetchLatestRelease(repoPath, channel);
      
      if (!latestRelease) {
        results.set(componentId, {
          hasUpdate: false,
          current: currentVersion,
          latest: currentVersion
        });
        continue;
      }
      
      const hasUpdate = currentVersion === 'unknown' || 
                        this.isNewerVersion(latestRelease.version, currentVersion);
      
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
      // For beta: use /releases?per_page=1 (includes prereleases)
      const url = channel === 'stable'
        ? `https://api.github.com/repos/${repo}/releases/latest`
        : `https://api.github.com/repos/${repo}/releases?per_page=1`;
      
      this.logger.debug(`[Update] Fetching latest ${channel} release for ${repo}`);
      
      // Create timeout controller
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUTS.UPDATE_CHECK);
      
      try {
        const response = await fetch(url, { signal: controller.signal });
        const data = await response.json();
        
        // Beta channel returns array, stable returns object
        const release = Array.isArray(data) ? data[0] : data;
        
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
          isPrerelease: release.prerelease
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
    const parseVersion = (v: string) => {
      const parts = v.split('.').map(n => parseInt(n, 10));
      return parts.length === 3 ? parts : [0, 0, 0];
    };
    
    const [latestMajor, latestMinor, latestPatch] = parseVersion(latest);
    const [currentMajor, currentMinor, currentPatch] = parseVersion(current);
    
    if (latestMajor > currentMajor) return true;
    if (latestMajor < currentMajor) return false;
    if (latestMinor > currentMinor) return true;
    if (latestMinor < currentMinor) return false;
    return latestPatch > currentPatch;
  }
}

