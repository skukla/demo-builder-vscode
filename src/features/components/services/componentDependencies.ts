/**
 * Component Dependencies Module
 *
 * Handles npm dependency installation and build operations:
 * - npm install for cloned components
 * - Build script execution
 * - Node version management
 *
 * Extracted from ComponentManager for better modularity.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { CommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { TransformedComponentDefinition } from '@/types';
import type { Logger } from '@/types/logger';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';

/**
 * Handles npm dependency installation for components
 */
export class ComponentDependencies {
    /**
     * ADR-015: the executor joins the logger as an injected dependency.
     */
    constructor(
        private logger: Logger,
        private commandManager: CommandExecutor,
    ) {}

    /**
     * npm install, then the component's build script when it declares one.
     *
     * The shared core of both public methods — they differ only in their return
     * type, an extra `skipDependencies` gate, and a trailing log, so this holds
     * everything that was written out twice (duplication scan, 2026-07-31).
     *
     * By default neither failure is fatal — a storefront whose install or build
     * warns is still usable, so both paths WARN and continue. A component with
     * `configuration.strictInstall` (App Builder integrations) makes a FAILED
     * install fatal instead: its deploy requires node_modules, and continuing
     * buries the real npm error under a downstream npx failure.
     *
     * @param componentPath - the cloned component directory
     * @param componentDef - supplies the Node version, install timeout, build script
     * @returns the fatal install error, or undefined when installation may proceed
     */
    private async runInstallAndBuild(
        componentPath: string,
        componentDef: TransformedComponentDefinition,
    ): Promise<string | undefined> {
        this.logger.debug(`[ComponentManager] Installing dependencies for ${componentDef.name}`);

        const commandManager = this.commandManager;
        const nodeVersion = componentDef.configuration?.nodeVersion;
        const installCommand = 'npm install';

        this.logger.debug(
            `[ComponentManager] Running: ${installCommand} with Node ${nodeVersion || 'default'} in ${componentPath}`,
        );

        const installTimeout = componentDef.source?.timeouts?.install || TIMEOUTS.VERY_LONG;

        const installResult = await commandManager.execute(installCommand, {
            cwd: componentPath,
            timeout: installTimeout,
            enhancePath: true,
            useNodeVersion: nodeVersion || null,
            shell: DEFAULT_SHELL,
        });

        if (installResult.code !== 0) {
            if (componentDef.configuration?.strictInstall) {
                const detail =
                    installResult.stderr?.trim().split('\n').slice(-6).join(' ') ||
                    `npm install exited with code ${installResult.code}`;
                return `npm install failed for ${componentDef.name}: ${detail}`;
            }
            this.logger.warn(
                `[ComponentManager] npm install had warnings for ${componentDef.name}`,
            );
        }

        const buildScript = componentDef.configuration?.buildScript;
        if (!buildScript) return undefined;

        const buildResult = await commandManager.execute(`npm run ${buildScript}`, {
            cwd: componentPath,
            timeout: TIMEOUTS.LONG,
            enhancePath: true,
            useNodeVersion: nodeVersion || null,
            shell: DEFAULT_SHELL,
        });

        if (buildResult.code !== 0) {
            this.logger.warn(`[ComponentManager] Build failed for ${componentDef.name}`);
            this.logger.trace(
                `[ComponentManager] Build stderr: ${buildResult.stderr?.substring(0, 500)}`,
            );
        }
        return undefined;
    }

    /**
     * Install npm dependencies for an already-cloned component
     * Used in phase-based installation where clone and npm install are separate
     */
    async installNpmDependencies(
        componentPath: string,
        componentDef: TransformedComponentDefinition,
    ): Promise<{ success: boolean; error?: string }> {
        const packageJsonPath = path.join(componentPath, 'package.json');

        try {
            await fs.access(packageJsonPath);
        } catch {
            // No package.json, nothing to install
            this.logger.debug(`[ComponentManager] No package.json found for ${componentDef.name}, skipping npm install`);
            return { success: true };
        }

        const fatal = await this.runInstallAndBuild(componentPath, componentDef);
        if (fatal) {
            return { success: false, error: fatal };
        }

        this.logger.debug(`[ComponentManager] Dependencies installed for ${componentDef.name}`);
        return { success: true };
    }

    /**
     * Install dependencies as part of Git component installation
     * Runs npm install and optional build script
     */
    async installDependenciesForComponent(
        componentPath: string,
        componentDef: TransformedComponentDefinition,
        skipDependencies: boolean,
    ): Promise<{ success: boolean; error?: string }> {
        const packageJsonPath = path.join(componentPath, 'package.json');

        try {
            await fs.access(packageJsonPath);
        } catch {
            // No package.json, skip dependency installation
            return { success: true };
        }

        if (skipDependencies) {
            return { success: true };
        }

        const fatal = await this.runInstallAndBuild(componentPath, componentDef);
        return fatal ? { success: false, error: fatal } : { success: true };
    }
}
