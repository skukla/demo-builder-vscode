/**
 * AI Defaults Installer
 *
 * Mutates the storefront's `package.json` to add each MCP package declared in
 * `ai-defaults.json` as a devDependency. Must run AFTER the storefront repo is
 * cloned but BEFORE `npm install` runs — so the storefront's `node_modules`
 * contains every Adobe-supplied MCP after installation.
 *
 * Idempotent: re-running upserts the declared version, leaving other devDeps
 * (and the rest of the package.json) untouched.
 *
 * Also exposes `installAiDefaultsInStorefront(path)` — the two-step recovery
 * pipeline (re-apply devDeps + run npm install) used by the dashboard's
 * "Regenerate AI files" action so projects created before a new MCP entry
 * was added can catch up without a manual terminal session.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import aiDefaultsConfig from '../config/ai-defaults.json';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { AiDefaults } from '@/types/aiDefaults';
import { DEFAULT_SHELL } from '@/types/shell';

const aiDefaults: AiDefaults = aiDefaultsConfig as AiDefaults;

/** Bytes of npm stderr to surface in the failure message — enough for the
 *  npm ERR! tail without flooding the modal. */
const NPM_STDERR_TAIL_BYTES = 500;

/** Result of running the recovery pipeline. */
export interface InstallAiDefaultsResult {
    success: boolean;
    /** Diagnostic when `success` is false; safe to surface in the UI. */
    error?: string;
}

/**
 * Add ai-defaults.json packages as devDependencies on the storefront's package.json.
 *
 * @param storefrontPath - absolute path to the cloned storefront directory
 * @throws if `<storefrontPath>/package.json` is missing or malformed
 */
export async function applyAiDefaultsToStorefrontPackageJson(
    storefrontPath: string,
): Promise<void> {
    const packageJsonPath = path.join(storefrontPath, 'package.json');

    let raw: string;
    try {
        raw = await fsPromises.readFile(packageJsonPath, 'utf-8');
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
            throw new Error(
                `Cannot apply AI defaults: storefront package.json not found at ${packageJsonPath}`,
            );
        }
        throw err;
    }

    let pkg: Record<string, unknown>;
    try {
        pkg = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
        throw new Error(
            `Cannot apply AI defaults: storefront package.json is not valid JSON ` +
            `(${packageJsonPath}): ${err instanceof Error ? err.message : String(err)}`,
        );
    }

    const devDeps: Record<string, string> = (pkg.devDependencies as Record<string, string>) ?? {};
    for (const entry of aiDefaults.mcpServers) {
        devDeps[entry.package] = entry.version;
    }
    pkg.devDependencies = devDeps;

    await fsPromises.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
}

/**
 * Recovery pipeline: ensure the storefront's `package.json` declares the
 * ai-defaults packages, then run `npm install` to materialize them into
 * `<storefrontPath>/node_modules/`.
 *
 * Idempotent for projects already in sync (declaration upsert is a no-op,
 * npm install is fast when nothing's missing). For projects predating a
 * given MCP entry, this is the path that puts the missing package on disk
 * without the user dropping to a terminal.
 *
 * Failures are returned as a structured result so the caller (typically the
 * `regenerate-ai-files` handler) can surface a clean message to the modal
 * rather than letting an exception bubble all the way out.
 */
export async function installAiDefaultsInStorefront(
    storefrontPath: string,
): Promise<InstallAiDefaultsResult> {
    try {
        await applyAiDefaultsToStorefrontPackageJson(storefrontPath);
    } catch (err) {
        return { success: false, error: describeInstallerError(err) };
    }

    const executor = ServiceLocator.getCommandExecutor();
    try {
        const result = await executor.execute('npm install', {
            cwd: storefrontPath,
            timeout: TIMEOUTS.VERY_LONG,
            enhancePath: true,
            shell: DEFAULT_SHELL,
        });

        if (result.code !== 0) {
            const tail = (result.stderr ?? '').slice(-NPM_STDERR_TAIL_BYTES).trim();
            const suffix = tail ? `: ${tail}` : '';
            return {
                success: false,
                error: `npm install exited with code ${result.code}${suffix}`,
            };
        }
    } catch (err) {
        return { success: false, error: describeInstallerError(err) };
    }

    return { success: true };
}

/** One-line description of an installer failure, safe to show to the user. */
function describeInstallerError(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
}
