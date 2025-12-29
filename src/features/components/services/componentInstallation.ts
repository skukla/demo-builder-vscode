/**
 * Component Installation Module
 *
 * Handles Git-based component installation including:
 * - Repository cloning
 * - Submodule initialization
 * - Version detection (git tag, package.json, commit hash)
 * - Node version file creation
 *
 * Extracted from ComponentManager for better modularity.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ServiceLocator } from '@/core/di';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { ComponentInstallOptions, ComponentInstallResult } from '@/features/components/services/types';
import { ComponentInstance, TransformedComponentDefinition } from '@/types';
import type { Logger } from '@/types/logger';
import { DEFAULT_SHELL } from '@/types/shell';

/**
 * Handles Git-based component installation
 */
export class ComponentInstallation {
    constructor(private logger: Logger) {}

    /**
     * Install a Git-based component by cloning the repository
     */
    async installGitComponent(
        projectPath: string,
        componentDef: TransformedComponentDefinition,
        componentInstance: ComponentInstance,
        options: ComponentInstallOptions,
    ): Promise<ComponentInstallResult> {
        if (!componentDef.source?.url) {
            throw new Error('Git source URL not provided');
        }

        const componentsDir = path.join(projectPath, 'components');
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

        this.logger.trace(`[ComponentManager] Executing: ${cloneCommand}`);

        // Use configurable timeout or default
        const cloneTimeout = componentDef.source.timeouts?.clone || TIMEOUTS.COMPONENT_CLONE;

        const cloneStart = Date.now();
        const result = await commandManager.execute(cloneCommand, {
            timeout: cloneTimeout,
            enhancePath: true,
            shell: DEFAULT_SHELL,
        });
        const cloneDuration = Date.now() - cloneStart;

        if (result.code !== 0) {
            this.logger.error(`[ComponentManager] Git clone failed for ${componentDef.name}`);
            this.logger.debug(`[ComponentManager] Clone failed: code=${result.code}, duration=${cloneDuration}ms`);
            this.logger.trace(`[ComponentManager] Clone stderr: ${result.stderr}`);
            this.logger.trace(`[ComponentManager] Clone stdout: ${result.stdout}`);
            throw new Error(`Git clone failed: ${result.stderr}`);
        }

        this.logger.debug(`[ComponentManager] Clone completed for ${componentDef.name} in ${cloneDuration}ms`);

        // Initialize submodules if needed
        await this.initializeSubmodules(componentDef, componentPath, options);

        // Detect component version
        const detectedVersion = await this.detectVersion(componentDef, componentPath);
        if (detectedVersion) {
            componentInstance.version = detectedVersion;
            this.logger.debug(`[ComponentManager] ${componentDef.name} version: ${detectedVersion}`);
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
        await this.createNodeVersionFile(componentDef, componentPath);

        return {
            success: true,
            component: componentInstance,
        };
    }

    /**
     * Initialize selected submodules
     */
    private async initializeSubmodules(
        componentDef: TransformedComponentDefinition,
        componentPath: string,
        options: ComponentInstallOptions,
    ): Promise<void> {
        if (!componentDef.submodules || !options.selectedSubmodules?.length) {
            if (componentDef.submodules) {
                this.logger.debug(`[ComponentManager] Skipping submodule initialization for ${componentDef.name} (none selected)`);
            }
            return;
        }

        const submodulesToInit: string[] = [];

        for (const submoduleId of options.selectedSubmodules) {
            const submoduleConfig = componentDef.submodules[submoduleId];
            if (submoduleConfig?.path) {
                submodulesToInit.push(submoduleConfig.path);
            }
        }

        if (submodulesToInit.length === 0) {
            return;
        }

        this.logger.debug(`[ComponentManager] Initializing selected submodules for ${componentDef.name}: ${submodulesToInit.join(', ')}`);

        const commandManager = ServiceLocator.getCommandExecutor();

        // Initialize each selected submodule
        for (const submodulePath of submodulesToInit) {
            const submoduleCommand = `git submodule update --init "${submodulePath}"`;
            this.logger.trace(`[ComponentManager] Executing submodule command: ${submoduleCommand}`);
            this.logger.trace(`[ComponentManager] Working directory: ${componentPath}`);

            const submoduleStart = Date.now();
            const submoduleResult = await commandManager.execute(
                submoduleCommand,
                {
                    cwd: componentPath,
                    timeout: TIMEOUTS.COMPONENT_CLONE,
                    enhancePath: true,
                    shell: DEFAULT_SHELL,
                },
            );
            const submoduleDuration = Date.now() - submoduleStart;

            if (submoduleResult.code !== 0) {
                this.logger.warn(`[ComponentManager] Failed to initialize submodule ${submodulePath}`);
                this.logger.debug(`[ComponentManager] Submodule init failed: code=${submoduleResult.code}, duration=${submoduleDuration}ms`);
                this.logger.trace(`[ComponentManager] Submodule stderr: ${submoduleResult.stderr}`);
                this.logger.trace(`[ComponentManager] Submodule stdout: ${submoduleResult.stdout}`);
                // Continue with other submodules even if one fails
            } else {
                this.logger.debug(`[ComponentManager] Submodule ${submodulePath} initialized in ${submoduleDuration}ms`);
            }
        }

        this.logger.debug(`[ComponentManager] Submodules initialized for ${componentDef.name}`);
    }

    /**
     * Detect component version using hybrid approach:
     * 1. Try git tag (most accurate for releases)
     * 2. Fallback to package.json version
     * 3. Final fallback to commit hash
     */
    private async detectVersion(
        componentDef: TransformedComponentDefinition,
        componentPath: string,
    ): Promise<string | null> {
        const commandManager = ServiceLocator.getCommandExecutor();
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
            return detectedVersion;
        }

        // No git tag found (expected for repos without tags) - try other strategies
        this.logger.trace(`[ComponentManager] No git tag found, checking package.json`);

        // Strategy 2: Try reading package.json version
        const packageJsonPath = path.join(componentPath, 'package.json');
        try {
            await fs.access(packageJsonPath);
            const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
            const packageJson = JSON.parse(packageJsonContent);

            if (packageJson.version) {
                detectedVersion = packageJson.version;
                this.logger.debug(`[ComponentManager] Detected version from package.json: ${detectedVersion}`);
                return detectedVersion;
            }
        } catch {
            // package.json not readable, will try commit hash
            this.logger.debug(`[ComponentManager] Could not read package.json version, falling back to commit hash`);
        }

        // Strategy 3: Final fallback to commit hash
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

        return detectedVersion;
    }

    /**
     * Create .node-version file if configured (enables fnm auto-switching)
     */
    private async createNodeVersionFile(
        componentDef: TransformedComponentDefinition,
        componentPath: string,
    ): Promise<void> {
        const configuredNodeVersion = componentDef.configuration?.nodeVersion;
        if (!configuredNodeVersion) {
            return;
        }

        const nodeVersionFile = path.join(componentPath, '.node-version');
        try {
            // Check if file already exists
            await fs.access(nodeVersionFile);
        } catch {
            // File doesn't exist, create it
            await fs.writeFile(nodeVersionFile, `${configuredNodeVersion}\n`, 'utf-8');
        }
    }
}
