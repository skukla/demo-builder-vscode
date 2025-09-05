import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from './logger';
import { execWithFnm, execWithEnhancedPath } from './shellHelper';

const execAsync = promisify(exec);

export interface PrerequisiteCheck {
    command: string;
    parseVersion?: string;
    contains?: string;
}

export interface ProgressMilestone {
    pattern: string;
    progress: number;
    message?: string;
}

export interface InstallStep {
    name: string;
    message: string;
    commands?: string[];
    commandTemplate?: string;
    estimatedDuration?: number;
    progressStrategy?: 'exact' | 'milestones' | 'synthetic' | 'immediate';
    milestones?: ProgressMilestone[];
    progressParser?: string;
    continueOnError?: boolean;
}

export interface PrerequisiteInstall {
    // Legacy format
    commands?: string[];
    message?: string;
    requires?: string[];
    dynamic?: boolean;
    template?: string;
    versions?: Record<string, string[]>;
    manual?: boolean;
    url?: string;
    // New step-based format
    steps?: InstallStep[];
}

export interface PrerequisitePlugin {
    id: string;
    name: string;
    description: string;
    check: PrerequisiteCheck;
    install: {
        commands: string[];
        message?: string;
    };
    requiredFor?: string[];
}

export interface PrerequisiteDefinition {
    id: string;
    name: string;
    description: string;
    optional?: boolean;
    depends?: string[];
    perNodeVersion?: boolean; // Install in each Node.js version
    check: PrerequisiteCheck;
    install?: any; // Installation configuration
    uninstall?: {
        commands: string[];
        message?: string;
    };
    postInstall?: {
        message: string;
    };
    multiVersion?: boolean;
    versionCheck?: {
        command: string;
        parseInstalledVersions: string;
    };
    plugins?: PrerequisitePlugin[];
}

export interface ComponentRequirement {
    prerequisites?: string[];
    plugins?: string[];
}

export interface PrerequisitesConfig {
    version: string;
    prerequisites: PrerequisiteDefinition[];
    componentRequirements?: Record<string, ComponentRequirement>;
}

export interface PrerequisiteStatus {
    id: string;
    name: string;
    description: string;
    installed: boolean;
    version?: string;
    optional: boolean;
    canInstall: boolean;
    message?: string;
    plugins?: Array<{
        id: string;
        name: string;
        installed: boolean;
    }>;
}

export class PrerequisitesManager {
    private config: PrerequisitesConfig | null = null;
    private configPath: string;
    private logger: Logger;
    private resolvedVersionCache: Map<string, string> = new Map();

    constructor(extensionPath: string, logger: Logger) {
        this.configPath = path.join(extensionPath, 'templates', 'prerequisites.json');
        this.logger = logger;
    }

    async loadConfig(): Promise<PrerequisitesConfig> {
        if (!this.config) {
            const content = await fs.promises.readFile(this.configPath, 'utf8');
            this.config = JSON.parse(content);
        }
        return this.config!;
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
        }
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

    async checkPrerequisite(prereq: PrerequisiteDefinition): Promise<PrerequisiteStatus> {
        const status: PrerequisiteStatus = {
            id: prereq.id,
            name: prereq.name,
            description: prereq.description,
            installed: false,
            optional: prereq.optional || false,
            canInstall: true
        };

        try {
            // Use fnm wrapper for Node.js checks, enhanced path for others
            let checkResult;
            if (prereq.id === 'node' || prereq.id === 'npm' || prereq.perNodeVersion) {
                checkResult = await execWithFnm(prereq.check.command);
            } else if (prereq.id === 'aio-cli') {
                checkResult = await execWithEnhancedPath(prereq.check.command);
            } else {
                checkResult = await execAsync(prereq.check.command);
            }
            const { stdout } = checkResult;
            
            // Check if installed
            if (prereq.check.parseVersion) {
                const versionRegex = new RegExp(prereq.check.parseVersion);
                const match = stdout.match(versionRegex);
                if (match) {
                    status.installed = true;
                    status.version = match[1];
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
        } catch (error) {
            status.installed = false;
            this.logger.info(`${prereq.name} not found: ${error}`);
        }

        return status;
    }

    private async checkPlugin(plugin: PrerequisitePlugin): Promise<{id: string; name: string; installed: boolean}> {
        try {
            // Use enhanced path for Adobe CLI plugins
            const { stdout } = await execWithEnhancedPath(plugin.check.command);
            const installed = plugin.check.contains ? 
                stdout.includes(plugin.check.contains) : true;
            
            return {
                id: plugin.id,
                name: plugin.name,
                installed
            };
        } catch {
            return {
                id: plugin.id,
                name: plugin.name,
                installed: false
            };
        }
    }

    getInstallSteps(
        prereq: PrerequisiteDefinition,
        options?: {
            nodeVersions?: string[];
            preferredMethod?: string;
        }
    ): { steps: InstallStep[]; manual?: boolean; url?: string } | null {
        if (!prereq.install) {
            return null;
        }

        // Check for manual installation
        if (prereq.install.manual) {
            return {
                steps: [],
                manual: true,
                url: prereq.install.url
            };
        }

        // Return steps directly if available
        if (prereq.install.steps) {
            return {
                steps: prereq.install.steps
            };
        }

        // Handle dynamic installation (e.g., Node.js with versions) - convert to steps
        if (prereq.install.dynamic && prereq.install.template) {
            const versions = options?.nodeVersions || ['latest'];
            const steps: InstallStep[] = versions.map(version => ({
                name: `Install Node.js ${version}`,
                message: prereq.install.message?.replace(/{version}/g, version) || `Installing Node.js ${version}`,
                commandTemplate: prereq.install.template,
                progressStrategy: 'exact' as const,
                estimatedDuration: 30000
            }));
            return { steps };
        }

        return null;
    }

    getPluginInstallCommands(
        prereqId: string,
        pluginId: string
    ): { commands: string[]; message?: string } | undefined {
        const config = this.config;
        if (!config) return undefined;
        
        const prereq = config.prerequisites.find(p => p.id === prereqId);
        const plugin = prereq?.plugins?.find(p => p.id === pluginId);
        
        if (!plugin) return undefined;
        
        return {
            commands: plugin.install.commands,
            message: plugin.install.message
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
        try {
            const { stdout } = await execAsync(`fnm list-remote | grep "^v${versionFamily}\\." | head -1`);
            if (stdout) {
                return stdout.trim().replace('v', '');
            }
        } catch (error) {
            this.logger.warn(`Could not get latest version for Node ${versionFamily}: ${error}`);
        }
        return null;
    }

    async getRequiredNodeVersions(
        selectedComponents?: {
            frontend?: string;
            backend?: string;
            dependencies?: string[];
            appBuilderApps?: string[];
        }
    ): Promise<string[]> {
        // Node versions should come from components.json, not prerequisites.json
        // This method is deprecated - use ComponentRegistryManager.getRequiredNodeVersions() instead
        return ['20']; // Return LTS as default
    }

    async checkAllPrerequisites(
        prerequisites: PrerequisiteDefinition[]
    ): Promise<PrerequisiteStatus[]> {
        const results: PrerequisiteStatus[] = [];
        
        for (const prereq of prerequisites) {
            const status = await this.checkPrerequisite(prereq);
            results.push(status);
        }
        
        return results;
    }

    resolveDependencies(
        prerequisites: PrerequisiteDefinition[]
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
    logger: Logger
): PrerequisitesManager {
    return new PrerequisitesManager(extensionPath, logger);
}