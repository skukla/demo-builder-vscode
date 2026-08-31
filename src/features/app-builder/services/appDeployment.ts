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

import * as crypto from 'crypto';
import { promises as fsPromises } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { extractAioErrorDetail, fetchRuntimeCredentials } from './runtimeCredentials';
import type { AppDeploymentResult } from './types';
import type { CommandExecutor } from '@/core/shell';
import { buildComponent } from '@/core/shell/buildComponent';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
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

/** The entry's declared node (e.g. '24'), falling back to the CLI default. */
function resolveNodeVersion(declared?: string): string {
    return declared || APP_NODE_VERSION;
}

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
    const url = webKey ? deployedUrls[webKey] : (Object.values(deployedUrls)[0] ?? '');
    return { url, deployedUrls };
}

/**
 * Import the targeted workspace's Console configuration into an EXTENSION
 * app's directory (`aio app use`) so deploy's registry sync can read it.
 *
 * Runs inside the caller's `withOrgContext`, so the download hits the right
 * workspace. The downloaded file holds the Runtime auth key — 0700 temp dir,
 * deleted in `finally`. `aio app use` also writes a `.env` with those
 * credentials INTO the app dir; it is removed immediately (this pipeline
 * injects runtime credentials per-invocation and keeps secrets off disk) —
 * only the non-secret `.aio` project config remains.
 */
async function importWorkspaceConfig(
    componentPath: string,
    commandManager: CommandExecutor,
    nodeVersion: string,
    logger: Logger,
): Promise<void> {
    const scratchDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'db-use-'));
    const filePath = path.join(scratchDir, `ws-${crypto.randomBytes(6).toString('hex')}.json`);
    try {
        const download = await commandManager.execute(
            `aio console workspace download "${filePath}"`,
            { shell: true, timeout: TIMEOUTS.LONG, useNodeVersion: nodeVersion, enhancePath: true },
        );
        if (download.code !== 0) {
            const detail = extractAioErrorDetail(download.stderr) || `exit code ${download.code}`;
            throw new Error(`Could not download workspace configuration: ${detail}`);
        }

        const use = await commandManager.execute(
            `aio app use "${filePath}" --overwrite --no-service-sync --no-input`,
            {
                cwd: componentPath,
                shell: true,
                timeout: TIMEOUTS.LONG,
                useNodeVersion: nodeVersion,
                enhancePath: true,
            },
        );
        if (use.code !== 0) {
            const detail = extractAioErrorDetail(use.stderr) || `exit code ${use.code}`;
            throw new Error(`Could not import workspace configuration: ${detail}`);
        }
        logger.debug('[App Builder] Workspace configuration imported for extension app');
    } finally {
        await fsPromises.rm(scratchDir, { recursive: true, force: true });
        // aio app use writes runtime credentials into the app's .env — remove
        // it; deploy receives them per-invocation instead.
        await fsPromises.rm(path.join(componentPath, '.env'), { force: true });
    }
}

/** Per-deploy options for {@link deployAppComponent}. */
export interface DeployAppOptions {
    onProgress?: ProgressCallback;
    /** The entry's declared Node MAJOR (e.g. '24'); defaults to the CLI's. */
    nodeVersion?: string;
    /**
     * The app's config layout. `'extension'` apps (App Management) need the
     * workspace's Console configuration IMPORTED into the app directory before
     * deploy — their registry sync reads it locally, and without it `aio app
     * deploy` dies with "Cannot read properties of undefined (reading 'org')"
     * (measured live 2026-08-27; the imported `.aio` fixed deploy AND publish).
     * Standalone apps never needed this and skip it.
     */
    layout?: 'standalone' | 'extension';
    /**
     * Consent source for the toolchain refresh-and-retry (PL-6 bridge): asked
     * ONCE when a build fails with a staleness signature. UI paths wire a
     * notification prompt; the headless/MCP path wires the caller's
     * `refreshCli` flag (a handler must never park an agent on a dialog).
     * Absent = no consent available: the failure returns with the remedy hint.
     */
    confirmToolchainRefresh?: () => Promise<boolean>;
    /**
     * Extra env for the deploy invocation, merged beside the AIO_RUNTIME_*
     * pair. App Management apps pass their `AIO_COMMERCE_AUTH_IMS_*` credential
     * env here (s2sDeployEnv) — the generated actions take these as inputs at
     * deploy time. May carry live secrets: per-invocation only, never logged.
     */
    extraEnv?: Record<string, string>;
}

/**
 * Failure signatures that mean "the CLI's frozen dependency tree, not the
 * app" — each entry carries its provenance. Matching one triggers the
 * consent-gated refresh-and-retry; anything else fails straight through.
 *
 * - Self-reference codegen: webpack 5.107.2 (frozen in a Feb-installed
 *   aio-cli 11.1.2 tree) fails the kit's generated app-management actions;
 *   5.110.0 from a fresh install of the SAME CLI version builds them.
 *   Measured 2026-08-27, clean-room controlled, retraction on AB-1d.
 */
const TOOLCHAIN_STALENESS_PATTERNS: readonly RegExp[] = [
    /Self-reference dependency has unused export name/,
];

/** Does this failure text carry a known toolchain-staleness signature? */
export function isToolchainStalenessError(error: string | undefined): boolean {
    return !!error && TOOLCHAIN_STALENESS_PATTERNS.some((pattern) => pattern.test(error));
}

/**
 * The remedy, spoken to whichever reader hits it: a human at the error state,
 * or an agent that can re-call with the flag.
 */
