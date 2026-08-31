import * as path from 'path';
import { PrerequisitesCacheManager } from './prerequisitesCacheManager';
import type {
    PrerequisiteCheck,
    PrerequisiteInstall,
    PrerequisitePlugin,
    PrerequisiteDefinition,
    ComponentRequirement,
    PrerequisitesConfig,
    PrerequisiteStatus,
} from './types';
import { ConfigurationLoader } from '@/core/config/ConfigurationLoader';
import { isTimeout, toAppError } from '@/core/errors';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { formatDuration } from '@/core/utils/timeFormatting';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getInstallSteps } from '@/features/prerequisites/services/installation/InstallStepBuilder';
import { resolveDependencies } from '@/features/prerequisites/services/versioning/DependencyResolver';
import { checkMultipleNodeVersions, getInstalledNodeVersions, getLatestInFamily } from '@/features/prerequisites/services/versioning/MultiVersionDetector';
import { checkVersionSatisfaction } from '@/features/prerequisites/services/versioning/VersionSatisfactionChecker';
import { Logger } from '@/types/logger';
import type { InstallStep, ProgressMilestone } from '@/types/prerequisites';
import { toError } from '@/types/typeGuards';

// Extracted modules

export type {
    PrerequisiteCheck,
    ProgressMilestone,
    InstallStep,
    PrerequisiteInstall,
    PrerequisitePlugin,
    PrerequisiteDefinition,
    ComponentRequirement,
    PrerequisitesConfig,
    PrerequisiteStatus,
};

/**
 * Prerequisites Manager - Component-Driven Version Management
 *
 * This manager checks and installs prerequisites based on component requirements.
 * Node.js versions are determined by the components selected by the user:
 * - Each component can specify its required Node version
 * - Multiple Node versions can be installed side-by-side via fnm
 * - Adobe CLI and other tools adapt to the Node version they run under
 *
 * There is NO infrastructure-dictated Node version. Components drive all version requirements.
 */
export class PrerequisitesManager {
    private configLoader: ConfigurationLoader<PrerequisitesConfig>;
    private logger: Logger;
    /**
     * The result cache, handed in rather than built here.
     *
     * It is STATEFUL — a bounded Map plus hit/miss stats — and this class is a
     * session singleton, so the instance it gets is the one the whole session
     * shares. Building it in a field initialiser put a stateful construction in a
     * service, which is the thing ADR-015 keeps out of the middle of the graph.
     */
    private readonly cacheManager: PrerequisitesCacheManager;

    /**
     * ADR-015: the shell executor arrives here rather than being fetched at
     * each of the six call sites that used to reach for it.
     */
    constructor(
        extensionPath: string,
        logger: Logger,
        private commandManager: CommandExecutor,
        cacheManager: PrerequisitesCacheManager,
    ) {
        this.cacheManager = cacheManager;
        const configPath = path.join(
            extensionPath,
            'src',
            'features',
            'prerequisites',
            'config',
            'prerequisites.json',
        );
        this.configLoader = new ConfigurationLoader<PrerequisitesConfig>(configPath);
        this.logger = logger;
    }

    /**
     * Get the cache manager instance
     * Used by handlers for cache invalidation
     */
    getCacheManager(): PrerequisitesCacheManager {
        return this.cacheManager;
    }

    async loadConfig(): Promise<PrerequisitesConfig> {
        return this.configLoader.load({
            validationErrorMessage: 'Failed to parse prerequisites configuration',
        });
    }

    async getPrerequisiteById(id: string): Promise<PrerequisiteDefinition | undefined> {
        const config = await this.loadConfig();
        return config.prerequisites.find((p) => p.id === id);
    }

