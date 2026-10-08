/**
 * Demo Builder's Node folder (PR-1a, owner 2026-10-07).
 *
 * Every Node version Demo Builder installs and runs lives in `~/.demo-builder/node/`,
 * handed to fnm as `FNM_DIR` on each call. Everything in it is Demo Builder's by
 * construction, so removing a version it no longer needs is always safe, and the
 * user's own fnm (their versions, their default, their terminal) is never touched.
 * fnm records what is installed, not who installed it (checked 2026-10-07), which is
 * why this is a separate store rather than a ledger over the shared one.
 *
 * The env goes on each child process, never into the extension host's own
 * environment, so nothing else in VS Code sees it.
 *
 * @module core/shell/nodeFolder
 */

import * as os from 'os';
import * as path from 'path';

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
 * The caller supplies `nodeFolderEnv()` on the child process. The one form every
 * command, terminal and launch line uses, so they cannot disagree.
 */
export function fnmExecCommand(fnmPath: string, major: string, command: string): string {
    return `${fnmPath} exec --using=${major} ${command}`;
}

/**
 * The same form for a VS Code terminal, which has no env option per command: the
 * store goes in front as a shell assignment, so it reaches fnm and nothing after it.
 * Plain `fnm`, because a terminal finds it on the user's PATH.
 */
export function fnmTerminalCommand(major: string, command: string): string {
    return `FNM_DIR="${nodeFolderPath()}" ${fnmExecCommand('fnm', major, command)}`;
}

/** The env for a bare `fnm` call (`fnm list`, `fnm install`) that must read or write Demo Builder's Node folder. */
export function nodeFolderProcessEnv(): NodeJS.ProcessEnv {
    return { ...process.env, ...nodeFolderEnv() };
}
