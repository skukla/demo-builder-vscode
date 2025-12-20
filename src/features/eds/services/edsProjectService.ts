/**
 * EDS Project Service
 *
 * Orchestrates complete EDS (Edge Delivery Services) project setup including:
 * 1. GitHub repository creation from CitiSignal template
 * 2. Repository cloning to local path
 * 3. Helix 5 configuration via Configuration Service API
 * 4. Code Bus synchronization verification
 * 5. DA.live content population from CitiSignal
 * 6. Commerce demo ingestion tool cloning
 * 7. Environment file (.env) generation
 *
 * Follows phase-based setup pattern from meshSetupService.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getLogger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { ComponentManager } from '@/features/components/services/componentManager';
import type { DaLiveService } from './daLiveService';
import type { GitHubService } from './githubService';
import {
    EdsProjectError,
    type EdsProjectConfig,
    type EdsProjectSetupResult,
    type EdsProgressCallback,
    type EdsSetupPhase,
    type GitHubRepo,
} from './types';

// ==========================================================
// Constants
// ==========================================================

/** CitiSignal template repository details */
const CITISIGNAL_TEMPLATE = {
    owner: 'skukla',
    repo: 'citisignal-one',
};

/** Commerce demo ingestion tool component definition */
const INGESTION_TOOL_DEF = {
    id: 'commerce-demo-ingestion',
    name: 'Commerce Demo Ingestion',
    type: 'tool' as const,
    source: {
        type: 'git' as const,
        url: 'https://github.com/hlxsites/commerce-demo-ingestion.git',
    },
};

/** Helix Configuration Service base URL */
const HELIX_CONFIG_URL = 'https://admin.hlx.page/config';

/** Helix Code Bus status URL */
const HELIX_CODE_URL = 'https://admin.hlx.page/code';

/** Maximum code sync polling attempts */
const MAX_CODE_SYNC_ATTEMPTS = 25;

/** Default branch name */
const DEFAULT_BRANCH = 'main';

/** Progress percentages for each phase (cumulative) */
const PROGRESS = {
    GITHUB_REPO: { start: 0, end: 15 },
    GITHUB_CLONE: { start: 15, end: 25 },
    HELIX_CONFIG: { start: 25, end: 40 },
    CODE_SYNC: { start: 40, end: 55 },
    DALIVE_CONTENT: { start: 55, end: 70 },
    TOOLS_CLONE: { start: 70, end: 85 },
    ENV_CONFIG: { start: 85, end: 95 },
    COMPLETE: 100,
} as const;

// ==========================================================
// EDS Project Service
// ==========================================================

/**
 * EDS Project Service for complete project setup orchestration
 */
export class EdsProjectService {
    private logger = getLogger();
    private githubService: GitHubService;
    private daLiveService: DaLiveService;
    private authService: AuthenticationService;
    private componentManager: ComponentManager;

    constructor(
        githubService: GitHubService,
        daLiveService: DaLiveService,
        authService: AuthenticationService,
        componentManager: ComponentManager,
    ) {
        if (!githubService) {
            throw new Error('GitHubService is required');
        }
        if (!daLiveService) {
            throw new Error('DaLiveService is required');
        }
        if (!authService) {
            throw new Error('AuthenticationService is required');
        }
        if (!componentManager) {
            throw new Error('ComponentManager is required');
        }

        this.githubService = githubService;
        this.daLiveService = daLiveService;
        this.authService = authService;
        this.componentManager = componentManager;
    }

    // ==========================================================
    // Main Setup Orchestration
    // ==========================================================

