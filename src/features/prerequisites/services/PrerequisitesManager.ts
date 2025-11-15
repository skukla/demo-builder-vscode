import * as path from 'path';
import * as semver from 'semver';
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
import { ConfigurationLoader } from '@/core/config/ConfigurationLoader';
import { ServiceLocator } from '@/core/di';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { Logger } from '@/types/logger';
import { DEFAULT_SHELL } from '@/types/shell';
import { toError, isTimeoutError } from '@/types/typeGuards';

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
 *
 * @example
 * // User selects:
 * // - frontend: needs Node 18
 * // - backend: needs Node 20
 * // - mesh: needs Node 24
 * // Result: All three Node versions installed, tools adapt to each
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
            const duration = Date.now() - startTime;
            this.logger.debug(`[Prereq Check] ${prereq.id}: ✓ Cache hit in ${duration}ms`);
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
            // Check perNodeVersion prerequisites using checkPerNodeVersionStatus (same as per-node check)
            if (prereq.perNodeVersion && prereq.id !== 'node' && prereq.id !== 'npm') {
                this.logger.debug(`[Prereq Check] ${prereq.id}: Using fnm-aware detection (perNodeVersion=true)`);

                // Get list of installed Node versions to check against
                const installedNodeVersions = await this.getInstalledNodeVersions();

                if (installedNodeVersions.length === 0) {
                    // No Node versions installed - prerequisite can't be installed
                    this.logger.debug(`[Prereq Check] ${prereq.id}: No Node versions installed`);
                    status.installed = false;
                } else {
                    // Check prerequisite against all installed Node versions using fnm-aware logic
                    const { checkPerNodeVersionStatus } = await import('@/features/prerequisites/handlers/shared');

                    const perNodeStatus = await checkPerNodeVersionStatus(
                        prereq,
                        installedNodeVersions,
                        this.createMinimalContext()
                    );

                    // Cache per-version results for reuse (avoids duplicate checks later)
                    // Each version gets its own cache entry: "aio-cli##20", "aio-cli##24", etc.
                    for (const versionStatus of perNodeStatus.perNodeVersionStatus) {
                        // Use major version directly (no string parsing needed)
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

                    // If installed for ANY Node version, mark as installed
                    const anyInstalled = perNodeStatus.perNodeVersionStatus.some(v => v.installed);
                    status.installed = anyInstalled;

                    // Extract version from first installed variant
                    if (anyInstalled) {
                        status.version = this.extractVersionFromPerNodeStatus(perNodeStatus);
                    }

                    this.logger.debug(`[Prereq Check] ${prereq.id}: fnm-aware check complete, installed=${status.installed}, cached ${perNodeStatus.perNodeVersionStatus.length} per-version results`);
                }

                const totalDuration = Date.now() - startTime;
                this.logger.debug(`[Prereq Check] ${prereq.id}: ✓ Complete in ${totalDuration}ms, installed=${status.installed}`);

                // Cache result
                this.cacheManager.setCachedResult(prereq.id, status, undefined, nodeVersion);
                return status;
            }

            // Original logic for non-perNodeVersion prerequisites
            let checkResult;

            if (prereq.id === 'node' || prereq.id === 'npm') {
                // For node/npm themselves, check current version
                checkResult = await commandManager.execute(prereq.check.command, {
                    useNodeVersion: 'current',
                    timeout: TIMEOUTS.PREREQUISITE_CHECK,
                });
            } else {
                // Enable shell for system tool detection (homebrew, fnm, git, etc.)
                // Commands from prerequisites.json are trusted sources
                checkResult = await commandManager.execute(prereq.check.command, {
                    timeout: TIMEOUTS.PREREQUISITE_CHECK,
                    shell: DEFAULT_SHELL,
                });
            }

            const { stdout } = checkResult;
            
            // Check if installed
            if (prereq.check.parseVersion) {
                const versionRegex = new RegExp(prereq.check.parseVersion);
                const match = stdout.match(versionRegex);
                if (match) {
                    status.installed = true;
                    status.version = match[1];
                } else {
                    this.logger.debug(`[Prereq Check] ${prereq.id}: ✗ Version regex did not match`);
                    this.logger.debug(`[Prereq Check] ${prereq.id}: stdout to match against: ${stdout.substring(0, 300)}`);
                }
            } else if (prereq.check.contains) {
                status.installed = stdout.includes(prereq.check.contains);
            } else {
                status.installed = true; // Command succeeded
            }
            
            // Check plugins if any
            if (prereq.plugins && status.installed) {
                status.plugins = [];
                for (const plugin of prereq.plugins) {
                    const pluginStatus = await this.checkPlugin(plugin);
                    status.plugins.push(pluginStatus);
                }
            }
            
            const totalDuration = Date.now() - startTime;
            this.logger.debug(`[Prereq Check] ${prereq.id}: ✓ Complete in ${totalDuration}ms, installed=${status.installed}`);

            // Cache successful result (Step 2: Prerequisite Caching)
            this.cacheManager.setCachedResult(prereq.id, status, undefined, nodeVersion);

        } catch (error) {
            const totalDuration = Date.now() - startTime;
            this.logger.debug(`[Prereq Check] ${prereq.id}: ✗ Failed after ${totalDuration}ms`);

            // Check if this is a timeout error
            const errorMessage = toError(error).message;
            const errorObj = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
            const isTimeout = isTimeoutError(error) || (errorObj.killed && errorObj.signal === 'SIGTERM');

            if (isTimeout) {
                // Re-throw timeout errors so they can be handled at the command level
                // Step 1: Reduced timeout from 60s to 10s for faster failure feedback
                this.logger.warn(`${prereq.name} check timed out after ${TIMEOUTS.PREREQUISITE_CHECK}ms`);
                throw new Error(`${prereq.name} check timed out after ${TIMEOUTS.PREREQUISITE_CHECK / 1000} seconds`);
            }

            // Check if this is an ENOENT error (command not found in PATH)
            const isCommandNotFound = errorObj.code === 'ENOENT' ||
                                     errorMessage.includes('ENOENT') ||
                                     errorMessage.includes('command not found');

            // For ENOENT or other errors, treat as not installed
            status.installed = false;

            if (isCommandNotFound) {
                this.logger.info(`${prereq.name} not found in PATH: ${prereq.check.command}`);
            } else {
                this.logger.info(`${prereq.name} check failed: ${errorMessage}`);
            }

            // Cache error result (Step 2: Prerequisite Caching)
            // Cache "not installed" results to avoid repeated failed checks
            this.cacheManager.setCachedResult(prereq.id, status, undefined, nodeVersion);
        }

        return status;
    }

    private async checkPlugin(plugin: PrerequisitePlugin): Promise<{id: string; name: string; installed: boolean}> {
        try {
            const commandManager = ServiceLocator.getCommandExecutor();
            // Use executeAdobeCLI for proper Node version management and caching
            // For prerequisite checks, disable retries to fail fast on timeout
            const { stdout } = await commandManager.executeAdobeCLI(plugin.check.command, {
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

    getInstallSteps(
        prereq: PrerequisiteDefinition,
        options?: {
            nodeVersions?: string[];
            preferredMethod?: string;
        },
    ): { steps: InstallStep[]; manual?: boolean; url?: string } | null {
        if (!prereq.install) {
            return null;
        }

        // Check for manual installation
        if (prereq.install.manual) {
            return {
                steps: [],
                manual: true,
                url: prereq.install.url,
            };
        }

        // Handle dynamic installation (e.g., Node.js with versions) - convert to steps
        if (prereq.install && prereq.install.dynamic && prereq.install.steps) {
            // Adobe CLI adapts to component needs - no default version needed
            const versions = options?.nodeVersions || [];
            const templateSteps = prereq.install.steps;
            // Create a step for each version and each template step
            const steps: InstallStep[] = versions.flatMap(version =>
                templateSteps.map(templateStep => ({
                    name: templateStep.name?.replace(/{version}/g, version) || `Install Node.js ${version}`,
                    message: templateStep.message?.replace(/{version}/g, version) || `Installing Node.js ${version}`,
                    commandTemplate: templateStep.commandTemplate?.replace(/{version}/g, version),
                    commands: templateStep.commands,
                    progressStrategy: templateStep.progressStrategy || ('synthetic' as const),
                    progressParser: templateStep.progressParser,
                    estimatedDuration: templateStep.estimatedDuration || 30000,
                    milestones: templateStep.milestones,
                    continueOnError: templateStep.continueOnError,
                }))
            );
            return { steps };
        }

        // Return steps directly if available
        if (prereq.install.steps) {
            return {
                steps: prereq.install.steps,
            };
        }

        return null;
    }

    async getPluginInstallCommands(
        prereqId: string,
        pluginId: string,
    ): Promise<{ commands: string[]; message?: string } | undefined> {
        const config = await this.loadConfig();

        const prereq = config.prerequisites.find(p => p.id === prereqId);
        const plugin = prereq?.plugins?.find(p => p.id === pluginId);

        if (!plugin) return undefined;

        return {
            commands: plugin.install.commands,
            message: plugin.install.message,
        };
    }

    async getLatestInFamily(versionFamily: string): Promise<string | null> {
        // Get the actual installed version for a version family
        // This is used for display purposes after installation

        // SECURITY: Validate versionFamily to prevent command injection
        // Only allow digits (e.g., "18", "20", "22")
        if (!/^\d+$/.test(versionFamily)) {
            this.logger.warn(`[Prerequisites] Invalid version family rejected: ${versionFamily}`);
            return null;
        }

        try {
            const commandManager = ServiceLocator.getCommandExecutor();
            // SECURITY: Use Node.js string processing instead of shell pipes
            // Eliminates shell injection risk entirely (defense-in-depth)
            const { stdout } = await commandManager.execute('fnm list-remote', {
                timeout: TIMEOUTS.PREREQUISITE_CHECK,
            });

            if (stdout) {
                // Filter versions using Node.js (no shell involved)
                const versions = stdout
                    .split('\n')
                    .filter(line => line.trim().startsWith(`v${versionFamily}.`));

                if (versions.length > 0) {
                    // Return first match (latest)
                    return versions[0].trim().replace('v', '');
                }
            }
        } catch (error) {
            this.logger.warn(`Could not get latest version for Node ${versionFamily}: ${error}`);
        }
        return null;
    }

    async checkMultipleNodeVersions(
        versionToComponentMapping: Record<string, string>,
    ): Promise<{ version: string; component: string; installed: boolean }[]> {
        const results: { version: string; component: string; installed: boolean }[] = [];

        try {
            const commandManager = ServiceLocator.getCommandExecutor();
            const fnmListResult = await commandManager.execute('fnm list', {
                timeout: TIMEOUTS.PREREQUISITE_CHECK,
                shell: DEFAULT_SHELL, // Add shell context for fnm availability (fixes ENOENT errors)
            });
            const versions = fnmListResult.stdout.trim().split('\n').filter(v => v.trim());

            // Parse installed versions - create mapping of major version to full version
            const majorToFullVersion = new Map<string, string>();
            for (const version of versions) {
                // Match patterns like "v20.19.5" or "20.19.5"
                const match = /v?(\d+)\.([\d.]+)/.exec(version);
                if (match) {
                    const majorVersion = match[1];
                    const fullVersion = `${match[1]}.${match[2]}`;

                    // Store the full version for this major version
                    // Note: NodeVersionManager.list() returns clean version strings,
                    // so we just use the first one found for each major version
                    if (!majorToFullVersion.has(majorVersion)) {
                        majorToFullVersion.set(majorVersion, fullVersion);
                    }
                }
            }

            // Check each required version
            for (const [version, componentName] of Object.entries(versionToComponentMapping)) {
                const fullVersion = majorToFullVersion.get(version);
                results.push({
                    version: fullVersion ? `Node ${fullVersion}` : `Node ${version}`,
                    component: componentName,
                    installed: majorToFullVersion.has(version),
                });
            }

        } catch (error) {
            this.logger.warn(`Could not check installed Node versions: ${error}`);
            // Return all as not installed if we can't check
            for (const [version, componentName] of Object.entries(versionToComponentMapping)) {
                results.push({
                    version: `Node ${version}`,
                    component: componentName,
                    installed: false,
                });
            }
        }

        return results;
    }

    /**
     * Check if ANY installed Node version satisfies the required version family
     *
     * Component-driven approach: This checks if a component's Node version requirement
     * is already satisfied by an installed version. Uses semver for flexible matching.
     *
     * @param requiredFamily - Version family (e.g., '24' for 24.x)
     * @returns true if any installed version satisfies the requirement
     *
     * @example
     * // Component requires Node 24
     * // Installed: Node 24.0.10, Node 18.20.0
     * await checkVersionSatisfaction('24') // → true (24.0.10 satisfies 24.x)
     *
     * @example
     * // Component requires Node 22
     * // Installed: Node 24.0.10, Node 18.20.0
     * await checkVersionSatisfaction('22') // → false (no 22.x installed)
     */
    async checkVersionSatisfaction(requiredFamily: string): Promise<boolean> {
        const startTime = Date.now();
        this.logger.debug(`[Version Satisfaction] Checking if Node ${requiredFamily}.x is satisfied`);

        // SECURITY: Validate requiredFamily to prevent injection (defense-in-depth)
        // Only allow digits (e.g., "18", "20", "22")
        if (!/^\d+$/.test(requiredFamily)) {
            this.logger.warn(`[Version Satisfaction] Invalid version family rejected: ${requiredFamily}`);
            return false;
        }

        try {
            const commandManager = ServiceLocator.getCommandExecutor();
            const fnmListResult = await commandManager.execute('fnm list', {
                timeout: TIMEOUTS.PREREQUISITE_CHECK,
                shell: DEFAULT_SHELL,
            });

            const installedVersions = this.parseInstalledVersions(fnmListResult.stdout);
            const semverRange = `${requiredFamily}.x`;

            // Check if any installed version satisfies the required family
            const satisfied = installedVersions.some(version => {
                const matches = semver.satisfies(version, semverRange);
                if (matches) {
                    this.logger.debug(`[Version Satisfaction] ✓ Node ${version} satisfies ${semverRange}`);
                }
                return matches;
            });

            const duration = Date.now() - startTime;
            if (satisfied) {
                this.logger.debug(`[Version Satisfaction] ✓ Node ${requiredFamily}.x satisfied in ${duration}ms`);
            } else {
                this.logger.debug(`[Version Satisfaction] ✗ Node ${requiredFamily}.x NOT satisfied (${duration}ms) - installed: ${installedVersions.join(', ')}`);
            }

            return satisfied;
        } catch (error) {
            const duration = Date.now() - startTime;
            this.logger.warn(`[Version Satisfaction] Error checking Node ${requiredFamily}.x after ${duration}ms: ${error}`);
            return false; // Safe default: not satisfied
        }
    }

    /**
     * Create minimal context for checkPerNodeVersionStatus
     * Provides logger interface required by shared handler functions
     */
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

    /**
     * Extract version string from per-node version status result
     * Returns the version from the first installed variant
     */
    private extractVersionFromPerNodeStatus(perNodeStatus: {
        perNodeVersionStatus: { version: string; component: string; installed: boolean }[];
    }): string | undefined {
        const firstInstalled = perNodeStatus.perNodeVersionStatus.find(v => v.installed);
        return firstInstalled?.component || undefined;
    }

    /**
     * Get installed Node major versions (e.g., ['18', '20', '24'])
     * Used for checking perNodeVersion prerequisites against all installed Node versions
     * @returns Array of Node major versions
     */
    private async getInstalledNodeVersions(): Promise<string[]> {
        try {
            const commandManager = ServiceLocator.getCommandExecutor();
            const fnmListResult = await commandManager.execute('fnm list', {
                timeout: TIMEOUTS.PREREQUISITE_CHECK,
                shell: DEFAULT_SHELL,
            });

            const versions = fnmListResult.stdout.trim().split('\n').filter(v => v.trim());
            const majors = new Set<string>();

            for (const version of versions) {
                // Match patterns like "v20.19.5" or "20.19.5"
                const match = /v?(\d+)/.exec(version);
                if (match) {
                    majors.add(match[1]);
                }
            }

            return Array.from(majors).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
        } catch (error) {
            this.logger.warn(`[Prerequisites] Could not get installed Node versions: ${error}`);
            return [];
        }
    }

    /**
     * Parse installed Node versions from fnm list output
     * @param stdout - Output from fnm list command
     * @returns Array of version strings (e.g., ['18.20.8', '20.19.5'])
     */
    private parseInstalledVersions(stdout: string): string[] {
        return stdout
            .trim()
            .split('\n')
            .map(line => {
                // Match patterns like "v20.19.5" or "20.19.5"
                const match = /v?(\d+\.\d+\.\d+)/.exec(line.trim());
                return match ? match[1] : null;
            })
            .filter((v): v is string => v !== null);
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

    resolveDependencies(
        prerequisites: PrerequisiteDefinition[],
    ): PrerequisiteDefinition[] {
        const resolved: PrerequisiteDefinition[] = [];
        const resolving = new Set<string>();
        const allPrereqs = new Map(prerequisites.map(p => [p.id, p]));
        
        const resolve = (prereq: PrerequisiteDefinition) => {
            if (resolved.some(p => p.id === prereq.id)) return;
            if (resolving.has(prereq.id)) {
                throw new Error(`Circular dependency detected: ${prereq.id}`);
            }
            
            resolving.add(prereq.id);
            
            if (prereq.depends) {
                for (const depId of prereq.depends) {
                    const dep = allPrereqs.get(depId);
                    if (dep) {
                        resolve(dep);
                    }
                }
            }
            
            resolved.push(prereq);
            resolving.delete(prereq.id);
        };
        
        for (const prereq of prerequisites) {
            resolve(prereq);
        }
        
        return resolved;
    }
}

export function createPrerequisitesManager(
    extensionPath: string,
    logger: Logger,
): PrerequisitesManager {
    return new PrerequisitesManager(extensionPath, logger);
}