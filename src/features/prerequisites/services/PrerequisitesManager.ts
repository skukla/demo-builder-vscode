import * as path from 'path';
import { getInstallSteps } from './installation';
import { PrerequisitesCacheManager } from './prerequisitesCacheManager';
import type {
    PrerequisiteCheck,
    ProgressMilestone,
    InstallStep,
    PrerequisiteInstall,
    PrerequisitePlugin,
    PrerequisiteDefinition,
    ComponentRequirement,
    PrerequisitesConfig,
    PrerequisiteStatus,
} from './types';
import {
    checkVersionSatisfaction,
    checkMultipleNodeVersions,
    getInstalledNodeVersions,
    getLatestInFamily,
    resolveDependencies,
} from './versioning';
import { ConfigurationLoader } from '@/core/config/ConfigurationLoader';
import { ServiceLocator } from '@/core/di';
import { TIMEOUTS, formatDuration } from '@/core/utils';
import { isTimeout, toAppError } from '@/types/errors';
import { Logger } from '@/types/logger';
import { DEFAULT_SHELL } from '@/types/shell';
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
    private cacheManager = new PrerequisitesCacheManager();

    constructor(extensionPath: string, logger: Logger) {
        const configPath = path.join(extensionPath, 'templates', 'prerequisites.json');
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
        return await this.configLoader.load({
            validationErrorMessage: 'Failed to parse prerequisites configuration',
        });
    }

    async getPrerequisiteById(id: string): Promise<PrerequisiteDefinition | undefined> {
        const config = await this.loadConfig();
        return config.prerequisites.find(p => p.id === id);
    }

    async getRequiredPrerequisites(
        selectedComponents?: {
            frontend?: string;
            backend?: string;
            dependencies?: string[];
            appBuilderApps?: string[];
        },
    ): Promise<PrerequisiteDefinition[]> {
        const config = await this.loadConfig();
        const required = new Set<string>();

        // Add component-specific requirements
        if (selectedComponents && config.componentRequirements) {
            const checkComponent = (componentId: string) => {
                const req = config.componentRequirements![componentId];
                if (req) {
                    req.prerequisites?.forEach(id => required.add(id));
                }
            };

            if (selectedComponents.frontend) {
                checkComponent(selectedComponents.frontend);
            }
            if (selectedComponents.backend) {
                checkComponent(selectedComponents.backend);
            }
            selectedComponents.dependencies?.forEach(checkComponent);
            selectedComponents.appBuilderApps?.forEach(checkComponent);
        }

        // Return all non-optional prerequisites plus any required by components
        return config.prerequisites.filter(p => {
            const isRequired = required.has(p.id) || !p.optional;
            return isRequired;
        });
    }

    async checkPrerequisite(prereq: PrerequisiteDefinition, nodeVersion?: string): Promise<PrerequisiteStatus> {
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
            const commandManager = ServiceLocator.getCommandExecutor();

            // Step 2 Fix: Use fnm-aware logic for perNodeVersion prerequisites
            if (prereq.perNodeVersion && prereq.id !== 'node' && prereq.id !== 'npm') {
                this.logger.debug(`[Prerequisites] ${prereq.id}: Using fnm-aware detection (perNodeVersion=true)`);

                const installedNodeVersions = await getInstalledNodeVersions(this.logger);

                if (installedNodeVersions.length === 0) {
                    this.logger.debug(`[Prerequisites] ${prereq.id}: No Node versions installed`);
                    status.installed = false;
                } else {
                    const { checkPerNodeVersionStatus } = await import('@/features/prerequisites/handlers/shared');

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
                        this.cacheManager.setCachedResult(prereq.id, versionSpecificStatus, undefined, versionStatus.major);
                    }

                    const anyInstalled = perNodeStatus.perNodeVersionStatus.some(v => v.installed);
                    status.installed = anyInstalled;

                    if (anyInstalled) {
                        status.version = this.extractVersionFromPerNodeStatus(perNodeStatus);
                    }

                    this.logger.debug(`[Prerequisites] ${prereq.id}: fnm-aware check complete, installed=${status.installed}`);
                }

                // Check plugins if the prerequisite is installed and has plugins defined
                // This ensures plugins like api-mesh are checked for perNodeVersion prerequisites
                if (prereq.plugins && status.installed) {
                    this.logger.debug(`[Prerequisites] ${prereq.id}: Checking ${prereq.plugins.length} plugin(s)`);
                    status.plugins = [];
                    for (const plugin of prereq.plugins) {
                        const pluginStatus = await this.checkPlugin(plugin);
                        status.plugins.push(pluginStatus);
                        this.logger.debug(`[Prerequisites] ${prereq.id}: Plugin ${plugin.id} installed=${pluginStatus.installed}`);
                    }
                }

                const totalDuration = Date.now() - startTime;
                this.logger.debug(`[Prerequisites] ${prereq.id}: ✓ Complete in ${formatDuration(totalDuration)}, installed=${status.installed}`);

                this.cacheManager.setCachedResult(prereq.id, status, undefined, nodeVersion);
                return status;
            }

            // Original logic for non-perNodeVersion prerequisites
            let checkResult;

            if (prereq.id === 'node' || prereq.id === 'npm') {
                checkResult = await commandManager.execute(prereq.check.command, {
                    useNodeVersion: 'current',
                    timeout: TIMEOUTS.PREREQUISITE_CHECK,
                });
            } else {
                checkResult = await commandManager.execute(prereq.check.command, {
                    timeout: TIMEOUTS.PREREQUISITE_CHECK,
                    shell: DEFAULT_SHELL,
                });
            }

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
                status.plugins = [];
                for (const plugin of prereq.plugins) {
                    const pluginStatus = await this.checkPlugin(plugin);
                    status.plugins.push(pluginStatus);
                }
            }

            const totalDuration = Date.now() - startTime;
            this.logger.debug(`[Prerequisites] ${prereq.id}: ✓ Complete in ${formatDuration(totalDuration)}, installed=${status.installed}`);

            this.cacheManager.setCachedResult(prereq.id, status, undefined, nodeVersion);

        } catch (error) {
            const totalDuration = Date.now() - startTime;
            this.logger.debug(`[Prerequisites] ${prereq.id}: ✗ Failed after ${formatDuration(totalDuration)}`);

            const errorMessage = toError(error).message;
            const errorObj = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
            const isTimeoutErr = isTimeout(toAppError(error)) || (errorObj.killed && errorObj.signal === 'SIGTERM');

            if (isTimeoutErr) {
                this.logger.warn(`${prereq.name} check timed out after ${formatDuration(TIMEOUTS.PREREQUISITE_CHECK)}`);
                throw new Error(`${prereq.name} check timed out after ${TIMEOUTS.PREREQUISITE_CHECK / 1000} seconds`);
            }

            const isCommandNotFound = errorObj.code === 'ENOENT' ||
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

        return status;
    }

    private async checkPlugin(plugin: PrerequisitePlugin): Promise<{id: string; name: string; installed: boolean}> {
        try {
            const commandManager = ServiceLocator.getCommandExecutor();
            const { stdout } = await commandManager.execute(plugin.check.command, {
                timeout: TIMEOUTS.PREREQUISITE_CHECK,
                retryStrategy: {
                    maxAttempts: 1,
                    initialDelay: 0,
                    maxDelay: 0,
                    backoffFactor: 1,
                },
            });
            const installed = plugin.check.contains ?
                stdout.includes(plugin.check.contains) : true;

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

        const prereq = config.prerequisites.find(p => p.id === prereqId);
        const plugin = prereq?.plugins?.find(p => p.id === pluginId);

        if (!plugin) return undefined;

        // Plugin install uses steps array format (same as prerequisites)
        // Extract commands from first step, or use direct commands if available
        const firstStep = plugin.install.steps?.[0];
        const commands = firstStep?.commands || (plugin.install as { commands?: string[] }).commands;

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
        return getLatestInFamily(versionFamily, this.logger);
    }

    // Delegate to extracted module
    async checkMultipleNodeVersions(
        versionToComponentMapping: Record<string, string>,
    ): Promise<{ version: string; component: string; installed: boolean }[]> {
        return checkMultipleNodeVersions(versionToComponentMapping, this.logger);
    }

    // Delegate to extracted module
    async checkVersionSatisfaction(requiredFamily: string): Promise<boolean> {
        const result = await checkVersionSatisfaction(requiredFamily, this.logger);
        return result.satisfied;
    }

    private createMinimalContext(): any {
        return {
            logger: this.logger,
            debugLogger: {
                debug: this.logger.debug.bind(this.logger),
                info: this.logger.info.bind(this.logger),
                warn: this.logger.warn.bind(this.logger),
                error: this.logger.error.bind(this.logger),
            },
        };
    }

    private extractVersionFromPerNodeStatus(perNodeStatus: {
        perNodeVersionStatus: { version: string; component: string; installed: boolean }[];
    }): string | undefined {
        const firstInstalled = perNodeStatus.perNodeVersionStatus.find(v => v.installed);
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
    resolveDependencies(
        prerequisites: PrerequisiteDefinition[],
    ): PrerequisiteDefinition[] {
        return resolveDependencies(prerequisites);
    }
}

export function createPrerequisitesManager(
    extensionPath: string,
    logger: Logger,
): PrerequisitesManager {
    return new PrerequisitesManager(extensionPath, logger);
}