    async getRequiredPrerequisites(selectedComponents?: {
        frontend?: string;
        backend?: string;
        dependencies?: string[];
        appBuilder?: string[];
    }): Promise<PrerequisiteDefinition[]> {
        const config = await this.loadConfig();
        const required = new Set<string>();

        // Add component-specific requirements
        if (selectedComponents && config.componentRequirements) {
            const checkComponent = (componentId: string) => {
                const req = config.componentRequirements?.[componentId];
                if (req) {
                    req.prerequisites?.forEach((id) => required.add(id));
                }
            };

            if (selectedComponents.frontend) {
                checkComponent(selectedComponents.frontend);
            }
            if (selectedComponents.backend) {
                checkComponent(selectedComponents.backend);
            }
            selectedComponents.dependencies?.forEach(checkComponent);
            selectedComponents.appBuilder?.forEach(checkComponent);
        }

        // Return all non-optional prerequisites plus any required by components
        return config.prerequisites.filter((p) => {
            const isRequired = required.has(p.id) || !p.optional;
            return isRequired;
        });
    }

    async checkPrerequisite(
        prereq: PrerequisiteDefinition,
        nodeVersion?: string,
    ): Promise<PrerequisiteStatus> {
        const startTime = Date.now();

        // Check cache first (Step 2: Prerequisite Caching)
        const cached = this.cacheManager.getCachedResult(prereq.id, nodeVersion);
        if (cached) {
            return cached.data;
        }

        const status: PrerequisiteStatus = {
            id: prereq.id,
            name: prereq.name,
            description: prereq.description,
            installed: false,
            optional: prereq.optional || false,
            canInstall: true,
        };

        try {
            // Step 2 Fix: Use fnm-aware logic for perNodeVersion prerequisites
            if (prereq.perNodeVersion && prereq.id !== 'node' && prereq.id !== 'npm') {
                await this.checkPerNodeVersionPrerequisite(prereq, status);

                const totalDuration = Date.now() - startTime;
                this.logger.debug(
                    `[Prerequisites] ${prereq.id}: ✓ Complete in ${formatDuration(totalDuration)}, installed=${status.installed}`,
                );

                this.cacheManager.setCachedResult(prereq.id, status, undefined, nodeVersion);
                return status;
            }

            // Standard check for non-perNodeVersion prerequisites
            await this.checkStandardPrerequisite(prereq, status);

            const totalDuration = Date.now() - startTime;
            this.logger.debug(
                `[Prerequisites] ${prereq.id}: ✓ Complete in ${formatDuration(totalDuration)}, installed=${status.installed}`,
            );

            this.cacheManager.setCachedResult(prereq.id, status, undefined, nodeVersion);
        } catch (error) {
            this.handleCheckError(prereq, status, error, startTime, nodeVersion);
        }

        return status;
    }

    /**
     * Check a per-node-version prerequisite using fnm-aware detection.
     * Updates the status object in place.
     */
    private async checkPerNodeVersionPrerequisite(
        prereq: PrerequisiteDefinition,
        status: PrerequisiteStatus,
    ): Promise<void> {
        this.logger.debug(
            `[Prerequisites] ${prereq.id}: Using fnm-aware detection (perNodeVersion=true)`,
        );

        const installedNodeVersions = await getInstalledNodeVersions(
            this.commandManager,
            this.logger,
        );

        if (installedNodeVersions.length === 0) {
            this.logger.debug(`[Prerequisites] ${prereq.id}: No Node versions installed`);
            status.installed = false;
        } else {
            const { checkPerNodeVersionStatus } = await import(
                '@/features/prerequisites/handlers/shared'
            );

            const perNodeStatus = await checkPerNodeVersionStatus(
                prereq,
                installedNodeVersions,
                this.createMinimalContext(),
            );

            // Cache per-version results
            for (const versionStatus of perNodeStatus.perNodeVersionStatus) {
                const versionSpecificStatus: PrerequisiteStatus = {
                    id: prereq.id,
                    name: prereq.name,
                    description: prereq.description,
                    installed: versionStatus.installed,
                    optional: prereq.optional || false,
                    canInstall: true,
                };
                this.cacheManager.setCachedResult(
                    prereq.id,
                    versionSpecificStatus,
                    undefined,
                    versionStatus.major,
                );
            }

            const anyInstalled = perNodeStatus.perNodeVersionStatus.some((v) => v.installed);
            status.installed = anyInstalled;

            if (anyInstalled) {
                status.version = this.extractVersionFromPerNodeStatus(perNodeStatus);
            }

            this.logger.debug(
                `[Prerequisites] ${prereq.id}: fnm-aware check complete, installed=${status.installed}`,
            );
        }

        // Check plugins if the prerequisite is installed and has plugins defined
        if (prereq.plugins && status.installed) {
            await this.checkPrerequisitePlugins(prereq, status);
        }
    }

