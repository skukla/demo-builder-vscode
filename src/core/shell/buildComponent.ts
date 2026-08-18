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
 * - build exits non-zero   -> DUMP stdout/stderr to the debug log, then throw
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
    /**
     * Build policy. `'mesh'` (default) keeps the byte-identical install+build
     * sequence; `'integration'` runs a FULL devDeps install (no `--production`)
     * unconditionally and lets `aio app deploy` drive the build (no `npm run
     * build`). Defaults to `'mesh'` so existing callers are unchanged.
     */
    kind?: 'mesh' | 'integration';
}

/**
 * How much build output to dump on failure.
 *
 * Matches `handleDeployFailure` in `meshDeployment.ts`, which is the sibling
 * dump a reader is told to look for when a mesh step fails.
 */
const BUILD_OUTPUT_LOG_LIMIT = 500;

/** Mesh install: production-only deps, no scripts (byte-identical to the original). */
const INSTALL_COMMAND = 'npm install --production --no-fund --ignore-scripts';
/** Integration install: FULL deps incl. devDeps (a bundler needs them). */
const INTEGRATION_INSTALL_COMMAND = 'npm install --no-fund --ignore-scripts';

async function hasPackageJson(componentPath: string): Promise<boolean> {
    try {
        await fsPromises.access(path.join(componentPath, 'package.json'));
        return true;
    } catch {
        return false;
    }
}

async function hasBuildScript(componentPath: string): Promise<boolean> {
    const packageJsonPath = path.join(componentPath, 'package.json');
    if (!(await hasPackageJson(componentPath))) {
        return false; // No package.json — nothing to build
    }
    const packageJson = parseJSON<{ scripts?: Record<string, string> }>(
        await fsPromises.readFile(packageJsonPath, 'utf-8'),
    );
    return Boolean(packageJson?.scripts?.build);
}

function buildExecOptions(componentPath: string, nodeVersion: string) {
    return {
        cwd: componentPath,
        timeout: TIMEOUTS.LONG,
        shell: true,
        useNodeVersion: nodeVersion,
        enhancePath: true,
    };
}

type ProgressCallback = (message: string, subMessage?: string) => void;

/**
 * MESH build path — BYTE-IDENTICAL to the original behavior:
 *   no build script -> early return (install skipped too);
 *   `npm install --production --no-fund --ignore-scripts` -> `npm run build${buildArgs}`.
 */
async function buildMesh(
    componentPath: string,
    commandManager: CommandExecutor,
    opts: BuildComponentOptions,
    logger: Logger,
    onProgress?: ProgressCallback,
): Promise<void> {
    if (!(await hasBuildScript(componentPath))) {
        return;
    }

    const prefix = opts.logPrefix ?? '[Build]';
    const execOptions = buildExecOptions(componentPath, opts.nodeVersion);

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
        // Dump BEFORE throwing. The thrown message cannot be the record: the
        // logger keeps only its first line (`sanitizeErrorForLogging`), and the
        // path redactor then replaces that line wholesale when it begins with a
        // path — which is exactly what node prints on an uncaught exception.
        // A colleague's failed mesh build reached the log as
        // `Error: Build failed: <path>/` and nothing else, three steps each
        // doing something individually reasonable. The deploy half of this
        // feature has always dumped its output here; the build half had not,
        // so a build failure was the one mesh failure nobody could read.
        logger.debug(`${prefix} Build failed`, {
            code: buildResult.code,
            stdout: buildResult.stdout?.substring(0, BUILD_OUTPUT_LOG_LIMIT),
            stderr: buildResult.stderr?.substring(0, BUILD_OUTPUT_LOG_LIMIT),
        });
        const errorMsg = buildResult.stderr?.trim() || buildResult.stdout?.trim() || 'Build failed';
        // The exit code is carried in the message because it is the one detail
        // redaction cannot erase — `Build failed: <path>/` told the user nothing.
        throw new Error(`Build failed (exit ${buildResult.code}): ${errorMsg}`);
    }

    logger.debug(`${prefix} Component built successfully`);
}

/**
 * INTEGRATION build path — full devDeps install, UNCONDITIONAL (not gated on a
 * `build` script), then let `aio app deploy` drive the build (no `npm run
 * build` here). Spike Q3: the shipped early-return skipped install for
 * integrations, leaving an empty `node_modules`.
 */
async function buildIntegration(
    componentPath: string,
    commandManager: CommandExecutor,
    opts: BuildComponentOptions,
    logger: Logger,
    onProgress?: ProgressCallback,
): Promise<void> {
    if (!(await hasPackageJson(componentPath))) {
        return;
    }

    const prefix = opts.logPrefix ?? '[Build]';
    logger.debug(`${prefix} Installing integration dependencies...`);
    onProgress?.('Building...', 'Installing dependencies');

    const installResult = await commandManager.execute(
        INTEGRATION_INSTALL_COMMAND,
        buildExecOptions(componentPath, opts.nodeVersion),
    );
    if (installResult.code !== 0) {
        logger.warn(`${prefix} npm install had warnings:`, installResult.stderr?.substring(0, 300));
    }

    logger.debug(`${prefix} Integration dependencies installed`);
}

/**
 * Install dependencies (and, for mesh, run the `build` script). Kind-aware:
 * `'mesh'` (default) preserves the original install+build sequence;
 * `'integration'` runs a full devDeps install and defers the build to
 * `aio app deploy`.
 *
 * @param componentPath - Directory containing package.json
 * @param commandManager - Executor used to run npm commands
 * @param opts - Node version, optional build args/log prefix, optional kind
 * @param logger - Logger for debug/warn messages
 * @param onProgress - Optional progress callback
 */
export async function buildComponent(
    componentPath: string,
    commandManager: CommandExecutor,
    opts: BuildComponentOptions,
    logger: Logger,
    onProgress?: ProgressCallback,
): Promise<void> {
    if (opts.kind === 'integration') {
        await buildIntegration(componentPath, commandManager, opts, logger, onProgress);
        return;
    }
    await buildMesh(componentPath, commandManager, opts, logger, onProgress);
}
