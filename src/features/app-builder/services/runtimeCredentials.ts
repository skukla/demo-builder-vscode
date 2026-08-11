/**
 * Adobe I/O Runtime workspace utilities for `aio app deploy`.
 *
 * A workspace's Runtime namespace backs App Builder app deploys; this module owns
 * three uses of it, all reading the same `aio console workspace download` config:
 *   - {@link fetchRuntimeCredentials} — materialize `{ namespace, auth }` for a
 *     deploy's env injection (catalog app repos ship no `.env`, so credentials are
 *     fetched per-deploy from the targeted workspace);
 *   - {@link workspaceHasRuntime} — a name-only presence check (no auth handled);
 *   - {@link ensureWorkspaceRuntime} — provision the namespace when it is missing
 *     (create-if-absent + verify), so a selected/imported Runtime-less workspace is
 *     healed before any deploy rather than failing it.
 *
 * `withOrgContext` targets Console operations (AIO_CONSOLE_*), but `aio app deploy`
 * additionally needs RUNTIME credentials — without them the deploy dies with
 * "missing Adobe I/O Runtime namespace" (surfaced live on the first real shell-app
 * deploy, 2026-07-09). Env injection: execa extends process.env, so passing only
 * the two vars merges.
 *
 * SECRET HYGIENE: the downloaded JSON contains the namespace auth key. The file
 * lands in a 0700 temp dir, is deleted in `finally`, and the auth value is never
 * logged.
 */

import * as crypto from 'crypto';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { CommandExecutor } from '@/core/shell';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import { parseJSON, toError } from '@/types/typeGuards';

/** Runtime credentials for one workspace namespace. */
export interface RuntimeCredentials {
    namespace: string;
    auth: string;
}

/** One Runtime namespace entry as the workspace-download JSON reports it. */
interface RuntimeNamespace {
    name?: string;
    auth?: string;
}

/** Shown whenever the targeted workspace has no Runtime namespace (Runtime not enabled). */
const NO_RUNTIME_MESSAGE =
    'The targeted workspace has no Adobe I/O Runtime namespace. Enable Runtime ' +
    'for the workspace in the Adobe Developer Console, then retry the deploy.';

/** Shown when auto-provisioning a Runtime namespace was attempted but did not take. */
const RUNTIME_PROVISION_FAILED_MESSAGE =
    'Could not provision an Adobe I/O Runtime namespace for the workspace. Confirm your ' +
    'account has the Developer role, or enable Runtime for the workspace in the Adobe ' +
    'Developer Console, then retry.';

/** How many times to re-check for the namespace after provisioning (it can lag). */
const RUNTIME_PROVISION_ATTEMPTS = 3;

/** Shape of the workspace-download JSON we consume (defensively partial). */
interface WorkspaceJson {
    project?: {
        workspace?: {
            name?: string;
            details?: {
                runtime?: {
                    namespaces?: Array<{ name?: string; auth?: string }>;
                };
            };
        };
    };
}

/**
 * Fetch the targeted workspace's Runtime namespace + auth.
 *
 * Callers run this inside `withOrgContext` (same contract as the deploy it
 * feeds) so the download hits the project's workspace, not the user's stale
 * global `aio console where` selection.
 *
 * @param commandManager - Executor for the aio CLI call.
 * @param logger - Logger (namespace is logged; auth never is).
 * @param nodeVersion - Node resolution for the aio call (same value the
 *   deploy uses, e.g. 'auto').
 * @throws With an actionable message when the download fails or the workspace
 *   has no Runtime namespace (Runtime not enabled on the workspace).
 */
export async function fetchRuntimeCredentials(
    commandManager: CommandExecutor,
    logger: Logger,
    nodeVersion: string,
): Promise<RuntimeCredentials> {
    try {
        const ns = await downloadRuntimeNamespace(commandManager, nodeVersion);
        if (!ns?.name || !ns?.auth) {
            throw new Error(NO_RUNTIME_MESSAGE);
        }
        logger.debug(`[App Builder] Runtime namespace resolved: ${ns.name}`);
        return { namespace: ns.name, auth: ns.auth };
    } catch (error) {
        throw new Error(`Runtime credential fetch failed: ${toError(error).message}`);
    }
}

/**
 * Whether the targeted workspace has an Adobe I/O Runtime namespace.
 *
 * Only the namespace NAME is inspected; the auth secret is neither returned nor
 * handled. Callers run this inside the deploy's `withOrgContext` so the download
 * hits the right workspace. A download failure propagates (a real error, distinct
 * from "no namespace").
 *
 * @returns true when the workspace has a Runtime namespace, false when it has none.
 */