    /**
     * Check a standard (non-perNodeVersion) prerequisite.
     * Updates the status object in place.
     */
    private async checkStandardPrerequisite(
        prereq: PrerequisiteDefinition,
        status: PrerequisiteStatus,
    ): Promise<void> {
        const isNodeOrNpm = prereq.id === 'node' || prereq.id === 'npm';

        const checkResult = await this.commandManager.execute(prereq.check.command, {
            ...(isNodeOrNpm ? { useNodeVersion: 'current' as const } : { shell: DEFAULT_SHELL }),
            timeout: TIMEOUTS.PREREQUISITE_CHECK,
        });

        const { stdout } = checkResult;

        if (prereq.check.parseVersion) {
            const versionRegex = new RegExp(prereq.check.parseVersion);
            const match = stdout.match(versionRegex);
            if (match) {
                status.installed = true;
                status.version = match[1];
            } else {
                this.logger.debug(`[Prerequisites] ${prereq.id}: ✗ Version regex did not match`);
            }
        } else if (prereq.check.contains) {
            status.installed = stdout.includes(prereq.check.contains);
        } else {
            status.installed = true;
        }

        if (prereq.plugins && status.installed) {
            await this.checkPrerequisitePlugins(prereq, status);
        }
    }

    /**
     * Check all plugins for a prerequisite and populate the status.plugins array.
     */
    private async checkPrerequisitePlugins(
        prereq: PrerequisiteDefinition,
        status: PrerequisiteStatus,
    ): Promise<void> {
        if (!prereq.plugins) return;
        this.logger.debug(
            `[Prerequisites] ${prereq.id}: Checking ${prereq.plugins.length} plugin(s)`,
        );
        status.plugins = [];
        for (const plugin of prereq.plugins) {
            const pluginStatus = await this.checkPlugin(plugin);
            status.plugins.push(pluginStatus);
            this.logger.debug(
                `[Prerequisites] ${prereq.id}: Plugin ${plugin.id} installed=${pluginStatus.installed}`,
            );
        }
    }

    /**
     * Handle errors from prerequisite check commands.
     * Throws on timeout, otherwise marks as not installed and caches the result.
     */
    private handleCheckError(
        prereq: PrerequisiteDefinition,
        status: PrerequisiteStatus,
        error: unknown,
        startTime: number,
        nodeVersion?: string,
    ): void {
        const totalDuration = Date.now() - startTime;
        this.logger.debug(
            `[Prerequisites] ${prereq.id}: ✗ Failed after ${formatDuration(totalDuration)}`,
        );

        const errorMessage = toError(error).message;
        const errorObj = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
        const isTimeoutErr =
            isTimeout(toAppError(error)) || (errorObj.killed && errorObj.signal === 'SIGTERM');

        if (isTimeoutErr) {
            this.logger.warn(
                `${prereq.name} check timed out after ${formatDuration(TIMEOUTS.PREREQUISITE_CHECK)}`,
            );
            throw new Error(
                `${prereq.name} check timed out after ${TIMEOUTS.PREREQUISITE_CHECK / 1000} seconds`,
            );
        }

        const isCommandNotFound =
            errorObj.code === 'ENOENT' ||
            errorMessage.includes('ENOENT') ||
            errorMessage.includes('command not found');

        status.installed = false;

        if (isCommandNotFound) {
            this.logger.info(`${prereq.name} not found in PATH: ${prereq.check.command}`);
        } else {
            this.logger.info(`${prereq.name} check failed: ${errorMessage}`);
        }

        this.cacheManager.setCachedResult(prereq.id, status, undefined, nodeVersion);
    }

