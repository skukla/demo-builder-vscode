/**
 * Demo Builder's Node folder (PR-1a, owner 2026-10-07).
 *
 * Every Node version Demo Builder installs and runs lives in `~/.demo-builder/node/`,
 * handed to fnm as `FNM_DIR` on each call. Everything in it is Demo Builder's by
 * construction, so removing a version it no longer needs is always safe, and the
 * user's own fnm (their versions, their default, their terminal) is never touched.
 * fnm records what is installed, not who installed it (checked 2026-10-07), which is
 * why this is a folder of its own rather than a ledger over the SC's.
 *
 * The env goes on each child process, never into the extension host's own
 * environment, so nothing else in VS Code sees it.
 *
 * @module core/shell/nodeFolder
 */

import * as os from 'os';
import * as path from 'path';
import type { CommandExecutor } from './commandExecutor';
import { DEFAULT_SHELL } from './defaultShell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/** Demo Builder's Node folder, beside its projects and state. */
export function nodeFolderPath(): string {
    return path.join(os.homedir(), '.demo-builder', 'node');
}

/** The env that points an fnm call at Demo Builder's Node folder. */
export function nodeFolderEnv(): { FNM_DIR: string } {
    return { FNM_DIR: nodeFolderPath() };
}

/**
 * Run `command` on Node `major` from Demo Builder's Node folder: `fnm exec --using=<major> <command>`.
 * The caller supplies `nodeFolderEnv()` on the child process. The command runner and
 * the Start Demo terminal use it; the `.mcp.json` launch line builds the same
 * `exec --using=<major>` arguments as an array (`mcpConfigWriter.launchUnderNode`).
 */
export function fnmExecCommand(fnmPath: string, major: string, command: string): string {
    return `${fnmPath} exec --using=${major} ${command}`;
}

/**
 * The same form for a VS Code terminal, which has no env option per command: the
 * folder goes in front as a shell assignment, so it reaches fnm and nothing after it.
 * Plain `fnm`, because a terminal finds it on the user's PATH.
 */
export function fnmTerminalCommand(major: string, command: string): string {
    return `FNM_DIR="${nodeFolderPath()}" ${fnmExecCommand('fnm', major, command)}`;
}

/** The env for a bare `fnm` call (`fnm list`, `fnm install`) that must read or write Demo Builder's Node folder. */
export function nodeFolderProcessEnv(): NodeJS.ProcessEnv {
    return { ...process.env, ...nodeFolderEnv() };
}

/**
 * Parse major versions from fnm list output
 * @param stdout - Output from fnm list command
 * @returns Array of major version strings (e.g., ['18', '20', '24'])
 */
export function parseMajorVersions(stdout: string): string[] {
    const versions = stdout.trim().split('\n').filter(v => v.trim());
    const majors = new Set<string>();

    for (const version of versions) {
        // Match patterns like "v20.19.5" or "20.19.5"
        const match = /v?(\d+)/.exec(version);
        if (match) {
            majors.add(match[1]);
        }
    }

    return Array.from(majors).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

/**
 * `fnm list` against Demo Builder's Node folder (PR-1a): the one reader of what
 * is installed. Every check asks that folder, because every install lands there; the
 * SC's own fnm answering would report a Node the folder does not have.
 */
export async function readNodeFolderList(commandManager: Pick<CommandExecutor, 'execute'>): Promise<string> {
    const { stdout } = await commandManager.execute('fnm list', {
        timeout: TIMEOUTS.PREREQUISITE_CHECK,
        shell: DEFAULT_SHELL, // Add shell context for fnm availability (fixes ENOENT errors)
        env: nodeFolderProcessEnv(),
    });
    return stdout;
}

/** The Node majors in Demo Builder's Node folder, ascending. */
export async function listNodeFolderMajors(commandManager: Pick<CommandExecutor, 'execute'>): Promise<string[]> {
    return parseMajorVersions(await readNodeFolderList(commandManager));
}