const TOOLCHAIN_REMEDY_HINT =
    ' This failure is usually an out-of-date Adobe CLI toolchain (its dependencies freeze at ' +
    'install time, so even a version-current install can carry stale internals). Update it with ' +
    '`npm install -g @adobe/aio-cli` and retry — from an AI agent, call again with ' +
    '`refreshCli: true` to do that automatically.';

/**
 * Refresh the global Adobe CLI — the hand-verified fix from 2026-08-27 (same
 * CLI version, freshly resolved dependency tree). Runs under the default
 * node deliberately: that is the silo the executor's `aio` resolves from.
 */
async function refreshGlobalAioCli(
    commandManager: CommandExecutor,
    logger: Logger,
): Promise<{ ok: boolean; error?: string }> {
    const result = await commandManager.execute('npm install -g @adobe/aio-cli --no-fund', {
        shell: DEFAULT_SHELL,
        timeout: TIMEOUTS.VERY_LONG,
        enhancePath: true,
    });
    if (result.code !== 0) {
        const detail =
            result.stderr?.trim().split('\n').slice(-3).join(' ') || `exit ${result.code}`;
        return { ok: false, error: detail };
    }
    logger.debug('[App Builder] Adobe CLI refreshed');
    return { ok: true };
}

/**
 * Deploy an App Builder app from a component directory.
 *
 * @param componentPath - Path to the app directory (contains app.config.yaml)
 * @param commandManager - Executor for running aio/npm commands
 * @param logger - Logger for info/debug/error messages
 * @param opts - progress callback, node version, config layout
 * @returns Deployment result with success status, url, deployedUrls, or error
 */
export async function deployAppComponent(
    componentPath: string,
    commandManager: CommandExecutor,
    logger: Logger,
    opts: DeployAppOptions = {},
): Promise<AppDeploymentResult> {
    const first = await deployAppComponentOnce(componentPath, commandManager, logger, opts);
    if (first.success || !isToolchainStalenessError(first.error)) {
        return first;
    }

    // Toolchain-staleness signature: ask once, refresh, retry ONCE — the
    // whole exchange stays inside this one deploy, so the caller's first try
    // still succeeds on machines that needed healing (PL-6 bridge).
    const consented = await opts.confirmToolchainRefresh?.();
    if (!consented) {
        return { ...first, error: `${first.error}${TOOLCHAIN_REMEDY_HINT}` };
    }

    opts.onProgress?.('Updating Adobe CLI...', 'npm install -g @adobe/aio-cli');
    const refreshed = await refreshGlobalAioCli(commandManager, logger);
    if (!refreshed.ok) {
        return {
            success: false,
            error: `Adobe CLI update failed: ${refreshed.error}. Original failure: ${first.error}`,
        };
    }
    return deployAppComponentOnce(componentPath, commandManager, logger, opts);
}

/** One deploy attempt — the pre-retry body of {@link deployAppComponent}. */
async function deployAppComponentOnce(
    componentPath: string,
    commandManager: CommandExecutor,
    logger: Logger,
    opts: DeployAppOptions = {},
): Promise<AppDeploymentResult> {
    const { onProgress } = opts;
    const node = resolveNodeVersion(opts.nodeVersion);
    try {
        if (opts.layout === 'extension') {
            onProgress?.('Deploying custom integration...', 'Importing workspace configuration');
            await importWorkspaceConfig(componentPath, commandManager, node, logger);
        }

        await buildComponent(
            componentPath,
            commandManager,
            { nodeVersion: node, kind: 'integration', logPrefix: '[App Builder]' },
            logger,
            onProgress,
        );

        // Catalog app repos ship no .env, and withOrgContext only targets
        // Console ops — `aio app deploy` additionally needs RUNTIME credentials
        // or it dies with "missing Adobe I/O Runtime namespace". Fetch them
        // from the targeted workspace and inject per-invocation (execa merges
        // env, so only the two vars are passed; the auth value is never logged).
        onProgress?.('Deploying custom integration...', 'Resolving Runtime credentials');
        const runtimeCreds = await fetchRuntimeCredentials(commandManager, logger, node);
        const runtimeEnv = {
            // Caller-supplied extra env FIRST so the Runtime pair, which this
            // function owns, can never be overridden by it.
            ...(opts.extraEnv ?? {}),
            AIO_RUNTIME_NAMESPACE: runtimeCreds.namespace,
            AIO_RUNTIME_AUTH: runtimeCreds.auth,
        };

        onProgress?.('Deploying custom integration...', 'Running aio app deploy');

        const deployResult = await commandManager.execute('aio app deploy', {
            cwd: componentPath,
            streaming: true,
            shell: true,
            timeout: TIMEOUTS.LONG,
            useNodeVersion: node,
            enhancePath: true,
            env: runtimeEnv,
        });

        if (deployResult.code !== 0) {
            // oclif writes spinner frames to stderr — extract the real
            // `› Error:` line instead of surfacing "- Building actions...".
            const detail =
                extractAioErrorDetail(deployResult.stderr) ||
                deployResult.stderr?.trim() ||
                deployResult.stdout?.trim() ||
                `aio app deploy exited with code ${deployResult.code}`;
            throw new Error(`App deployment failed: ${detail}`);
        }

        onProgress?.('Resolving app URL...', '');

        const urlResult = await commandManager.execute('aio app get-url --json', {
            cwd: componentPath,
            shell: true,
            timeout: TIMEOUTS.LONG,
            useNodeVersion: node,
            enhancePath: true,
            env: runtimeEnv,
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