    private async checkPlugin(
        plugin: PrerequisitePlugin,
    ): Promise<{ id: string; name: string; installed: boolean }> {
        try {
                const { stdout } = await this.commandManager.execute(plugin.check.command, {
                timeout: TIMEOUTS.PREREQUISITE_CHECK,
                retryStrategy: {
                    maxAttempts: 1,
                    initialDelay: 0,
                    maxDelay: 0,
                    backoffFactor: 1,
                },
            });
            const installed = plugin.check.contains ? stdout.includes(plugin.check.contains) : true;

            return {
                id: plugin.id,
                name: plugin.name,
                installed,
            };
        } catch {
            return {
                id: plugin.id,
                name: plugin.name,
                installed: false,
            };
        }
    }

    // Delegate to extracted module
    getInstallSteps(
        prereq: PrerequisiteDefinition,
        options?: {
            nodeVersions?: string[];
            preferredMethod?: string;
        },
    ): { steps: InstallStep[]; manual?: boolean; url?: string } | null {
        return getInstallSteps(prereq, options);
    }

    async getPluginInstallCommands(
        prereqId: string,
        pluginId: string,
    ): Promise<{ commands: string[]; message?: string } | undefined> {
        const config = await this.loadConfig();

        const prereq = config.prerequisites.find((p) => p.id === prereqId);
        const plugin = prereq?.plugins?.find((p) => p.id === pluginId);

        if (!plugin) return undefined;

        // Plugin install uses steps array format (same as prerequisites)
        // Extract commands from first step, or use direct commands if available
        const firstStep = plugin.install.steps?.[0];
        const commands =
            firstStep?.commands || (plugin.install as { commands?: string[] }).commands;

        if (!commands || commands.length === 0) {
            this.logger.warn(`[Prerequisites] Plugin ${pluginId} has no install commands defined`);
            return undefined;
        }

        return {
            commands,
            message: firstStep?.message || (plugin.install as { message?: string }).message,
        };
    }

    // Delegate to extracted module
    async getLatestInFamily(versionFamily: string): Promise<string | null> {
        return getLatestInFamily(versionFamily, this.commandManager, this.logger);
    }

    // Delegate to extracted module
    async checkMultipleNodeVersions(
        versionToComponentMapping: Record<string, string>,
    ): Promise<{ version: string; component: string; installed: boolean }[]> {
        return checkMultipleNodeVersions(
            versionToComponentMapping,
            this.commandManager,
            this.logger,
        );
    }

    // Delegate to extracted module
    async checkVersionSatisfaction(requiredFamily: string): Promise<boolean> {
        const result = await checkVersionSatisfaction(
            requiredFamily,
            this.commandManager,
            this.logger,
        );
        return result.satisfied;
    }

    private createMinimalContext(): { logger: Logger; debugLogger: Logger } {
        return {
            logger: this.logger,
            debugLogger: {
                debug: this.logger.debug.bind(this.logger),
                info: this.logger.info.bind(this.logger),
                warn: this.logger.warn.bind(this.logger),
                error: this.logger.error.bind(this.logger),
            } as Logger,
        };
    }

    private extractVersionFromPerNodeStatus(perNodeStatus: {
        perNodeVersionStatus: { version: string; component: string; installed: boolean }[];
    }): string | undefined {
        const firstInstalled = perNodeStatus.perNodeVersionStatus.find((v) => v.installed);
        return firstInstalled?.component || undefined;
    }

    async checkAllPrerequisites(
        prerequisites: PrerequisiteDefinition[],
    ): Promise<PrerequisiteStatus[]> {
        const results: PrerequisiteStatus[] = [];

        for (const prereq of prerequisites) {
            const status = await this.checkPrerequisite(prereq);
            results.push(status);
        }

        return results;
    }

    // Delegate to extracted module
    resolveDependencies(prerequisites: PrerequisiteDefinition[]): PrerequisiteDefinition[] {
        return resolveDependencies(prerequisites);
    }
}
