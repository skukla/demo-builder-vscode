/**
 * App Builder app deployment orchestration
 *
 * Sibling of mesh's deployMeshComponent. Per the locked architecture (Option A),
 * this shares ONLY the byte-identical build step (buildComponent) with mesh and
 * keeps its own honest deploy tail. It is org-agnostic: callers wrap it in
 * withOrgContext, exactly like deployMeshComponent.
 *
 * Sequence:
 *   1. buildComponent (install + npm run build, if a build script exists)
 *   2. `aio app deploy` — idempotent, issued ONCE (no create/update branch)
 *   3. `aio app get-url --json` — parsed DEFENSIVELY into { appId?, url, deployedUrls }
 *
 * NOTE (Step 7 live-verify): the exact JSON shape of `aio app get-url --json` is
 * NOT confirmed without a live workspace. It is roughly a nested map of
 * action/web name -> URL. We parse it best-effort: flatten all string-valued
 * leaves into deployedUrls and pick the first web URL (else the first URL) as the
 * primary `url`. We never throw on a parseable-but-unexpected shape.
 */

import type { AppDeploymentResult } from './types';
import type { CommandExecutor } from '@/core/shell';
import { buildComponent } from '@/core/shell/buildComponent';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import { parseJSON, toError } from '@/types/typeGuards';

export type { AppDeploymentResult };

/**
 * Node version for App Builder app commands.
 *
 * 'auto' resolves to the Node version the Adobe `aio` CLI runs under
 * (findAdobeCLINodeVersion in CommandExecutor) — the same resolution `aio`
 * commands use by default across the codebase. This avoids hardcoding a version
 * and keeps the app on whatever Node hosts the CLI/runtime toolchain.
 *
 * DEFERRED: if an app ever needs a build under its OWN declared Node version
 * (distinct from the CLI's), resolve it from the app's configuration.nodeVersion
 * / detected `.node-version` at that point — most naturally once the curated
 * catalog (slice 2) gives app components a configured version.
 */
const APP_NODE_VERSION = 'auto';

type ProgressCallback = (message: string, subMessage?: string) => void;

/**
 * Flatten a nested URL map into a flat { name -> url } record, keeping only
 * string-valued leaves. Tolerates any shape (returns {} for non-objects).
 */
function flattenUrls(value: unknown, prefix = ''): Record<string, string> {
    const result: Record<string, string> = {};
    if (!value || typeof value !== 'object') {
        return result;
    }
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        const name = prefix ? `${prefix}/${key}` : key;
        if (typeof val === 'string') {
            result[name] = val;
        } else if (val && typeof val === 'object') {
            Object.assign(result, flattenUrls(val, name));
        }
    }
    return result;
}

/**
 * Parse `aio app get-url --json` stdout defensively into a deploy result payload.
 * Never throws: an unparseable or unexpected shape yields empty url/deployedUrls.
 */
function parseGetUrlOutput(stdout: string | undefined): AppDeploymentResult['data'] {
    const parsed = parseJSON<Record<string, unknown>>(stdout ?? '');
    const deployedUrls = flattenUrls(parsed);
    // Prefer a "web" URL as primary; otherwise fall back to the first URL.
    const webKey = Object.keys(deployedUrls).find((k) => k.startsWith('web/'));
    const url = webKey ? deployedUrls[webKey] : Object.values(deployedUrls)[0] ?? '';
    return { url, deployedUrls };
}

/**
 * Deploy an App Builder app from a component directory.
 *
 * @param componentPath - Path to the app directory (contains app.config.yaml)
 * @param commandManager - Executor for running aio/npm commands
 * @param logger - Logger for info/debug/error messages
 * @param onProgress - Optional progress callback
 * @returns Deployment result with success status, url, deployedUrls, or error
 */
export async function deployAppComponent(
    componentPath: string,
    commandManager: CommandExecutor,
    logger: Logger,
    onProgress?: ProgressCallback,
): Promise<AppDeploymentResult> {
    try {
        await buildComponent(
            componentPath,
            commandManager,
            { nodeVersion: APP_NODE_VERSION, kind: 'integration', logPrefix: '[App Builder]' },
            logger,
            onProgress,
        );

        onProgress?.('Deploying App Builder app...', 'Running aio app deploy');

        const deployResult = await commandManager.execute('aio app deploy', {
            cwd: componentPath,
            streaming: true,
            shell: true,
            timeout: TIMEOUTS.LONG,
            useNodeVersion: APP_NODE_VERSION,
            enhancePath: true,
        });

        if (deployResult.code !== 0) {
            const detail = deployResult.stderr?.trim() || deployResult.stdout?.trim() ||
                `aio app deploy exited with code ${deployResult.code}`;
            throw new Error(`App deployment failed: ${detail}`);
        }

        onProgress?.('Resolving app URL...', '');

        const urlResult = await commandManager.execute('aio app get-url --json', {
            cwd: componentPath,
            shell: true,
            timeout: TIMEOUTS.LONG,
            useNodeVersion: APP_NODE_VERSION,
            enhancePath: true,
        });

        if (urlResult.code !== 0) {
            // Deploy already succeeded — a missing URL must not become a failure.
            logger.warn('[App Builder] get-url failed; returning deploy without URL');
            return { success: true, data: { url: '', deployedUrls: {} } };
        }

        return { success: true, data: parseGetUrlOutput(urlResult.stdout) };
    } catch (error) {
        logger.error('[App Builder] Deployment failed', error as Error);
        return { success: false, error: toError(error).message };
    }
}
