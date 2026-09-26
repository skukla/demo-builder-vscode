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
    let result = await runInNamespace(deps, command, env);
    if (kind === 'package' && result.code !== 0 && PACKAGE_NOT_EMPTY.test(commandFailure(command, result))) {
        await deletePackageActions(deps, name, env);
        result = await runInNamespace(deps, command, env);
    }
    if (result.code !== 0) {
        throw new Error(commandFailure(command, result));
    }
}

/**
 * The refusal a recursive package delete sometimes answers. Measured 2026-09-26 removing the
 * ERP pair: three of eleven packages answered "package not empty (contains N entities) (409
 * Conflict)". The same shapes rebuilt in a throwaway package deleted cleanly, so the cause
 * was not found; emptying the package one action at a time and asking again is the recovery.
 */
const PACKAGE_NOT_EMPTY = /package not empty/u;

/** An action name Runtime allows; anything else never reaches the CLI. */
const ACTION_NAME = /^[A-Za-z0-9_.-]+$/u;

/** Delete every action still in one package, each on its own. A failed delete is left for the retry to report. */
async function deletePackageActions(deps: RuntimeNamespaceDeps, pkg: string, env: RuntimeNamespaceEnv): Promise<void> {
    const listed = await runInNamespace(deps, `aio runtime action list ${pkg} --json`, env);
    const parsed = listed.code === 0 ? parseJSON<Array<{ name?: string }>>(listed.stdout.trim()) : undefined;
    const names = Array.isArray(parsed) ? parsed.map((a) => a.name ?? '').filter((n) => ACTION_NAME.test(n)) : [];
    for (const action of names) {
        await runInNamespace(deps, `aio runtime action delete ${pkg}/${action}`, env);
    }
}
