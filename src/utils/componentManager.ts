import * as fs from 'fs/promises';
import * as path from 'path';
import { Project, ComponentInstance, ComponentDefinition, ComponentStatus } from '../types';
import { Logger } from './logger';
import { getExternalCommandManager } from '../extension';

export interface ComponentInstallOptions {
    branch?: string;
    version?: string;
    skipDependencies?: boolean;
}

export interface ComponentInstallResult {
    success: boolean;
    component?: ComponentInstance;
    error?: string;
}

/**
 * ComponentManager handles the installation, lifecycle, and management
 * of individual components within a Demo Builder project.
 * 
 * This includes:
 * - Cloning Git repositories into components/ subdirectory
 * - Installing npm packages
 * - Tracking component status and metadata
 * - Managing component dependencies
 */
export class ComponentManager {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * Install a component into the project
     */
    public async installComponent(
        project: Project,
        componentDef: ComponentDefinition,
        options: ComponentInstallOptions = {}
    ): Promise<ComponentInstallResult> {
        try {
            this.logger.info(`[ComponentManager] Installing component: ${componentDef.name}`);

            // Initialize component instance
            const componentInstance: ComponentInstance = {
                id: componentDef.id,
                name: componentDef.name,
                type: componentDef.type,
                subType: componentDef.subType,
                status: 'not-installed',
                lastUpdated: new Date()
            };

            // Determine installation method based on source type
            if (!componentDef.source) {
                // No source = configuration only (e.g., backend selector)
                componentInstance.status = 'ready';
                return { success: true, component: componentInstance };
            }

            switch (componentDef.source.type) {
                case 'git':
                    return await this.installGitComponent(
                        project,
                        componentDef,
                        componentInstance,
                        options
                    );
                
                case 'npm':
                    return await this.installNpmComponent(
                        project,
                        componentDef,
                        componentInstance,
                        options
                    );
                
                case 'local':
                    return await this.linkLocalComponent(
                        project,
                        componentDef,
                        componentInstance
                    );
                
                default:
                    throw new Error(`Unsupported source type: ${componentDef.source.type}`);
            }

        } catch (error) {
            this.logger.error(`[ComponentManager] Failed to install ${componentDef.name}`, error as Error);
            return {
                success: false,
                error: (error as Error).message
            };
        }
    }

    /**
     * Install a Git-based component by cloning the repository
     */
    private async installGitComponent(
        project: Project,
        componentDef: ComponentDefinition,
        componentInstance: ComponentInstance,
        options: ComponentInstallOptions
    ): Promise<ComponentInstallResult> {
        if (!componentDef.source?.url) {
            throw new Error('Git source URL not provided');
        }

        const componentsDir = path.join(project.path, 'components');
        const componentPath = path.join(componentsDir, componentDef.id);

        // Create components directory if it doesn't exist
        await fs.mkdir(componentsDir, { recursive: true });

        // Update status
        componentInstance.status = 'cloning';
        componentInstance.repoUrl = componentDef.source.url;
        componentInstance.branch = options.branch || componentDef.source.branch || 'main';
        componentInstance.path = componentPath;

        this.logger.info(`[ComponentManager] Cloning ${componentDef.name} from ${componentDef.source.url}`);
        
        // Clone repository
        const commandManager = getExternalCommandManager();
        
        // Build git clone command with options
        const cloneFlags: string[] = [];
        
        // Branch or tag
        if (componentDef.source.gitOptions?.tag) {
            cloneFlags.push(`--branch ${componentDef.source.gitOptions.tag}`);
        } else if (componentInstance.branch) {
            cloneFlags.push(`-b ${componentInstance.branch}`);
        }
        
        // Shallow clone (faster, smaller)
        if (componentDef.source.gitOptions?.shallow) {
            cloneFlags.push('--depth=1');
            this.logger.debug(`[ComponentManager] Using shallow clone for ${componentDef.name}`);
        }
        
        // Recursive (submodules)
        if (componentDef.source.gitOptions?.recursive) {
            cloneFlags.push('--recursive');
        }
        
        const cloneCommand = `git clone ${cloneFlags.join(' ')} "${componentDef.source.url}" "${componentPath}"`.trim();
        
        this.logger.debug(`[ComponentManager] Executing: ${cloneCommand}`);
        
        // Use configurable timeout or default
        const cloneTimeout = componentDef.source.timeouts?.clone || 120000; // Default 2 minutes
        
        const result = await commandManager.execute(cloneCommand, {
            timeout: cloneTimeout,
            enhancePath: true
        });

        if (result.code !== 0) {
            this.logger.error(`[ComponentManager] Git clone failed for ${componentDef.name}`, new Error(result.stderr));
            throw new Error(`Git clone failed: ${result.stderr}`);
        }
        
        this.logger.debug(`[ComponentManager] Clone completed for ${componentDef.name}`);

        // Get current commit hash
        const commitResult = await commandManager.execute(
            'git rev-parse HEAD',
            {
                cwd: componentPath,
                enhancePath: true
            }
        );

        if (commitResult.code === 0) {
            componentInstance.version = commitResult.stdout.trim().substring(0, 8); // Short hash
        }

        // Install dependencies if package.json exists
        const packageJsonPath = path.join(componentPath, 'package.json');
        try {
            await fs.access(packageJsonPath);
            
            if (!options.skipDependencies) {
                this.logger.info(`[ComponentManager] Installing dependencies for ${componentDef.name}`);
                componentInstance.status = 'installing';

                // Use the component's configured Node version if specified
                const nodeVersion = componentDef.configuration?.nodeVersion;
                const installCommand = nodeVersion 
                    ? `fnm use ${nodeVersion} && npm install`
                    : 'npm install';

                this.logger.debug(`[ComponentManager] Running: ${installCommand} in ${componentPath}`);

                // Use configurable timeout or default
                const installTimeout = componentDef.source.timeouts?.install || 300000; // Default 5 minutes

                const installResult = await commandManager.execute(installCommand, {
                    cwd: componentPath,
                    timeout: installTimeout,
                    enhancePath: true,
                    useNodeVersion: nodeVersion || null
                });
                
                if (installResult.code !== 0) {
                    this.logger.warn(`[ComponentManager] npm install had warnings/errors for ${componentDef.name}`);
                } else {
                    this.logger.debug(`[ComponentManager] Dependencies installed successfully for ${componentDef.name}`);
                }
            }
        } catch {
            // No package.json, skip dependency installation
            this.logger.debug(`[ComponentManager] No package.json found for ${componentDef.name}`);
        }

        // Mark as ready
        componentInstance.status = 'ready';
        componentInstance.lastUpdated = new Date();

        this.logger.info(`[ComponentManager] Successfully installed ${componentDef.name}`);

        return {
            success: true,
            component: componentInstance
        };
    }

