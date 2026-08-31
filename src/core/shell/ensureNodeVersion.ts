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
 * @module core/shell/ensureNodeVersion
 */

import type { CommandExecutor } from './commandExecutor';
import { EnvironmentSetup } from './environmentSetup';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';

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
    logger: Logger,
): Promise<string | undefined> {
    if (!/^\d+$/.test(major)) {
        return `Invalid Node version "${major}" — expected a major version like "24".`;
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
        // Without a shell the executor hands the whole string to the spawner
        // as one binary name and nothing runs (code undefined — measured live).
        shell: DEFAULT_SHELL,
    });

    if (result.code !== 0) {
        const detail =
            result.stderr?.trim().split('\n').slice(-3).join(' ') ||
            result.stdout?.trim().slice(-200) ||
            `exit code ${result.code ?? 'unknown (command did not run)'}`;
        return (
            `Node ${major} is required but could not be installed via fnm: ${detail}. ` +
            `Install it manually (\`fnm install ${major}\`) and retry.`
        );
    }

    logger.debug(`[EnsureNode] Node ${major} available via fnm`);
    return undefined;
}
