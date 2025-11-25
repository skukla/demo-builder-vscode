import * as fs from 'fs/promises';
import * as path from 'path';
import { ServiceLocator } from '@/core/di';
import type { ComponentInstallOptions, ComponentInstallResult } from '@/features/components/services/types';
import { Project, ComponentInstance, TransformedComponentDefinition, ComponentStatus } from '@/types';
import type { Logger } from '@/types/logger';
import { DEFAULT_SHELL } from '@/types/shell';

export type { ComponentInstallOptions, ComponentInstallResult };

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
        componentDef: TransformedComponentDefinition,
        options: ComponentInstallOptions = {},
    ): Promise<ComponentInstallResult> {
        try {
            this.logger.debug(`[ComponentManager] Installing component: ${componentDef.name}`);

            // Initialize component instance
            const componentInstance: ComponentInstance = {
                id: componentDef.id,
                name: componentDef.name,
                type: componentDef.type,
                subType: componentDef.subType,
                icon: componentDef.icon,  // Preserve icon from component definition
                status: 'not-installed',
                lastUpdated: new Date(),
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
                        options,
                    );
                
                case 'npm':
                    return await this.installNpmComponent(
                        project,
                        componentDef,
                        componentInstance,
                        options,
                    );
                
                case 'local':
                    return await this.linkLocalComponent(
                        project,
                        componentDef,
                        componentInstance,
                    );
                
                default:
                    throw new Error(`Unsupported source type: ${componentDef.source.type}`);
            }

        } catch (error) {
            this.logger.error(`[ComponentManager] Failed to install ${componentDef.name}`, error as Error);
            return {
                success: false,
                error: (error as Error).message,
            };
        }
    }

    /**
     * Install a Git-based component by cloning the repository
     */
    private async installGitComponent(
        project: Project,
        componentDef: TransformedComponentDefinition,
        componentInstance: ComponentInstance,
        options: ComponentInstallOptions,
    ): Promise<ComponentInstallResult> {
        if (!componentDef.source?.url) {
            throw new Error('Git source URL not provided');
        }

        const componentsDir = path.join(project.path, 'components');
        const componentPath = path.join(componentsDir, componentDef.id);

        // Create components directory if it doesn't exist
        await fs.mkdir(componentsDir, { recursive: true });

        // Clean up any existing component directory (from previous failed attempts)
        try {
            await fs.access(componentPath);
            this.logger.debug(`[ComponentManager] Removing existing component directory: ${componentPath}`);
            await fs.rm(componentPath, { recursive: true, force: true });
        } catch {
            // Directory doesn't exist, no cleanup needed
        }

        // Update status
        componentInstance.status = 'cloning';
        componentInstance.repoUrl = componentDef.source.url;
        componentInstance.branch = options.branch || componentDef.source.branch || 'main';
        componentInstance.path = componentPath;

        this.logger.debug(`[ComponentManager] Cloning ${componentDef.name} from ${componentDef.source.url}`);
        
        // Clone repository
        const commandManager = ServiceLocator.getCommandExecutor();
        
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
        }
        
        // Recursive (submodules)
        if (componentDef.source.gitOptions?.recursive) {
            cloneFlags.push('--recursive');
        }
        
        const cloneCommand = `git clone ${cloneFlags.join(' ')} "${componentDef.source.url}" "${componentPath}"`.trim();
        
        this.logger.debug(`[ComponentManager] Executing: ${cloneCommand}`);

        // Use configurable timeout or default
        const cloneTimeout = componentDef.source.timeouts?.clone || 120000; // Default 2 minutes

        // SECURITY: shell is safe here because:
        // - URL comes from validated component registry (templates/components.json)
        // - Path constructed internally via path.join() (no user input)
        // - Command structure is hardcoded (no injection risk)
        // Shell is REQUIRED to parse quoted arguments correctly
        const result = await commandManager.execute(cloneCommand, {
            timeout: cloneTimeout,
            enhancePath: true,
            shell: DEFAULT_SHELL,
        });

        if (result.code !== 0) {
            this.logger.error(`[ComponentManager] Git clone failed for ${componentDef.name}`, new Error(result.stderr));
            throw new Error(`Git clone failed: ${result.stderr}`);
        }
        
        this.logger.debug(`[ComponentManager] Clone completed for ${componentDef.name}`);

        // Detect component version using hybrid approach:
        // 1. Try git tag (most accurate for releases)
        // 2. Fallback to package.json version
        // 3. Final fallback to commit hash

        let detectedVersion: string | null = null;

        // Strategy 1: Try git describe for tagged commits
        const tagResult = await commandManager.execute(
            'git describe --tags --exact-match HEAD',
            {
                cwd: componentPath,
                enhancePath: true,
                shell: DEFAULT_SHELL,
            },
        );

        if (tagResult.code === 0 && tagResult.stdout.trim()) {
            // On a tagged commit (e.g., "v1.0.0" or "1.0.0")
            detectedVersion = tagResult.stdout.trim().replace(/^v/, ''); // Remove 'v' prefix
            this.logger.debug(`[ComponentManager] Detected version from git tag: ${detectedVersion}`);
        } else {
            // Strategy 2: Try reading package.json version
            const packageJsonPath = path.join(componentPath, 'package.json');
            try {
                await fs.access(packageJsonPath);
                const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
                const packageJson = JSON.parse(packageJsonContent);

                if (packageJson.version) {
                    detectedVersion = packageJson.version;
                    this.logger.debug(`[ComponentManager] Detected version from package.json: ${detectedVersion}`);
                }
            } catch (error) {
                this.logger.debug(`[ComponentManager] Could not read package.json version: ${(error as Error).message}`);
            }
        }

        // Strategy 3: Final fallback to commit hash
        if (!detectedVersion) {
            const commitResult = await commandManager.execute(
                'git rev-parse HEAD',
                {
                    cwd: componentPath,
                    enhancePath: true,
                    shell: DEFAULT_SHELL,
                },
            );

            if (commitResult.code === 0) {
                detectedVersion = commitResult.stdout.trim().substring(0, 8); // Short hash
                this.logger.debug(`[ComponentManager] Using commit hash as version: ${detectedVersion}`);
            }
        }

        // Set the detected version (or leave undefined if all strategies failed)
        if (detectedVersion) {
            componentInstance.version = detectedVersion;
            this.logger.info(`[ComponentManager] ${componentDef.name} version: ${detectedVersion}`);
        } else {
            this.logger.warn(`[ComponentManager] Could not detect version for ${componentDef.name}`);
        }

        // Store Node version in metadata for runtime use
        if (componentDef.configuration?.nodeVersion) {
            componentInstance.metadata = {
                ...componentInstance.metadata,
                nodeVersion: componentDef.configuration.nodeVersion,
            };
        }

        // Create .node-version file if configured (enables fnm auto-switching)
        const configuredNodeVersion = componentDef.configuration?.nodeVersion;
        if (configuredNodeVersion) {
            const nodeVersionFile = path.join(componentPath, '.node-version');
            try {
                // Check if file already exists
                await fs.access(nodeVersionFile);
            } catch {
                // File doesn't exist, create it
                await fs.writeFile(nodeVersionFile, `${configuredNodeVersion}\n`, 'utf-8');
            }
        }

        // Install dependencies if package.json exists
        const packageJsonPath = path.join(componentPath, 'package.json');
        try {
            await fs.access(packageJsonPath);
            
            if (!options.skipDependencies) {
                this.logger.debug(`[ComponentManager] Installing dependencies for ${componentDef.name}`);
                componentInstance.status = 'installing';

                // Use the configured Node version
                const nodeVersion = componentDef.configuration?.nodeVersion;
                
                // Don't include fnm use in command - CommandManager handles it via useNodeVersion option
                const installCommand = 'npm install';

                this.logger.debug(`[ComponentManager] Running: ${installCommand} with Node ${nodeVersion || 'default'} in ${componentPath}`);

                // Use configurable timeout or default
                const installTimeout = componentDef.source.timeouts?.install || 300000; // Default 5 minutes

                const installResult = await commandManager.execute(installCommand, {
                    cwd: componentPath,  // Run from component directory
                    timeout: installTimeout,
                    enhancePath: true,
                    useNodeVersion: nodeVersion || null,  // CommandManager handles fnm use
                    shell: DEFAULT_SHELL,
                });
                
                if (installResult.code !== 0) {
                    this.logger.warn(`[ComponentManager] npm install had warnings/errors for ${componentDef.name}`);
                } else {
                    this.logger.debug(`[ComponentManager] Dependencies installed successfully for ${componentDef.name}`);
                }
                
                // Run build script if configured
                const buildScript = componentDef.configuration?.buildScript;
                if (buildScript && !options.skipDependencies) {
                    this.logger.debug(`[ComponentManager] Running build script for ${componentDef.name}`);
                    
                    // Don't include fnm use in command - CommandManager handles it via useNodeVersion option
                    const buildCommand = `npm run ${buildScript}`;
                    
                    this.logger.debug(`[ComponentManager] Running: ${buildCommand} with Node ${nodeVersion || 'default'} in ${componentPath}`);
                    
                    const buildTimeout = 180000; // 3 minutes for build
                    
                    const buildResult = await commandManager.execute(buildCommand, {
                        cwd: componentPath,  // Run from component directory
                        timeout: buildTimeout,
                        enhancePath: true,
                        useNodeVersion: nodeVersion || null,  // CommandManager handles fnm use
                        shell: DEFAULT_SHELL,
                    });
                    
                    if (buildResult.code !== 0) {
                        this.logger.warn(`[ComponentManager] Build script failed for ${componentDef.name}`);
                        this.logger.debug(`[ComponentManager] Build stderr: ${buildResult.stderr?.substring(0, 500)}`);
                    } else {
                        this.logger.debug(`[ComponentManager] Build completed successfully for ${componentDef.name}`);
                    }
                }
            }
        } catch {
            // No package.json, skip dependency installation
            this.logger.debug(`[ComponentManager] No package.json found for ${componentDef.name}`);
        }

        // Mark as ready
        componentInstance.status = 'ready';
        componentInstance.lastUpdated = new Date();

        this.logger.debug(`[ComponentManager] Successfully installed ${componentDef.name}`);

        return {
            success: true,
            component: componentInstance,
        };
    }

    /**
     * Install an npm package component
     */
    private async installNpmComponent(
        project: Project,
        componentDef: TransformedComponentDefinition,
        componentInstance: ComponentInstance,
        options: ComponentInstallOptions,
    ): Promise<ComponentInstallResult> {
        if (!componentDef.source?.package) {
            throw new Error('NPM package name not provided');
        }

        this.logger.debug(`[ComponentManager] Installing npm package: ${componentDef.source.package}`);

        componentInstance.status = 'installing';
        componentInstance.version = options.version || componentDef.source.version || 'latest';

        // For npm packages, we typically install them into a specific component
        // (e.g., demo-inspector gets installed into the frontend component)
        // This is a reference/metadata entry, actual installation happens during frontend setup

        componentInstance.status = 'ready';
        componentInstance.lastUpdated = new Date();
        componentInstance.metadata = {
            packageName: componentDef.source.package,
            installTarget: 'frontend', // Default target for npm packages
        };

        return {
            success: true,
            component: componentInstance,
        };
    }

    /**
     * Link a local component (for development)
     */
    private async linkLocalComponent(
        project: Project,
        componentDef: TransformedComponentDefinition,
        componentInstance: ComponentInstance,
    ): Promise<ComponentInstallResult> {
        if (!componentDef.source?.url) {
            throw new Error('Local path not provided');
        }

        this.logger.debug(`[ComponentManager] Linking local component: ${componentDef.source.url}`);

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
            isLocal: true,
        };

        return {
            success: true,
            component: componentInstance,
        };
    }

    /**
     * Update a component's status
     */
    public async updateComponentStatus(
        project: Project,
        componentId: string,
        status: ComponentStatus,
        metadata?: Record<string, unknown>,
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
                ...metadata,
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
        type: ComponentInstance['type'],
    ): ComponentInstance[] {
        if (!project.componentInstances) {
            return [];
        }

        return Object.values(project.componentInstances).filter(
            comp => comp.type === type,
        );
    }

    /**
     * Remove a component from the project
     */
    public async removeComponent(
        project: Project,
        componentId: string,
        deleteFiles = false,
    ): Promise<void> {
        const component = this.getComponent(project, componentId);
        
        if (!component) {
            throw new Error(`Component ${componentId} not found`);
        }

        this.logger.debug(`[ComponentManager] Removing component: ${component.name}`);

        // Delete files if requested and path exists
        if (deleteFiles && component.path) {
            try {
                await fs.rm(component.path, { recursive: true, force: true });
                this.logger.debug(`[ComponentManager] Deleted component files: ${component.path}`);
            } catch (error) {
                this.logger.error('[ComponentManager] Failed to delete component files', error as Error);
            }
        }

        // Remove from project
        if (project.componentInstances) {
            delete project.componentInstances[componentId];
        }

        this.logger.debug(`[ComponentManager] Successfully removed ${component.name}`);
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

