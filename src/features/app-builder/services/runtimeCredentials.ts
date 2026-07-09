/**
 * Runtime-credential materialization for `aio app deploy`.
 *
 * `withOrgContext` targets Console operations (AIO_CONSOLE_*), but `aio app
 * deploy` additionally needs Adobe I/O RUNTIME credentials — without them the
 * deploy dies with "missing Adobe I/O Runtime namespace" (surfaced live on the
 * first real shell-app deploy, 2026-07-09; slice-1's live probes had been
 * deferred). Catalog app repos deliberately ship no `.env`, so the credentials
 * must be fetched per-deploy from the targeted workspace.
 *
 * Mechanism: `aio console workspace download <file>` (honors the surrounding
 * `withOrgContext` targeting) → parse
 * `project.workspace.details.runtime.namespaces[0]` → return `{ namespace,
 * auth }` for env injection (execa extends process.env, so passing only the
 * two vars merges).
 *
 * SECRET HYGIENE: the downloaded JSON contains the namespace auth key. The
 * file lands in a 0700 temp dir, is deleted in `finally`, and the auth value
 * is never logged.
 */

import * as crypto from 'crypto';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { CommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import { parseJSON, toError } from '@/types/typeGuards';

/** Runtime credentials for one workspace namespace. */
export interface RuntimeCredentials {
    namespace: string;
    auth: string;
}

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
        const ns = parsed?.project?.workspace?.details?.runtime?.namespaces?.[0];
        if (!ns?.name || !ns?.auth) {
            throw new Error(
                'The targeted workspace has no Adobe I/O Runtime namespace. Enable Runtime ' +
                    'for the workspace in the Adobe Developer Console, then retry the deploy.',
            );
        }

        logger.debug(`[App Builder] Runtime namespace resolved: ${ns.name}`);
        return { namespace: ns.name, auth: ns.auth };
    } catch (error) {
        throw new Error(`Runtime credential fetch failed: ${toError(error).message}`);
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
