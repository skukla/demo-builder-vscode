/**
 * Commands that act on a workspace's Adobe I/O Runtime namespace.
 *
 * `withOrgContext` points `aio` at an org, project and workspace, but that only
 * reaches Console calls. `aio app undeploy` and `aio runtime package …` talk to
 * Runtime, which wants the namespace and its key — without them they fail with
 * "An AUTH key must be specified". Deploy has always fetched the key; undeploy
 * lost it when the runner took removal over, so on 2026-09-21 removing the ERP
 * pair left all fifteen of its packages running in Stage while the dashboard
 * said the removal was done. The check after the undeploy failed the same way
 * and read the empty answer as "nothing deployed".
 *
 * So everything here fetches the key for the targeted workspace, and a command
 * that cannot answer THROWS — "could not look" is never returned as "empty".
 * Callers run these inside `withOrgContext`, which picks the workspace.
 *
 * @module features/app-builder/services/runtimeNamespace
 */

import { extractAioErrorDetail, fetchRuntimeCredentials } from './runtimeCredentials';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { CommandResult } from '@/core/shell/types';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import { parseJSON } from '@/types/typeGuards';

/** What a Runtime command needs: the command runner and a logger. */
export interface RuntimeNamespaceDeps {
    commandManager: CommandExecutor;
    logger: Logger;
}

/** The two variables that point `aio` at one Runtime namespace. */
export interface RuntimeNamespaceEnv {
    AIO_RUNTIME_NAMESPACE: string;
    AIO_RUNTIME_AUTH: string;
}

/**
 * The environment that points `aio` at the targeted workspace's namespace.
 * Fetched per call; the key is never logged.
 *
 * @throws When the workspace's credentials cannot be fetched
 */
export async function runtimeNamespaceEnv(
    deps: RuntimeNamespaceDeps,
): Promise<RuntimeNamespaceEnv> {
    const creds = await fetchRuntimeCredentials(deps.commandManager, deps.logger, 'auto');
    return { AIO_RUNTIME_NAMESPACE: creds.namespace, AIO_RUNTIME_AUTH: creds.auth };
}

/**
 * Run one `aio` command against a namespace.
 *
 * @param command - the full command line
 * @param env - from {@link runtimeNamespaceEnv}
 * @param options - `cwd` for commands that read an app folder; `streaming` to
 *   send the CLI's output to the log as it runs
 */
export function runInNamespace(
    deps: RuntimeNamespaceDeps,
    command: string,
    env: RuntimeNamespaceEnv,
    options: { cwd?: string; streaming?: boolean } = {},
): Promise<CommandResult> {
    return deps.commandManager.execute(command, {
        ...(options.cwd ? { cwd: options.cwd } : {}),
        ...(options.streaming ? { streaming: true } : {}),
        useNodeVersion: 'auto',
        enhancePath: true,
        shell: true,
        timeout: TIMEOUTS.LONG,
        env: { ...env },
    });
}

/** The reason a command failed, in the CLI's own words where it gave any. */
export function commandFailure(command: string, result: CommandResult): string {
    const detail = extractAioErrorDetail(result.stderr) || `exited with code ${result.code}`;
    return `${command}: ${detail}`;
}

/**
 * The Runtime entities a removal cleans up. Rules and triggers are namespace-level
 * and outlive the package whose actions they drive, so each kind is its own list.
 */
export type RuntimeEntityKind = 'rule' | 'trigger' | 'package';

/** What an app declares in Runtime, by kind — the only names removal may delete. */
export interface DeclaredRuntime {
    packages: string[];
    triggers: string[];
    rules: string[];
}

/** Rules first (they point at triggers and actions), then triggers, then packages. */
export const CLEANUP_ORDER: readonly RuntimeEntityKind[] = ['rule', 'trigger', 'package'];

/** A leftover as a person reads it: a bare package name, else "rule x" / "trigger x". */
export const leftoverLabel = (kind: RuntimeEntityKind, name: string): string =>
    kind === 'package' ? name : `${kind} ${name}`;

/**
 * The names of one kind of entity in the targeted workspace's namespace.
 *
 * @param env - reuse a namespace env already fetched; fetched when omitted
 * @throws When the namespace cannot be listed — a failure is never an empty list
 */
export async function listRuntimeNames(
    deps: RuntimeNamespaceDeps,
    kind: RuntimeEntityKind,
    env?: RuntimeNamespaceEnv,
): Promise<string[]> {
    const command = `aio runtime ${kind} list --json`;
    const result = await runInNamespace(deps, command, env ?? (await runtimeNamespaceEnv(deps)));
    if (result.code !== 0) {
        throw new Error(commandFailure(command, result));
    }
    const parsed = parseJSON<Array<{ name?: string }>>(result.stdout.trim());
    if (!Array.isArray(parsed)) {
        throw new Error(`${command}: the answer was not a list`);
    }
    return parsed.map((entry) => entry.name ?? '').filter(Boolean);
}

/**
 * The names of the packages deployed in the targeted workspace's namespace.
 *
 * @param env - reuse a namespace env already fetched; fetched when omitted
 * @throws When the namespace cannot be listed — a failure is never an empty list
 */
