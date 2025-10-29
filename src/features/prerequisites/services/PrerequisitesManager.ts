import * as path from 'path';
import { ServiceLocator } from '@/core/di';
import { ConfigurationLoader } from '@/core/config/ConfigurationLoader';
import { toError, isTimeoutError } from '@/types/typeGuards';
import { Logger } from '@/types/logger';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { DEFAULT_SHELL } from '@/types/shell';
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

export class PrerequisitesManager {
    private configLoader: ConfigurationLoader<PrerequisitesConfig>;
    private logger: Logger;
    private resolvedVersionCache = new Map<string, string>();
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
            validationErrorMessage: 'Failed to parse prerequisites configuration'
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
        this.logger.debug(`[Prereq Check] Starting check for ${prereq.id}`);

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
            // Use fnm wrapper for Node.js checks, enhanced path for others
            let checkResult;
            
            const cmdStartTime = Date.now();
            if (prereq.id === 'aio-cli') {
                // Use executeAdobeCLI for proper Node version management and caching
                // For prerequisite checks, disable retries to fail fast on timeout
                // IMPORTANT: Check for aio-cli BEFORE perNodeVersion since aio-cli has perNodeVersion=true
                this.logger.debug(`[Prereq Check] aio-cli: Executing via executeAdobeCLI with timeout=${TIMEOUTS.PREREQUISITE_CHECK}ms`);
                checkResult = await commandManager.executeAdobeCLI(prereq.check.command, {
                    timeout: TIMEOUTS.PREREQUISITE_CHECK,
                    retryStrategy: {
                        maxAttempts: 1,
                        initialDelay: 0,
                        maxDelay: 0,
                        backoffFactor: 1,
                    },
                });
                const cmdDuration = Date.now() - cmdStartTime;
                this.logger.debug(`[Prereq Check] aio-cli: Command completed in ${cmdDuration}ms`);
                this.logger.debug(`[Prereq Check] aio-cli: stdout length=${checkResult.stdout?.length || 0}, stderr length=${checkResult.stderr?.length || 0}`);
                this.logger.debug(`[Prereq Check] aio-cli: stdout preview: ${checkResult.stdout?.substring(0, 200)}`);
            } else if (prereq.perNodeVersion && prereq.id !== 'node' && prereq.id !== 'npm') {
                // Fix #5 (5a22e45) + Fix #7 (01b94d6): Check under TARGET Node version (20)
                // This prevents detecting aio-cli from old nvm installations (Node v14)
                // which causes ES module errors. Trust fnm exec isolation instead of path verification.
                const targetNodeVersion = '20';

                this.logger.debug(`[Prereq Check] ${prereq.id}: Checking under Node v${targetNodeVersion} (perNodeVersion=true)`);

                try {
                    checkResult = await commandManager.execute(prereq.check.command, {
                        useNodeVersion: targetNodeVersion,
                        timeout: TIMEOUTS.PREREQUISITE_CHECK,
                    });
                    this.logger.debug(`[Prereq Check] ${prereq.id}: Command completed under Node v${targetNodeVersion}`);
                } catch (error) {
                    this.logger.debug(`[Prereq Check] ${prereq.id}: Not found under Node v${targetNodeVersion}`);
                    checkResult = {
                        stdout: '',
                        stderr: toError(error).message,
                        code: 1,
                        duration: Date.now() - cmdStartTime,
                    };
                }
            } else if (prereq.id === 'node' || prereq.id === 'npm') {
                // For node/npm themselves, check current version
                this.logger.debug(`[Prereq Check] ${prereq.id}: Executing command with useNodeVersion=current`);
                checkResult = await commandManager.execute(prereq.check.command, {
                    useNodeVersion: 'current',
                    timeout: TIMEOUTS.PREREQUISITE_CHECK,
                });
            } else {
                // Enable shell for system tool detection (homebrew, fnm, git, etc.)
                // Commands from prerequisites.json are trusted sources
                this.logger.debug(`[Prereq Check] ${prereq.id}: Executing command with shell enabled`);
                checkResult = await commandManager.execute(prereq.check.command, {
                    timeout: TIMEOUTS.PREREQUISITE_CHECK,
                    shell: DEFAULT_SHELL,
                });
            }
            
