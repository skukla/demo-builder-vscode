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
import type { GitHubTokenService } from './githubTokenService';
import type { GitHubRepoOperations } from './githubRepoOperations';
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

// Re-export phase classes for direct use
export { GitHubRepoPhase, HelixConfigPhase, ContentPhase, EnvConfigPhase } from './edsSetupPhases';

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

/**
 * GitHub services for EDS project setup
 */
export interface GitHubServicesForProject {
    tokenService: GitHubTokenService;
    repoOperations: GitHubRepoOperations;
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

        // Initialize phase handlers
        this.githubPhase = new GitHubRepoPhase(githubServices, daLiveServices.orgOperations, this.logger);
        this.helixPhase = new HelixConfigPhase(authService, this.logger);
        this.contentPhase = new ContentPhase(daLiveServices.contentOperations, componentManager, this.logger);
        this.envPhase = new EnvConfigPhase(this.logger);
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
            reportProgress('github-clone', PROGRESS.GITHUB_CLONE.start, 'Cloning repository...');
            await this.githubPhase.clone(createdRepo, config);
            reportProgress('github-clone', PROGRESS.GITHUB_CLONE.end, 'Repository cloned');

            // Phase 3: Configure Helix 5
            reportProgress('helix-config', PROGRESS.HELIX_CONFIG.start, 'Configuring Helix 5...');
            await this.helixPhase.configure(config, createdRepo);
            reportProgress('helix-config', PROGRESS.HELIX_CONFIG.end, 'Helix configured');

            // Phase 4: Verify Code Bus sync
            reportProgress('code-sync', PROGRESS.CODE_SYNC.start, 'Verifying code sync...');
            await this.helixPhase.verifyCodeSync(config, createdRepo);
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

            // Phase 6: Clone ingestion tool (unless skipped)
            if (!config.skipTools) {
                reportProgress('tools-clone', PROGRESS.TOOLS_CLONE.start, 'Cloning ingestion tool...');
                await this.contentPhase.cloneIngestionTool(config);
                reportProgress('tools-clone', PROGRESS.TOOLS_CLONE.end, 'Tool cloned');
            } else {
                reportProgress('tools-clone', PROGRESS.TOOLS_CLONE.end, 'Tool clone skipped');
            }

            // Phase 7: Generate .env file
            reportProgress('env-config', PROGRESS.ENV_CONFIG.start, 'Generating environment configuration...');
            await this.envPhase.generateEnvFile(config, createdRepo);
            reportProgress('env-config', PROGRESS.ENV_CONFIG.end, 'Environment configured');

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
     * Extract phase from EdsProjectError or determine from error context
     */
    private getFailedPhase(error: Error): EdsSetupPhase {
        if (error instanceof EdsProjectError) {
            return error.phase;
        }
        return 'github-repo';
    }
}