export async function workspaceHasRuntime(
    commandManager: CommandExecutor,
    nodeVersion: string,
): Promise<boolean> {
    const ns = await downloadRuntimeNamespace(commandManager, nodeVersion);
    return Boolean(ns?.name);
}

/**
 * Ensure the targeted workspace has an Adobe I/O Runtime namespace, PROVISIONING
 * one when it does not.
 *
 * An App Builder app deploy needs Runtime; a mesh does not. Run this before any
 * deploy (inside the deploy's `withOrgContext`) so a workspace that lacks Runtime —
 * a pre-existing or imported one we did not create — is healed in place instead of
 * failing the deploy. Provisioning can lag, so the namespace is re-checked a few
 * times; only if it never appears does this throw (before any mesh is created, so
 * nothing is orphaned).
 *
 * @param provision - Creates the namespace (idempotent SDK `createRuntimeNamespace`).
 * @param pollDelayMs - Delay between post-provision re-checks (injected for tests).
 * @throws When the namespace is absent and provisioning did not make it appear.
 */
export async function ensureWorkspaceRuntime(
    commandManager: CommandExecutor,
    logger: Logger,
    nodeVersion: string,
    provision: () => Promise<void>,
    pollDelayMs: number = TIMEOUTS.POLL.INTERVAL,
): Promise<void> {
    if (await workspaceHasRuntime(commandManager, nodeVersion)) {
        return;
    }
    logger.info('[App Builder] Workspace has no Runtime namespace — provisioning one');
    await provision();
    for (let attempt = 1; attempt <= RUNTIME_PROVISION_ATTEMPTS; attempt++) {
        if (await workspaceHasRuntime(commandManager, nodeVersion)) {
            logger.info('[App Builder] Runtime namespace provisioned');
            return;
        }
        if (attempt < RUNTIME_PROVISION_ATTEMPTS) {
            await sleep(pollDelayMs);
        }
    }
    throw new Error(RUNTIME_PROVISION_FAILED_MESSAGE);
}

/**
 * Download the targeted workspace's config and return its first Runtime namespace
 * (or undefined when the workspace has none). Shared by {@link fetchRuntimeCredentials}
 * (per-deploy credential fetch) and {@link workspaceHasRuntime} (the presence check
 * backing {@link ensureWorkspaceRuntime}'s provision-if-missing path). The downloaded
 * file holds the namespace auth key, so it lands in a 0700 temp dir and is deleted
 * in `finally`.
 */
async function downloadRuntimeNamespace(
    commandManager: CommandExecutor,
    nodeVersion: string,
): Promise<RuntimeNamespace | undefined> {
    const scratchDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'db-ws-'));
    const filePath = path.join(scratchDir, `ws-${crypto.randomBytes(6).toString('hex')}.json`);

    try {
        const result = await commandManager.execute(
            `aio console workspace download "${filePath}"`,
            {
                shell: true,
                timeout: TIMEOUTS.LONG,
                useNodeVersion: nodeVersion,
                enhancePath: true,
            },
        );
        if (result.code !== 0) {
            const detail = extractAioErrorDetail(result.stderr) || `exit code ${result.code}`;
            throw new Error(`Could not download workspace configuration: ${detail}`);
        }

        const raw = await fsPromises.readFile(filePath, 'utf-8');
        const parsed = parseJSON<WorkspaceJson>(raw);
        return parsed?.project?.workspace?.details?.runtime?.namespaces?.[0];
    } finally {
        // The file holds the namespace auth key — always remove it.
        await fsPromises.rm(scratchDir, { recursive: true, force: true }).catch(() => {
            /* best-effort cleanup */
        });
    }
}

/**
 * Extract the meaningful line(s) from aio/oclif stderr. oclif writes spinner
 * frames to stderr too, so a naive `stderr.trim()` surfaces "- Building
 * actions..." instead of the actual `› Error: ...` line — exactly what hid
 * the missing-namespace root cause in the create-flow logs.
 */
export function extractAioErrorDetail(stderr: string | undefined): string {
    if (!stderr) return '';
    const errorLines = stderr
        .split('\n')
        .map((line) => line.replace(/^\s*›\s*/, '').trim())
        .filter((line) => /error/i.test(line));
    return errorLines.join(' ').trim();
}
