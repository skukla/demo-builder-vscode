/**
 * Shared component build step
 *
 * Extracted from buildMeshComponent so mesh and App Builder deploys can share
 * the BYTE-IDENTICAL npm-install + npm-build sequence (Option A: share ONLY the
 * build step; each deploy keeps its own honest deploy tail).
 *
 * Behavior (preserved exactly from the original mesh build):
 * - No package.json        -> no-op (nothing to build)
 * - No `build` script      -> early return (install is skipped too, as before)
 * - install exits non-zero -> warn and continue (does NOT abort the build)
 * - build exits non-zero   -> throw with stderr/stdout detail
 *
 * The build command is `npm run build ${buildArgs ?? ''}` so mesh (buildArgs:
 * '-- --force') issues the identical command it did before, while App Builder
 * (buildArgs: undefined) issues a plain `npm run build`.
 */

import { promises as fsPromises } from 'fs';
import * as path from 'path';
import type { CommandExecutor } from './commandExecutor';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import { parseJSON } from '@/types/typeGuards';

export interface BuildComponentOptions {
    nodeVersion: string;
    /** Extra args appended to `npm run build` (e.g. mesh passes '-- --force'). */
    buildArgs?: string;
    /** Log prefix for debug messages (e.g. '[Mesh Deployment]', '[App Builder]'). */
    logPrefix?: string;
}

const INSTALL_COMMAND = 'npm install --production --no-fund --ignore-scripts';

async function hasBuildScript(componentPath: string): Promise<boolean> {
    const packageJsonPath = path.join(componentPath, 'package.json');
    try {
        await fsPromises.access(packageJsonPath);
    } catch {
        return false; // No package.json — nothing to build
    }
    const packageJson = parseJSON<{ scripts?: Record<string, string> }>(
        await fsPromises.readFile(packageJsonPath, 'utf-8'),
    );
    return Boolean(packageJson?.scripts?.build);
}

/**
 * Install dependencies and run the component's `build` script (if present).
 *
 * @param componentPath - Directory containing package.json
 * @param commandManager - Executor used to run npm commands
 * @param opts - Node version, optional build args, optional log prefix
 * @param logger - Logger for debug/warn messages
 * @param onProgress - Optional progress callback
 */
export async function buildComponent(
    componentPath: string,
    commandManager: CommandExecutor,
    opts: BuildComponentOptions,
    logger: Logger,
    onProgress?: (message: string, subMessage?: string) => void,
): Promise<void> {
    if (!(await hasBuildScript(componentPath))) {
        return;
    }

    const prefix = opts.logPrefix ?? '[Build]';
    const execOptions = {
        cwd: componentPath,
        timeout: TIMEOUTS.LONG,
        shell: true,
        useNodeVersion: opts.nodeVersion,
        enhancePath: true,
    };

    logger.debug(`${prefix} Building component...`);
    onProgress?.('Building...', 'Installing dependencies');

    const installResult = await commandManager.execute(INSTALL_COMMAND, execOptions);
    if (installResult.code !== 0) {
        logger.warn(`${prefix} npm install had warnings:`, installResult.stderr?.substring(0, 300));
    }

    onProgress?.('Building...', 'Compiling');

    const buildCommand = `npm run build${opts.buildArgs ? ` ${opts.buildArgs}` : ''}`;
    const buildResult = await commandManager.execute(buildCommand, execOptions);
    if (buildResult.code !== 0) {
        const errorMsg = buildResult.stderr?.trim() || buildResult.stdout?.trim() || 'Build failed';
        throw new Error(`Build failed: ${errorMsg}`);
    }

    logger.debug(`${prefix} Component built successfully`);
}