            const cmdDuration = Date.now() - cmdStartTime;
            this.logger.debug(`[Prereq Check] ${prereq.id}: Command execution took ${cmdDuration}ms`);
            
            const { stdout } = checkResult;
            
            // Check if installed
            if (prereq.check.parseVersion) {
                this.logger.debug(`[Prereq Check] ${prereq.id}: Parsing version with regex: ${prereq.check.parseVersion}`);
                const versionRegex = new RegExp(prereq.check.parseVersion);
                const match = stdout.match(versionRegex);
                if (match) {
                    status.installed = true;
                    status.version = match[1];
                    this.logger.debug(`[Prereq Check] ${prereq.id}: ✓ Version found: ${match[1]}`);
                } else {
                    this.logger.debug(`[Prereq Check] ${prereq.id}: ✗ Version regex did not match`);
                    this.logger.debug(`[Prereq Check] ${prereq.id}: stdout to match against: ${stdout.substring(0, 300)}`);
                }
            } else if (prereq.check.contains) {
                this.logger.debug(`[Prereq Check] ${prereq.id}: Checking if stdout contains: ${prereq.check.contains}`);
                status.installed = stdout.includes(prereq.check.contains);
                this.logger.debug(`[Prereq Check] ${prereq.id}: Contains check result: ${status.installed}`);
            } else {
                status.installed = true; // Command succeeded
                this.logger.debug(`[Prereq Check] ${prereq.id}: ✓ Command succeeded (no version check required)`);
            }
            
            // Check plugins if any
            if (prereq.plugins && status.installed) {
                this.logger.debug(`[Prereq Check] ${prereq.id}: Checking ${prereq.plugins.length} plugins`);
                status.plugins = [];
                for (const plugin of prereq.plugins) {
                    const pluginStartTime = Date.now();
                    const pluginStatus = await this.checkPlugin(plugin);
                    const pluginDuration = Date.now() - pluginStartTime;
                    this.logger.debug(`[Prereq Check] ${prereq.id}: Plugin ${plugin.id} check took ${pluginDuration}ms, installed=${pluginStatus.installed}`);
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

        // Return steps directly if available
        if (prereq.install.steps) {
            return {
                steps: prereq.install.steps,
            };
        }

        // Handle dynamic installation (e.g., Node.js with versions) - convert to steps
        if (prereq.install && prereq.install.dynamic && prereq.install.template) {
            const versions = options?.nodeVersions || ['latest'];
            const steps: InstallStep[] = versions.map(version => ({
                name: `Install Node.js ${version}`,
                message: prereq.install!.message?.replace(/{version}/g, version) || `Installing Node.js ${version}`,
                commandTemplate: prereq.install!.template,
                progressStrategy: 'exact' as const,
                estimatedDuration: 30000,
            }));
            return { steps };
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

    async resolveNodeVersion(version: string): Promise<string> {
        // Version families are simple - just return as-is
        // fnm will handle resolving "18" to "18.x.x", "20" to "20.x.x", etc.
        return version;
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

    async getRequiredNodeVersions(
        _selectedComponents?: {
            frontend?: string;
            backend?: string;
            dependencies?: string[];
            appBuilderApps?: string[];
        },
    ): Promise<string[]> {
        // Node versions should come from components.json, not prerequisites.json
        // This method is deprecated - use ComponentRegistryManager.getRequiredNodeVersions() instead
        return ['20']; // Return LTS as default
    }

    async checkMultipleNodeVersions(
        versionToComponentMapping: Record<string, string>,
    ): Promise<{ version: string; component: string; installed: boolean }[]> {
        const results: { version: string; component: string; installed: boolean }[] = [];

        try {
            const commandManager = ServiceLocator.getCommandExecutor();
            const fnmListResult = await commandManager.execute('fnm list', { timeout: TIMEOUTS.PREREQUISITE_CHECK });
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