    /**
     * Setup a complete EDS project
     * Executes all phases in sequence, stopping on first failure
     *
     * Supports three modes:
     * 1. New repository - creates from template (default)
     * 2. Existing repository (use as-is) - skips creation, uses existing repo
     * 3. Existing repository (repurpose) - deletes and recreates with template
     *
     * @param config - Project configuration
     * @param progressCallback - Optional callback for progress updates
     * @returns Setup result with success status and URLs
     */
    async setupProject(
        config: EdsProjectConfig,
        progressCallback?: EdsProgressCallback,
    ): Promise<EdsProjectSetupResult> {
        this.logger.info(`[EDS] Starting project setup: ${config.projectName}`);

        let repoUrl: string | undefined;
        let createdRepo: GitHubRepo | undefined;

        // Helper to report progress
        const reportProgress = (phase: EdsSetupPhase, progress: number, message: string) => {
            if (progressCallback) {
                progressCallback(phase, progress, message);
            }
        };

        try {
            // Determine repository mode
            const isExistingRepo = config.repoMode === 'existing' && config.existingRepo;
            const isRepurpose = isExistingRepo && config.resetToTemplate;

            // Phase 1: Get or create GitHub repository
            if (isRepurpose) {
                // Repurpose flow: cleanup existing, then create new
                reportProgress('github-repo', PROGRESS.GITHUB_REPO.start, 'Cleaning up existing repository...');
                await this.cleanupForRepurpose(config);
                reportProgress('github-repo', 7, 'Creating new repository from template...');
                createdRepo = await this.createGitHubRepository(config);
                repoUrl = createdRepo.htmlUrl;
                reportProgress('github-repo', PROGRESS.GITHUB_REPO.end, 'Repository recreated');
            } else if (isExistingRepo) {
                // Use existing repo as-is
                reportProgress('github-repo', PROGRESS.GITHUB_REPO.start, 'Fetching existing repository...');
                createdRepo = await this.getExistingRepository(config);
                repoUrl = createdRepo.htmlUrl;
                reportProgress('github-repo', PROGRESS.GITHUB_REPO.end, 'Repository found');
            } else {
                // Create new repository from template (default)
                reportProgress('github-repo', PROGRESS.GITHUB_REPO.start, 'Creating GitHub repository...');
                createdRepo = await this.createGitHubRepository(config);
                repoUrl = createdRepo.htmlUrl;
                reportProgress('github-repo', PROGRESS.GITHUB_REPO.end, 'Repository created');
            }

            // Phase 2: Clone repository locally
            reportProgress('github-clone', PROGRESS.GITHUB_CLONE.start, 'Cloning repository...');
            await this.cloneRepository(createdRepo, config);
            reportProgress('github-clone', PROGRESS.GITHUB_CLONE.end, 'Repository cloned');

            // Phase 3: Configure Helix 5
            reportProgress('helix-config', PROGRESS.HELIX_CONFIG.start, 'Configuring Helix 5...');
            await this.configureHelix(config, createdRepo);
            reportProgress('helix-config', PROGRESS.HELIX_CONFIG.end, 'Helix configured');

            // Phase 4: Verify Code Bus sync
            reportProgress('code-sync', PROGRESS.CODE_SYNC.start, 'Verifying code sync...');
            await this.verifyCodeSync(config, createdRepo);
            reportProgress('code-sync', PROGRESS.CODE_SYNC.end, 'Code synced');

            // Phase 5: Populate DA.live content (unless skipped)
            if (!config.skipContent) {
                reportProgress('dalive-content', PROGRESS.DALIVE_CONTENT.start, 'Copying content to DA.live...');
                const contentRange = PROGRESS.DALIVE_CONTENT.end - PROGRESS.DALIVE_CONTENT.start;
                await this.populateDaLiveContent(config, (progress) => {
                    const progressValue = PROGRESS.DALIVE_CONTENT.start + Math.round(progress.percentage * contentRange / 100);
                    reportProgress('dalive-content', progressValue, `Copying content: ${progress.percentage}%`);
                });
                reportProgress('dalive-content', PROGRESS.DALIVE_CONTENT.end, 'Content copied');
            } else {
                reportProgress('dalive-content', PROGRESS.DALIVE_CONTENT.end, 'Content copy skipped');
            }

            // Phase 6: Clone ingestion tool (unless skipped)
            if (!config.skipTools) {
                reportProgress('tools-clone', PROGRESS.TOOLS_CLONE.start, 'Cloning ingestion tool...');
                await this.cloneIngestionTool(config);
                reportProgress('tools-clone', PROGRESS.TOOLS_CLONE.end, 'Tool cloned');
            } else {
                reportProgress('tools-clone', PROGRESS.TOOLS_CLONE.end, 'Tool clone skipped');
            }

            // Phase 7: Generate .env file
            reportProgress('env-config', PROGRESS.ENV_CONFIG.start, 'Generating environment configuration...');
            await this.generateEnvFile(config, createdRepo);
            reportProgress('env-config', PROGRESS.ENV_CONFIG.end, 'Environment configured');

            // Complete
            reportProgress('complete', PROGRESS.COMPLETE, 'Setup complete!');

            // Use repo info for URLs (handles both new and existing repos correctly)
            const [owner, repoNameFromRepo] = createdRepo.fullName.split('/');
            const previewUrl = this.generatePreviewUrl(owner, repoNameFromRepo);
            const liveUrl = this.generateLiveUrl(owner, repoNameFromRepo);

            this.logger.info(`[EDS] Project setup complete: ${config.projectName}`);

            return {
                success: true,
                repoUrl,
                previewUrl,
                liveUrl,
            };
        } catch (error) {
            const err = error as Error;
            const phase = this.getFailedPhase(err);

            this.logger.error(`[EDS] Project setup failed at phase: ${phase}`, err);

            return {
                success: false,
                error: err.message,
                phase,
                repoUrl, // Include for rollback info
            };
        }
    }

