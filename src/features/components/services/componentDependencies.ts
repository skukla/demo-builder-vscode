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
import { ServiceLocator } from '@/core/di';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { TransformedComponentDefinition } from '@/types';
import type { Logger } from '@/types/logger';
import { DEFAULT_SHELL } from '@/types/shell';

/**
 * Handles npm dependency installation for components
 */
export class ComponentDependencies {
    constructor(private logger: Logger) {}

    /**
     * npm install, then the component's build script when it declares one.
     *
     * The shared core of both public methods — they differ only in their return
     * type, an extra `skipDependencies` gate, and a trailing log, so this holds
     * everything that was written out twice (duplication scan, 2026-07-31).
     *
     * Neither failure is fatal: a component whose install or build warns is still
     * usable, so both paths WARN and continue rather than throwing.
     *
     * @param componentPath - the cloned component directory
     * @param componentDef - supplies the Node version, install timeout, build script
     */
    private async runInstallAndBuild(
        componentPath: string,
        componentDef: TransformedComponentDefinition,
    ): Promise<void> {
        this.logger.debug(`[ComponentManager] Installing dependencies for ${componentDef.name}`);

        const commandManager = ServiceLocator.getCommandExecutor();
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
            this.logger.warn(
                `[ComponentManager] npm install had warnings for ${componentDef.name}`,
            );
        }

        const buildScript = componentDef.configuration?.buildScript;
        if (!buildScript) return;

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

        await this.runInstallAndBuild(componentPath, componentDef);

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
    ): Promise<void> {
        const packageJsonPath = path.join(componentPath, 'package.json');

        try {
            await fs.access(packageJsonPath);
        } catch {
            // No package.json, skip dependency installation
            return;
        }

        if (skipDependencies) {
            return;
        }

        await this.runInstallAndBuild(componentPath, componentDef);
    }
}
