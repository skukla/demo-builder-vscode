/**
 * ensureFnmNodeVersion — make a Node MAJOR version available via fnm, on
 * demand, at the point of consequence.
 *
 * The graphical prerequisites step cannot cover choice-dependent needs: it
 * runs after Welcome and before Build-Your-Project, integrations are selected
 * after it, and the dashboard/MCP add paths never pass it at all. So the add
 * door calls this instead — the one chokepoint every path shares (the same
 * reasoning as the layout gate beside it). Measured 2026-08-27: the starter
 * kit is engine-strict `node ^24.0.0`; npm under the system's v20 refused to
 * install anything while fnm had a v24 sitting unused on the machine.
 *
 * Install goes through the same `fnm install {major}` the prerequisites
 * system's dynamic node steps use. This asks for the MAJOR, so fnm resolves
 * the latest patch — which matters: kit dependencies pinned patch-level
 * floors (`^24.15.0`) that an older already-installed v24 failed.
 *
 * Everything installs into Demo Builder's own store (`nodeStore.ts`, PR-1a), never
 * the user's fnm. `ensureNodeWithAdobeCli` adds the Adobe CLI under the same Node
 * when it is missing: installing Node alone left a store Node 24 with no `aio`
 * under it (the owner's machine, 2026-10-07: aio under 24.12.0, none under 24.21.0,
 * which is what `fnm exec --using=24` picks).
 *
 * @module core/shell/ensureNodeVersion
 */

import * as fs from 'fs';
import * as path from 'path';
import type { CommandExecutor } from './commandExecutor';
import { EnvironmentSetup } from './environmentSetup';
import { fnmStoreProcessEnv } from './nodeStore';
import type { CommandResult } from './types';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/**
 * What a failed install said, for the log: the last three stderr lines, else the tail
 * of stdout, else why there is nothing (the command never ran). Both streams may be
 * absent: a killed or never-spawned process answers that way (measured 2026-08-27).
 */
export function failureDetail(result: { code: CommandResult['code']; stderr?: string; stdout?: string }): string {
    return (
        result.stderr?.trim().split('\n').slice(-3).join(' ')
        || result.stdout?.trim().slice(-200)
        || `exit code ${result.code ?? 'unknown (command did not run)'}`
    );
}

/**
 * Ensure fnm can supply Node `<major>`. Returns an error string when it
 * cannot (no fnm, install failed); undefined means proceed.
 *
 * Always runs `fnm install <major>`: for an already-satisfied major this is a
 * fast no-op-or-patch-update, and skipping it on a stale patch is exactly the
 * failure measured live (v24.12.0 present, `^24.15.0` required).
 */
export async function ensureFnmNodeVersion(
    executor: CommandExecutor,
    major: string,
    logger: Pick<Logger, 'debug'>,
): Promise<string | undefined> {
    if (!/^\d+$/.test(major)) {
        return `Invalid Node version "${major}" — expected a whole-number major version.`;
    }

    // The extension host's PATH does not carry fnm (measured live 2026-08-27:
    // a bare `fnm install` came back "exit undefined" — spawn never found the
    // binary). Locate it the way the executor's own node-version wrapping
    // does: common install locations first, `which` fallback.
    const fnmPath = new EnvironmentSetup().findFnmPath();
    if (!fnmPath) {
        return (
            `Node ${major} is required but fnm was not found. Install fnm ` +
            `(https://github.com/Schniz/fnm) — the prerequisites screen can do it — and retry.`
        );
    }

    const result = await executor.execute(`${fnmPath} install ${major}`, {
        timeout: TIMEOUTS.LONG,
        enhancePath: true,
        // Into Demo Builder's store, never the user's fnm.
        env: fnmStoreProcessEnv(),
        // Without a shell the executor hands the whole string to the spawner
        // as one binary name and nothing runs (code undefined — measured live).
        shell: DEFAULT_SHELL,
    });

    if (result.code !== 0) {
        const detail = failureDetail(result);
        // The SC reads the sentence; fnm's own words go to the log (ADR-023). A manual
        // `fnm install` would land in the SC's own fnm, which Demo Builder does not read.
        logger.debug(`[EnsureNode] fnm install ${major} failed: ${detail}`);
        return `Demo Builder could not install Node ${major}. Check your internet connection and try again.`;
    }

    logger.debug(`[EnsureNode] Node ${major} available in Demo Builder's store`);
    return undefined;
}

/**
 * Whether a global tool (`binary`, e.g. `aio`) is installed under Demo Builder's Node
 * `<major>`: the file beside that Node's own binary, not whatever copy the PATH would
 * find. The ONE answer to "is it installed under this Node": the prerequisites
 * screen's per-Node check and the add door's ensure both ask it, because running
 * `aio --version` under the Node also finds an `aio` from any other Node on the PATH.
 */
export async function toolInstalledUnder(
    executor: Pick<CommandExecutor, 'execute'>,
    major: string,
    binary: string,
): Promise<boolean> {
    const result = await executor.execute(`node -p "require('path').dirname(process.execPath)"`, {
        useNodeVersion: major,
        shell: DEFAULT_SHELL,
        timeout: TIMEOUTS.NORMAL,
    });
    if (result.code !== 0 || !result.stdout) return false;
    return fs.existsSync(path.join(result.stdout.trim(), binary));
}

/** Whether the Adobe CLI is installed under Demo Builder's Node `<major>`. */
export function adobeCliInstalledUnder(executor: Pick<CommandExecutor, 'execute'>, major: string): Promise<boolean> {
    return toolInstalledUnder(executor, major, 'aio');
}

/**
 * Ensure Node `<major>` in the store and, when it is missing, the Adobe CLI under
 * it, by running `installCommands` (the prerequisites' own `aio-cli` steps and its
 * plugins', handed in by the caller so there is one definition of "install the
 * Adobe CLI"). Returns an error string, or undefined to proceed.
 */
export async function ensureNodeWithAdobeCli(
    executor: CommandExecutor,
    major: string,
    installCommands: readonly string[],
    logger: Pick<Logger, 'debug'>,
): Promise<string | undefined> {
    const nodeError = await ensureFnmNodeVersion(executor, major, logger);
    if (nodeError) return nodeError;
    if (await adobeCliInstalledUnder(executor, major)) return undefined;

    logger.debug(`[EnsureNode] Installing the Adobe CLI under Node ${major} in Demo Builder's store`);
    for (const command of installCommands) {
        const result = await executor.execute(command, {
            useNodeVersion: major,
            shell: DEFAULT_SHELL,
            timeout: TIMEOUTS.VERY_LONG,
        });
        if (result.code !== 0) {
            const detail = result.stderr?.trim().split('\n').slice(-3).join(' ') || `exit code ${result.code}`;
            logger.debug(`[EnsureNode] "${command}" failed under Node ${major}: ${detail}`);
            return `Demo Builder could not install the Adobe CLI for Node ${major}. Check your internet connection and try again.`;
        }
    }
    return undefined;
}
