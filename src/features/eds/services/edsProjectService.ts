import * as fs from 'fs/promises';
import * as path from 'path';

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
 * This service composes specialized phase classes:
 * - GitHubRepoPhase: Repository operations
 * - HelixConfigPhase: Helix configuration and code sync
 * - ContentPhase: DA.live content and tool installation
 * - EnvConfigPhase: Environment file generation
 */

import { getLogger } from '@/core/logging';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { ComponentManager } from '@/features/components/services/componentManager';
import type { Logger } from '@/types/logger';
import type { DaLiveOrgOperations } from './daLiveOrgOperations';
import type { DaLiveContentOperations } from './daLiveContentOperations';
import { GitHubAppNotInstalledError } from './types';
import type { GitHubTokenService } from './githubTokenService';
import type { GitHubRepoOperations } from './githubRepoOperations';
import type { GitHubFileOperations } from './githubFileOperations';
import {
    EdsProjectError,
    type EdsProjectConfig,
    type EdsProjectSetupResult,
    type EdsProgressCallback,
    type EdsSetupPhase,
    type GitHubRepo,
} from './types';
import {
    GitHubRepoPhase,
    HelixConfigPhase,
    ContentPhase,
    EnvConfigPhase,
    generatePreviewUrl,
    generateLiveUrl,
} from './edsSetupPhases';
import { GitHubAppService } from './githubAppService';
import { HelixService } from './helixService';

// Re-export phase classes for direct use
export { GitHubRepoPhase, HelixConfigPhase, ContentPhase, EnvConfigPhase } from './edsSetupPhases';

/** Progress percentages for each phase (cumulative) */
const PROGRESS = {
    GITHUB_REPO: { start: 0, end: 15 },
    GITHUB_CLONE: { start: 15, end: 25 },
    HELIX_CONFIG: { start: 25, end: 35 },
    CODE_SYNC: { start: 35, end: 45 },
    DALIVE_CONTENT: { start: 45, end: 60 },
    CONTENT_PUBLISH: { start: 60, end: 70 },
    TOOLS_CLONE: { start: 70, end: 80 },
    ENV_CONFIG: { start: 80, end: 95 },
    COMPLETE: 100,
} as const;

/**
 * GitHub services for EDS project setup
 */
export interface GitHubServicesForProject {
    tokenService: GitHubTokenService;
    repoOperations: GitHubRepoOperations;
    fileOperations: GitHubFileOperations;
}

/**
 * DA.live services for EDS project setup
 */
export interface DaLiveServicesForProject {
    orgOperations: DaLiveOrgOperations;
    contentOperations: DaLiveContentOperations;
}

/**
 * EDS Project Service for complete project setup orchestration
 */
export class EdsProjectService {
    private logger: Logger;
    private githubPhase: GitHubRepoPhase;
    private helixPhase: HelixConfigPhase;
    private contentPhase: ContentPhase;
    private envPhase: EnvConfigPhase;
    private fileOperations: GitHubFileOperations;
    private helixService: HelixService;

    /**
     * Create an EdsProjectService
     */
    constructor(
        githubServices: GitHubServicesForProject,
        daLiveServices: DaLiveServicesForProject,
        authService: AuthenticationService,
        componentManager: ComponentManager,
        logger?: Logger,
    ) {
        if (!githubServices) throw new Error('GitHubService is required');
        if (!daLiveServices) throw new Error('DaLiveService is required');
        if (!authService) throw new Error('AuthenticationService is required');
        if (!componentManager) throw new Error('ComponentManager is required');

        this.logger = logger ?? getLogger();

        // Store file operations for pushing config.json to GitHub
        this.fileOperations = githubServices.fileOperations;

        // Create GitHubAppService for app installation detection
        const githubAppService = new GitHubAppService(githubServices.tokenService, this.logger);

        // Initialize phase handlers
        this.githubPhase = new GitHubRepoPhase(githubServices, daLiveServices.orgOperations, this.logger);
        this.helixPhase = new HelixConfigPhase(authService, this.logger, githubAppService, this.fileOperations);
        this.contentPhase = new ContentPhase(daLiveServices.contentOperations, componentManager, this.logger);
        this.envPhase = new EnvConfigPhase(this.logger);

        // Initialize Helix service for content publish operations
        // Helix Admin API uses GitHub authentication, not IMS tokens
        this.helixService = new HelixService(authService, this.logger, githubServices.tokenService);
    }

