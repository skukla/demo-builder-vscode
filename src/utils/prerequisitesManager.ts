import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from './logger';

const execAsync = promisify(exec);

export interface PrerequisiteCheck {
    command: string;
    parseVersion?: string;
    contains?: string;
}

export interface PrerequisiteInstall {
    commands?: string[];
    message?: string;
    requires?: string[];
    dynamic?: boolean;
    template?: string;
    versions?: Record<string, string[]>;
    manual?: boolean;
    url?: string;
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
    platforms?: string[];
    optional?: boolean;
    depends?: string[];
    check: PrerequisiteCheck;
    install?: any; // Complex type - platform specific or dynamic
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

export interface PrerequisiteGroup {
    id: string;
    name: string;
    prerequisites: string[];
    required: boolean;
}

export interface ComponentRequirement {
    prerequisites?: string[];
    plugins?: string[];
    nodeVersions?: string[];
}

export interface PrerequisitesConfig {
    version: string;
    prerequisites: PrerequisiteDefinition[];
    groups?: PrerequisiteGroup[];
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
    private platform: string;

    constructor(extensionPath: string, logger: Logger) {
        this.configPath = path.join(extensionPath, 'templates', 'prerequisites.json');
        this.logger = logger;
        this.platform = os.platform();
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
        
        // Add core prerequisites
        const coreGroup = config.groups?.find(g => g.id === 'core' && g.required);
        if (coreGroup) {
            coreGroup.prerequisites.forEach(id => required.add(id));
        }
        
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
        
        // Filter prerequisites by platform and required IDs
        return config.prerequisites.filter(p => {
            const platformMatch = !p.platforms || p.platforms.includes(this.platform);
            const isRequired = required.has(p.id) || !p.optional;
            return platformMatch && isRequired;
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
            const { stdout } = await execAsync(prereq.check.command);
            
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
            const { stdout } = await execAsync(plugin.check.command);
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

    getInstallCommands(
        prereq: PrerequisiteDefinition,
        options?: {
            nodeVersions?: string[];
            preferredMethod?: string;
        }
    ): { commands: string[]; message?: string; manual?: boolean; url?: string } {
        if (!prereq.install) {
            return { commands: [], message: 'No installation method available' };
        }

        // Handle dynamic installation (e.g., Node.js with versions)
        if (prereq.install.dynamic && prereq.install.template) {
            const versions = options?.nodeVersions || ['latest'];
            const commands = versions.map(version => 
                prereq.install.template.replace(/{version}/g, version)
            );
            const message = prereq.install.message?.replace(/{version}/g, versions.join(', '));
            return { commands, message };
        }

        // Handle platform-specific installation
        if (prereq.install[this.platform]) {
            const platformInstall = prereq.install[this.platform];
            
            // Check for manual installation
            if (platformInstall.manual) {
                return {
                    commands: [],
                    message: platformInstall.message,
                    manual: true,
                    url: platformInstall.url
                };
            }
            
            // Check for preferred method (e.g., homebrew)
            if (platformInstall.preferredMethod && options?.preferredMethod) {
                const method = platformInstall[options.preferredMethod];
                if (method) {
                    return {
                        commands: method.commands,
                        message: method.message
                    };
                }
            }
            
            // Use default for platform
            if (platformInstall.default) {
                return {
                    commands: platformInstall.default.commands,
                    message: platformInstall.default.message
                };
            }
            
            // Direct commands for platform
            if (platformInstall.commands) {
                return {
                    commands: platformInstall.commands,
                    message: platformInstall.message
                };
            }
        }

        // Use default if available
        if (prereq.install.default) {
            return {
                commands: prereq.install.default.commands,
                message: prereq.install.default.message
            };
        }

        // Direct commands
        if (prereq.install.commands) {
            return {
                commands: prereq.install.commands,
                message: prereq.install.message
            };
        }

        return { commands: [], message: 'No installation method available for this platform' };
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

    async getRequiredNodeVersions(
        selectedComponents?: {
            frontend?: string;
            backend?: string;
            dependencies?: string[];
            appBuilderApps?: string[];
        }
    ): Promise<string[]> {
        const config = await this.loadConfig();
        const versions = new Set<string>();
        
        if (!selectedComponents || !config.componentRequirements) {
            return ['latest'];
        }
        
        const checkComponent = (componentId: string) => {
            const req = config.componentRequirements![componentId];
            if (req?.nodeVersions) {
                req.nodeVersions.forEach(v => versions.add(v));
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
        
        return Array.from(versions);
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