    // ==========================================================
    // Phase Implementations
    // ==========================================================

    /**
     * Phase 1: Create GitHub repository from CitiSignal template
     */
    private async createGitHubRepository(config: EdsProjectConfig): Promise<GitHubRepo> {
        this.logger.debug(`[EDS] Creating repository: ${config.repoName}`);

        try {
            const repo = await this.githubService.createFromTemplate(
                CITISIGNAL_TEMPLATE.owner,
                CITISIGNAL_TEMPLATE.repo,
                config.repoName,
                config.isPrivate ?? false,
            );

            this.logger.debug(`[EDS] Repository created: ${repo.fullName}`);
            return repo;
        } catch (error) {
            throw new EdsProjectError(
                `Failed to create repository: ${(error as Error).message}`,
                'github-repo',
                error as Error,
            );
        }
    }

    /**
     * Get existing repository information
     * Used when repoMode is 'existing' and not repurposing
     */
    private async getExistingRepository(config: EdsProjectConfig): Promise<GitHubRepo> {
        if (!config.existingRepo) {
            throw new EdsProjectError('Existing repository not specified', 'github-repo');
        }

        const [owner, repoName] = config.existingRepo.split('/');
        if (!owner || !repoName) {
            throw new EdsProjectError('Invalid repository format. Use owner/repo', 'github-repo');
        }

        this.logger.debug(`[EDS] Fetching existing repository: ${config.existingRepo}`);

        try {
            const repo = await this.githubService.getRepository(owner, repoName);
            this.logger.debug(`[EDS] Existing repository found: ${repo.fullName}`);
            return repo;
        } catch (error) {
            throw new EdsProjectError(
                `Failed to access repository: ${(error as Error).message}`,
                'github-repo',
                error as Error,
            );
        }
    }

    /**
     * Clean up existing resources for repurpose flow
     * Deletes the existing repository and DA.live content before recreating
     */
    private async cleanupForRepurpose(config: EdsProjectConfig): Promise<void> {
        if (!config.existingRepo) {
            throw new EdsProjectError('Existing repository not specified', 'github-repo');
        }

        const [owner, repoName] = config.existingRepo.split('/');
        if (!owner || !repoName) {
            throw new EdsProjectError('Invalid repository format. Use owner/repo', 'github-repo');
        }

        this.logger.info(`[EDS] Repurpose cleanup for: ${config.existingRepo}`);

        // Delete existing GitHub repository
        try {
            this.logger.debug(`[EDS] Deleting repository: ${config.existingRepo}`);
            await this.githubService.deleteRepository(owner, repoName);
            this.logger.debug(`[EDS] Repository deleted`);
        } catch (error) {
            // If delete fails (e.g., missing scope), throw and stop
            throw new EdsProjectError(
                `Failed to delete repository: ${(error as Error).message}`,
                'github-repo',
                error as Error,
            );
        }

        // Delete existing DA.live content (if org/site specified)
        if (config.daLiveOrg && config.daLiveSite) {
            try {
                this.logger.debug(`[EDS] Deleting DA.live content: ${config.daLiveOrg}/${config.daLiveSite}`);
                await this.daLiveService.deleteSite(config.daLiveOrg, config.daLiveSite);
                this.logger.debug(`[EDS] DA.live content deleted`);
            } catch (error) {
                // Log but don't fail - DA.live content may not exist
                this.logger.warn(`[EDS] Failed to delete DA.live content: ${(error as Error).message}`);
            }
        }

        // Update config to use the same repo name for recreation
        // This ensures the new repo has the same name as the deleted one
        config.repoName = repoName;
        config.githubOwner = owner;
    }