    /**
     * Setup a complete EDS project
     * Executes all phases in sequence, stopping on first failure
     */
    async setupProject(
        config: EdsProjectConfig,
        progressCallback?: EdsProgressCallback,
    ): Promise<EdsProjectSetupResult> {
        this.logger.info(`[EDS] Starting project setup: ${config.projectName}`);

        let repoUrl: string | undefined;
        let createdRepo: GitHubRepo | undefined;

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
                reportProgress('github-repo', PROGRESS.GITHUB_REPO.start, 'Cleaning up existing repository...');
                await this.githubPhase.cleanupForRepurpose(config);
                reportProgress('github-repo', 7, 'Creating new repository from template...');
                createdRepo = await this.githubPhase.createFromTemplate(config);
                repoUrl = createdRepo.htmlUrl;
                reportProgress('github-repo', PROGRESS.GITHUB_REPO.end, 'Repository recreated');
            } else if (isExistingRepo) {
                reportProgress('github-repo', PROGRESS.GITHUB_REPO.start, 'Fetching existing repository...');
                createdRepo = await this.githubPhase.getExisting(config);
                repoUrl = createdRepo.htmlUrl;
                reportProgress('github-repo', PROGRESS.GITHUB_REPO.end, 'Repository found');
            } else {
                reportProgress('github-repo', PROGRESS.GITHUB_REPO.start, 'Creating GitHub repository...');
                createdRepo = await this.githubPhase.createFromTemplate(config);
                repoUrl = createdRepo.htmlUrl;
                reportProgress('github-repo', PROGRESS.GITHUB_REPO.end, 'Repository created');
            }

            // Phase 2: Clone repository locally
            await this.githubPhase.clone(createdRepo, config, (msg) => {
                reportProgress('github-clone', PROGRESS.GITHUB_CLONE.start, msg);
            });
            reportProgress('github-clone', PROGRESS.GITHUB_CLONE.end, 'Repository cloned and verified');

            // Phase 3: Configure Helix 5
            await this.helixPhase.configure(config, createdRepo, (msg) => {
                reportProgress('helix-config', PROGRESS.HELIX_CONFIG.start, msg);
            });
            reportProgress('helix-config', PROGRESS.HELIX_CONFIG.end, 'Helix configured and verified');

            // Phase 4: Verify Code Bus sync
            await this.helixPhase.verifyCodeSync(config, createdRepo, (msg) => {
                reportProgress('code-sync', PROGRESS.CODE_SYNC.start, msg);
            });
            reportProgress('code-sync', PROGRESS.CODE_SYNC.end, 'Code synced');

            // Phase 5: Populate DA.live content (unless skipped)
            if (!config.skipContent) {
                reportProgress('dalive-content', PROGRESS.DALIVE_CONTENT.start, 'Copying content to DA.live...');
                const contentRange = PROGRESS.DALIVE_CONTENT.end - PROGRESS.DALIVE_CONTENT.start;
                await this.contentPhase.populateDaLiveContent(config, (progress) => {
                    const progressValue = PROGRESS.DALIVE_CONTENT.start + Math.round(progress.percentage * contentRange / 100);
                    reportProgress('dalive-content', progressValue, `Copying content: ${progress.percentage}%`);
                });
                reportProgress('dalive-content', PROGRESS.DALIVE_CONTENT.end, 'Content copied');
            } else {
                reportProgress('dalive-content', PROGRESS.DALIVE_CONTENT.end, 'Content copy skipped');
            }

            // Phase 5.5: Publish all content to CDN (unless content was skipped)
            // This syncs the DA.live content to the Helix CDN so the site is immediately accessible
            if (!config.skipContent) {
                reportProgress('content-publish', PROGRESS.CONTENT_PUBLISH.start, 'Publishing all content to CDN...');
                await this.helixService.publishAllSiteContent(createdRepo.fullName);
                reportProgress('content-publish', PROGRESS.CONTENT_PUBLISH.end, 'All content published');
            } else {
                reportProgress('content-publish', PROGRESS.CONTENT_PUBLISH.end, 'Content publish skipped');
            }

