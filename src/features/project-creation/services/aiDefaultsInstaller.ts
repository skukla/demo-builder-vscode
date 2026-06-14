/**
 * AI Defaults Installer
 *
 * Installs the MCP tool packages declared in `ai-defaults.json` into a
 * per-project ISOLATED directory — `<project>/.demo-builder-mcp/` — decoupled
 * from the storefront's `package.json`.
 *
 * Why isolated: the storefront's own `npm install` can abort (the b2b feature
 * pack injects `@dropins` B2B dropins that are 404 on public npm), which used
 * to take the public MCP tool packages down with it — leaving the generated
 * `.mcp.json` pointing at a `node_modules` that never materialized. Installing
 * the (public, always-resolvable) MCP tools in their own throwaway manifest
 * sidesteps the storefront entirely.
 *
 * `resolveMcpToolsDir(projectPath)` is the single source of truth for the
 * isolated location; the MCP config writer and the Adobe MCP update checker
 * anchor to it too.
 *
 * Idempotent: re-running rewrites the tools `package.json` (the declared
 * versions) and re-runs `npm install`, which is a fast no-op when nothing is
 * missing. Used both at project creation and by the dashboard's
 * "Regenerate AI files" action.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import aiDefaultsConfig from '../config/ai-defaults.json';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { AiDefaults } from '@/types/aiDefaults';
import { DEFAULT_SHELL } from '@/types/shell';

const aiDefaults: AiDefaults = aiDefaultsConfig as AiDefaults;

/** Isolated MCP tools directory name, at the project root (outside any git repo). */
const MCP_TOOLS_DIRNAME = '.demo-builder-mcp';

/** Bytes of npm stderr to surface in the failure message — enough for the
 *  npm ERR! tail without flooding the modal. */
const NPM_STDERR_TAIL_BYTES = 500;

/** Result of running the install pipeline. */
export interface InstallAiDefaultsResult {
    success: boolean;
    /** Diagnostic when `success` is false; safe to surface in the UI. */
    error?: string;
}

/**
 * Resolve the per-project isolated MCP tools directory.
 *
 * @param projectPath - absolute path to the project root
 * @returns `<projectPath>/.demo-builder-mcp`
 */
export function resolveMcpToolsDir(projectPath: string): string {
    return path.join(projectPath, MCP_TOOLS_DIRNAME);
}

/**
 * Install the ai-defaults MCP tool packages into the project's isolated
 * `.demo-builder-mcp/` directory.
 *
 * Writes a throwaway `package.json` whose `dependencies` are exactly the
 * ai-defaults packages, then runs `npm install` with cwd set to that dir — so
 * the tools land in `<project>/.demo-builder-mcp/node_modules/`, never touching
 * the storefront manifest.
 *
 * Failures are returned as a structured result so callers (project creation and
 * the `regenerate-ai-files` handler) can surface a clean message rather than
 * letting an exception bubble out.
 *
 * @param projectPath - absolute path to the project root
 */
export async function installAiDefaultsMcpTools(
    projectPath: string,
): Promise<InstallAiDefaultsResult> {
    const toolsDir = resolveMcpToolsDir(projectPath);

    try {
        await fsPromises.mkdir(toolsDir, { recursive: true });

        const dependencies: Record<string, string> = {};
        for (const entry of aiDefaults.mcpServers) {
            dependencies[entry.package] = entry.version;
        }
        const pkg = {
            name: 'demo-builder-mcp-tools',
            private: true,
            version: '1.0.0',
            dependencies,
        };
        await fsPromises.writeFile(
            path.join(toolsDir, 'package.json'),
            JSON.stringify(pkg, null, 2) + '\n',
            'utf-8',
        );
    } catch (err) {
        return { success: false, error: describeInstallerError(err) };
    }

    const executor = ServiceLocator.getCommandExecutor();
    try {
        const result = await executor.execute('npm install', {
            cwd: toolsDir,
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