    /**
     * Phase 2: Clone repository to local path
     */
    private async cloneRepository(repo: GitHubRepo, config: EdsProjectConfig): Promise<void> {
        this.logger.debug(`[EDS] Cloning repository to: ${config.projectPath}`);

        try {
            await this.githubService.cloneRepository(repo.cloneUrl, config.projectPath);
            this.logger.debug(`[EDS] Repository cloned successfully`);
        } catch (error) {
            throw new EdsProjectError(
                `Failed to clone repository: ${(error as Error).message}`,
                'github-clone',
                error as Error,
            );
        }
    }

    /**
     * Phase 3: Configure Helix 5 via Configuration Service API
     */
    private async configureHelix(config: EdsProjectConfig, repo: GitHubRepo): Promise<void> {
        this.logger.debug(`[EDS] Configuring Helix 5 for: ${repo.fullName}`);

        try {
            const token = await this.getImsToken();
            const configUrl = `${HELIX_CONFIG_URL}/${config.githubOwner}/${config.repoName}/${DEFAULT_BRANCH}`;

            const configBody = {
                contentBusId: `${config.daLiveOrg}/${config.daLiveSite}`,
                mountpoints: {
                    '/': `https://content.da.live/${config.daLiveOrg}/${config.daLiveSite}/`,
                },
            };

            const response = await fetch(configUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(configBody),
                signal: AbortSignal.timeout(TIMEOUTS.EDS_HELIX_CONFIG),
            });

            if (!response.ok) {
                throw new Error(`Helix config API returned ${response.status}`);
            }

            this.logger.debug(`[EDS] Helix 5 configured successfully`);
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes('timeout') || message.includes('abort')) {
                throw new EdsProjectError('Helix configuration timeout', 'helix-config', error as Error);
            }
            throw new EdsProjectError(
                `Failed to configure Helix: ${message}`,
                'helix-config',
                error as Error,
            );
        }
    }

    /**
     * Phase 4: Verify Code Bus synchronization via polling
     */
    private async verifyCodeSync(config: EdsProjectConfig, repo: GitHubRepo): Promise<void> {
        this.logger.debug(`[EDS] Verifying code sync for: ${repo.fullName}`);

        const codeUrl = `${HELIX_CODE_URL}/${config.githubOwner}/${config.repoName}/${DEFAULT_BRANCH}/scripts/aem.js`;
        const pollInterval = TIMEOUTS.EDS_CODE_SYNC_POLL;
        const maxAttempts = MAX_CODE_SYNC_ATTEMPTS;

        let attempts = 0;

        while (attempts < maxAttempts) {
            attempts++;

            try {
                const response = await fetch(codeUrl, {
                    method: 'GET',
                    signal: AbortSignal.timeout(pollInterval),
                });

                if (response.ok) {
                    this.logger.debug(`[EDS] Code synced after ${attempts} attempts`);
                    return;
                }

                // 404 means not synced yet - continue polling
                if (response.status === 404) {
                    this.logger.debug(`[EDS] Code not synced yet, attempt ${attempts}/${maxAttempts}`);
                }
            } catch {
                // Network error - continue polling
                this.logger.debug(`[EDS] Code sync poll failed, attempt ${attempts}/${maxAttempts}`);
            }

            // Wait before next poll (unless last attempt)
            if (attempts < maxAttempts) {
                await this.delay(pollInterval);
            }
        }

        // Timeout - max attempts reached
        throw new EdsProjectError(
            `Code sync timeout after ${maxAttempts} attempts`,
            'code-sync',
        );
    }

    /**
     * Phase 5: Populate DA.live with CitiSignal content
     */
    private async populateDaLiveContent(
        config: EdsProjectConfig,
        progressCallback?: (progress: { percentage: number }) => void,
    ): Promise<void> {
        this.logger.debug(`[EDS] Populating DA.live content: ${config.daLiveOrg}/${config.daLiveSite}`);

        try {
            const result = await this.daLiveService.copyCitisignalContent(
                config.daLiveOrg,
                config.daLiveSite,
                progressCallback ? (progress) => {
                    progressCallback({ percentage: progress.percentage });
                } : undefined,
            );

            if (!result.success) {
                const failedCount = result.failedFiles.length;
                throw new Error(`Content copy failed: ${failedCount} files failed`);
            }

            this.logger.debug(`[EDS] DA.live content populated: ${result.totalFiles} files`);
        } catch (error) {
            throw new EdsProjectError(
                `Failed to populate DA.live content: ${(error as Error).message}`,
                'dalive-content',
                error as Error,
            );
        }
    }

    /**
     * Phase 6: Clone commerce-demo-ingestion tool
     */
    private async cloneIngestionTool(config: EdsProjectConfig): Promise<void> {
        this.logger.debug(`[EDS] Cloning ingestion tool`);

        try {
            // Create a minimal project object for ComponentManager
            const toolsProject = {
                path: path.join(config.projectPath, 'tools'),
                name: config.projectName,
                componentInstances: {},
            };

            // Ensure tools directory exists
            await fs.mkdir(toolsProject.path, { recursive: true });

            const result = await this.componentManager.installComponent(
                toolsProject as any,
                INGESTION_TOOL_DEF as any,
                { skipDependencies: true },
            );

            if (!result.success) {
                throw new Error(result.error || 'Tool installation failed');
            }

            this.logger.debug(`[EDS] Ingestion tool cloned successfully`);
        } catch (error) {
            throw new EdsProjectError(
                `Failed to clone ingestion tool: ${(error as Error).message}`,
                'tools-clone',
                error as Error,
            );
        }
    }

    /**
     * Phase 7: Generate .env file with project configuration
     */
    private async generateEnvFile(config: EdsProjectConfig, repo: GitHubRepo): Promise<void> {
        this.logger.debug(`[EDS] Generating .env file`);

        const envPath = path.join(config.projectPath, '.env');

        try {
            // Check if .env already exists
            await fs.access(envPath);
            this.logger.debug(`[EDS] .env file already exists, skipping generation`);
            return;
        } catch {
            // File doesn't exist - create it
        }

        const previewUrl = this.generatePreviewUrl(config.githubOwner, config.repoName);
        const liveUrl = this.generateLiveUrl(config.githubOwner, config.repoName);

        const envContent = `# EDS Project Configuration
# Generated by Adobe Demo Builder

# ACCS (Adobe Commerce) Configuration
ACCS_ENDPOINT=${config.accsEndpoint}

# DA.live Configuration
DA_LIVE_ORG=${config.daLiveOrg}
DA_LIVE_SITE=${config.daLiveSite}

# Helix URLs
PREVIEW_URL=${previewUrl}
LIVE_URL=${liveUrl}

# GitHub Repository
GITHUB_OWNER=${config.githubOwner}
GITHUB_REPO=${config.repoName}
REPO_URL=${repo.htmlUrl}
`;

        try {
            await fs.writeFile(envPath, envContent, 'utf-8');
            this.logger.debug(`[EDS] .env file generated`);
        } catch (error) {
            throw new EdsProjectError(
                `Failed to generate .env file: ${(error as Error).message}`,
                'env-config',
                error as Error,
            );
        }
    }

    // ==========================================================
    // Helper Methods
    // ==========================================================

    /**
     * Get IMS token from AuthenticationService
     */
    private async getImsToken(): Promise<string> {
        const tokenManager = this.authService.getTokenManager();
        const token = await tokenManager.getAccessToken();

        if (!token) {
            throw new Error('Not authenticated with Adobe IMS');
        }

        return token;
    }

    /**
     * Generate preview URL for the project
     */
    private generatePreviewUrl(owner: string, repo: string): string {
        return `https://${DEFAULT_BRANCH}--${repo}--${owner}.aem.page`;
    }

    /**
     * Generate live URL for the project
     */
    private generateLiveUrl(owner: string, repo: string): string {
        return `https://${DEFAULT_BRANCH}--${repo}--${owner}.aem.live`;
    }

    /**
     * Delay execution for specified milliseconds
     */
    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Extract phase from EdsProjectError or determine from error context
     */
    private getFailedPhase(error: Error): EdsSetupPhase {
        if (error instanceof EdsProjectError) {
            return error.phase;
        }
        // Default to github-repo if phase cannot be determined
        return 'github-repo';
    }
}