            // Phase 6: Clone ingestion tool (unless skipped)
            if (!config.skipTools) {
                reportProgress('tools-clone', PROGRESS.TOOLS_CLONE.start, 'Cloning ingestion tool...');
                await this.contentPhase.cloneIngestionTool(config);
                reportProgress('tools-clone', PROGRESS.TOOLS_CLONE.end, 'Tool cloned');
            } else {
                reportProgress('tools-clone', PROGRESS.TOOLS_CLONE.end, 'Tool clone skipped');
            }

            // Phase 7: Generate EDS-specific configuration
            reportProgress('env-config', PROGRESS.ENV_CONFIG.start, 'Generating EDS configuration...');

            // Generate config.json for PaaS projects (required for EDS runtime)
            // NOTE: Standard .env generation happens in Phase 4 via generateComponentEnvFile()
            await this.envPhase.generateConfigJson(config);

            // Push config.json to GitHub for EDS runtime to access
            // The EDS runtime serves config.json from the repository, not from local filesystem
            const isPaasBackend = config.backendComponentId === 'adobe-commerce-paas';
            if (isPaasBackend) {
                await this.pushConfigJsonToGitHub(config, createdRepo);
            }

            reportProgress('env-config', PROGRESS.ENV_CONFIG.end, 'EDS configuration complete');

            // Complete
            reportProgress('complete', PROGRESS.COMPLETE, 'Setup complete!');

            const [owner, repoNameFromRepo] = createdRepo.fullName.split('/');
            const previewUrl = generatePreviewUrl(owner, repoNameFromRepo);
            const liveUrl = generateLiveUrl(owner, repoNameFromRepo);

            this.logger.info(`[EDS] Project setup complete: ${config.projectName}`);

            return {
                success: true,
                repoUrl,
                previewUrl,
                liveUrl,
            };
        } catch (error) {
            const err = error as Error;
            
            // Re-throw GitHubAppNotInstalledError so executor can handle it
            // This error requires user interaction (installing the GitHub app)
            if (err instanceof GitHubAppNotInstalledError) {
                throw err;
            }

            const phase = this.getFailedPhase(err);

            this.logger.error(`[EDS] Project setup failed at phase: ${phase}`, err);

            return {
                success: false,
                error: err.message,
                phase,
                repoUrl,
            };
        }
    }

    /**
     * Push config.json to GitHub repository
     *
     * The EDS runtime serves config.json from the GitHub repository, not from local filesystem.
     * After generating config.json locally, we need to push it to GitHub for the site to work.
     */
    private async pushConfigJsonToGitHub(
        config: EdsProjectConfig,
        repo: GitHubRepo,
    ): Promise<void> {
        const configJsonPath = path.join(config.componentPath, 'config.json');

        try {
            // Read the locally generated config.json
            const content = await fs.readFile(configJsonPath, 'utf-8');

            // Extract owner and repo name from full name
            const [owner, repoName] = repo.fullName.split('/');

            this.logger.info(`[EDS] Pushing config.json to GitHub: ${owner}/${repoName}`);

            // Check if config.json already exists in the repo (to get SHA for update)
            const existingFile = await this.fileOperations.getFileContent(owner, repoName, 'config.json');
            const sha = existingFile?.sha;

            // Create or update config.json in the repository
            await this.fileOperations.createOrUpdateFile(
                owner,
                repoName,
                'config.json',
                content,
                'chore: configure config.json for commerce integration',
                sha,
            );

            this.logger.info('[EDS] config.json pushed to GitHub successfully');
        } catch (error) {
            throw new EdsProjectError(
                `Failed to push config.json to GitHub: ${(error as Error).message}`,
                'env-config',
                error as Error,
            );
        }
    }

    /**
     * Extract phase from EdsProjectError or determine from error context
     */
    private getFailedPhase(error: Error): EdsSetupPhase {
        if (error instanceof EdsProjectError) {
            return error.phase;
        }
        return 'github-repo';
    }
}