    /**
     * Install an npm package component
     */
    private async installNpmComponent(
        project: Project,
        componentDef: ComponentDefinition,
        componentInstance: ComponentInstance,
        options: ComponentInstallOptions
    ): Promise<ComponentInstallResult> {
        if (!componentDef.source?.package) {
            throw new Error('NPM package name not provided');
        }

        this.logger.info(`[ComponentManager] Installing npm package: ${componentDef.source.package}`);

        componentInstance.status = 'installing';
        componentInstance.version = options.version || componentDef.source.version || 'latest';

        // For npm packages, we typically install them into a specific component
        // (e.g., demo-inspector gets installed into the frontend component)
        // This is a reference/metadata entry, actual installation happens during frontend setup

        componentInstance.status = 'ready';
        componentInstance.lastUpdated = new Date();
        componentInstance.metadata = {
            packageName: componentDef.source.package,
            installTarget: 'frontend' // Default target for npm packages
        };

        return {
            success: true,
            component: componentInstance
        };
    }

    /**
     * Link a local component (for development)
     */
    private async linkLocalComponent(
        project: Project,
        componentDef: ComponentDefinition,
        componentInstance: ComponentInstance
    ): Promise<ComponentInstallResult> {
        if (!componentDef.source?.url) {
            throw new Error('Local path not provided');
        }

        this.logger.info(`[ComponentManager] Linking local component: ${componentDef.source.url}`);

        // Verify path exists
        try {
            await fs.access(componentDef.source.url);
        } catch {
            throw new Error(`Local path does not exist: ${componentDef.source.url}`);
        }

        componentInstance.path = componentDef.source.url;
        componentInstance.status = 'ready';
        componentInstance.lastUpdated = new Date();
        componentInstance.metadata = {
            isLocal: true
        };

        return {
            success: true,
            component: componentInstance
        };
    }

    /**
     * Update a component's status
     */
    public async updateComponentStatus(
        project: Project,
        componentId: string,
        status: ComponentStatus,
        metadata?: Record<string, any>
    ): Promise<void> {
        if (!project.componentInstances) {
            project.componentInstances = {};
        }

        if (!project.componentInstances[componentId]) {
            throw new Error(`Component ${componentId} not found in project`);
        }

        project.componentInstances[componentId].status = status;
        project.componentInstances[componentId].lastUpdated = new Date();

        if (metadata) {
            project.componentInstances[componentId].metadata = {
                ...project.componentInstances[componentId].metadata,
                ...metadata
            };
        }

        this.logger.debug(`[ComponentManager] Updated ${componentId} status to ${status}`);
    }

    /**
     * Get component instance by ID
     */
    public getComponent(project: Project, componentId: string): ComponentInstance | undefined {
        return project.componentInstances?.[componentId];
    }

    /**
     * Get all components of a specific type
     */
    public getComponentsByType(
        project: Project,
        type: ComponentInstance['type']
    ): ComponentInstance[] {
        if (!project.componentInstances) {
            return [];
        }

        return Object.values(project.componentInstances).filter(
            comp => comp.type === type
        );
    }

    /**
     * Remove a component from the project
     */
    public async removeComponent(
        project: Project,
        componentId: string,
        deleteFiles: boolean = false
    ): Promise<void> {
        const component = this.getComponent(project, componentId);
        
        if (!component) {
            throw new Error(`Component ${componentId} not found`);
        }

        this.logger.info(`[ComponentManager] Removing component: ${component.name}`);

        // Delete files if requested and path exists
        if (deleteFiles && component.path) {
            try {
                await fs.rm(component.path, { recursive: true, force: true });
                this.logger.info(`[ComponentManager] Deleted component files: ${component.path}`);
            } catch (error) {
                this.logger.error(`[ComponentManager] Failed to delete component files`, error as Error);
            }
        }

        // Remove from project
        if (project.componentInstances) {
            delete project.componentInstances[componentId];
        }

        this.logger.info(`[ComponentManager] Successfully removed ${component.name}`);
    }

    /**
     * Get the components directory path for a project
     */
    public static getComponentsDirectory(project: Project): string {
        return path.join(project.path, 'components');
    }

    /**
     * Get the path for a specific component
     */
    public static getComponentPath(project: Project, componentId: string): string {
        return path.join(ComponentManager.getComponentsDirectory(project), componentId);
    }
}