export function listRuntimePackages(
    deps: RuntimeNamespaceDeps,
    env?: RuntimeNamespaceEnv,
): Promise<string[]> {
    return listRuntimeNames(deps, 'package', env);
}

/**
 * Delete one entity; a package goes with everything in it.
 *
 * @throws When the CLI refuses
 */
export async function deleteRuntimeEntity(
    deps: RuntimeNamespaceDeps,
    kind: RuntimeEntityKind,
    name: string,
    env: RuntimeNamespaceEnv,
): Promise<void> {
    const command = `aio runtime ${kind} delete ${name}${kind === 'package' ? ' --recursive' : ''}`;
    const result = await runInNamespace(deps, command, env);
    if (result.code !== 0) {
        throw new Error(commandFailure(command, result));
    }
}

/** One activation as `aio runtime activation list --json` answers it (shape read live 2026-09-24). */
interface RawActivation {
    activationId: string;
    name: string;
    namespace: string;
    start: number;
    end?: number;
    duration?: number;
    statusCode?: number;
    version?: string;
    annotations?: Array<{ key: string; value: unknown }>;
}

/** One activation, as an agent reads it: which action, when, how long, how it ended. */
export interface RuntimeActivationRow {
    activationId: string;
    /** `<package>/<action>` from the `path` annotation (`<namespace>/<package>/<action>`). */
    action: string;
    startedAt: string;
    durationMs?: number;
    /** OpenWhisk's status code: 0 success, 1 application error, 2 developer error, 3 internal error. */
    statusCode?: number;
    kind?: string;
}

/** The most `aio runtime activation list` returns in one call (its own `--limit` max). */
export const ACTIVATION_LIST_MAX = 50;

/**
 * Recent activations, newest first — the namespace's own account of what ran.
 * Read for "did the event handler ever fire" and "why did the timer job fail",
 * which nothing else answers (2026-09-24: the answer was fetched by hand).
 *
 * @param options.limit - at most {@link ACTIVATION_LIST_MAX}
 * @param options.action - only activations of this action (the CLI's positional filter)
 * @throws When the list cannot be read — a failure is never an empty list
 */
export async function listRuntimeActivations(
    deps: RuntimeNamespaceDeps,
    env: RuntimeNamespaceEnv,
    options: { limit?: number; action?: string } = {},
): Promise<RuntimeActivationRow[]> {
    const limit = Math.min(Math.max(1, options.limit ?? 30), ACTIVATION_LIST_MAX);
    const command = `aio runtime activation list${options.action ? ` "${options.action}"` : ''} --json --limit ${limit}`;
    const result = await runInNamespace(deps, command, env);
    if (result.code !== 0) {
        throw new Error(commandFailure(command, result));
    }
    const parsed = parseJSON<RawActivation[]>(result.stdout.trim());
    if (!Array.isArray(parsed)) {
        throw new Error(`${command}: the answer was not a list`);
    }
    return parsed.map((a) => {
        const path = a.annotations?.find((x) => x.key === 'path')?.value;
        const kind = a.annotations?.find((x) => x.key === 'kind')?.value;
        return {
            activationId: a.activationId,
            action: typeof path === 'string' ? path.split('/').slice(1).join('/') : a.name,
            startedAt: new Date(a.start).toISOString(),
            ...(a.duration !== undefined ? { durationMs: a.duration } : {}),
            ...(a.statusCode !== undefined ? { statusCode: a.statusCode } : {}),
            ...(typeof kind === 'string' ? { kind } : {}),
        };
    });
}

/** An activation id is 32 hex characters; anything else never reaches the CLI. */
export const ACTIVATION_ID = /^[0-9a-f]{32}$/u;

/**
 * One activation's log lines and its result (`aio runtime activation logs` and
 * `… result`). The logs come back as the CLI prints them, one line each, without
 * its own "=== activation logs" banner.
 *
 * @throws When the logs cannot be read
 */
export async function readRuntimeActivation(
    deps: RuntimeNamespaceDeps,
    env: RuntimeNamespaceEnv,
    activationId: string,
): Promise<{ activationId: string; logs: string[]; result: unknown }> {
    if (!ACTIVATION_ID.test(activationId)) {
        throw new Error('An activation id is 32 hex characters.');
    }
    const logsCommand = `aio runtime activation logs ${activationId}`;
    const logs = await runInNamespace(deps, logsCommand, env);
    if (logs.code !== 0) {
        throw new Error(commandFailure(logsCommand, logs));
    }
    const resultCommand = `aio runtime activation result ${activationId}`;
    const answer = await runInNamespace(deps, resultCommand, env);
    const lines = logs.stdout
        .split('\n')
        .map((l) => l.trimEnd())
        .filter((l) => l && !l.startsWith('=== activation logs'));
    return {
        activationId,
        logs: lines,
        result: answer.code === 0 ? (parseJSON<unknown>(answer.stdout.trim()) ?? answer.stdout.trim()) : undefined,
    };
}
