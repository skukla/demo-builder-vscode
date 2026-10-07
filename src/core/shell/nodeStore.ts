/**
 * Demo Builder's own Node store (PR-1a, owner 2026-10-07).
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
 * @module core/shell/nodeStore
 */

import * as os from 'os';
import * as path from 'path';

/** The store's folder, beside Demo Builder's projects and state. */
export function demoBuilderFnmDir(): string {
    return path.join(os.homedir(), '.demo-builder', 'node');
}

/** The env that points an fnm call at the store. */
export function fnmStoreEnv(): { FNM_DIR: string } {
    return { FNM_DIR: demoBuilderFnmDir() };
}

/**
 * Run `command` on Node `major` from the store: `fnm exec --using=<major> <command>`.
 * The caller supplies `fnmStoreEnv()` on the child process. The one form every
 * command, terminal and launch line uses, so they cannot disagree.
 */
export function fnmExecCommand(fnmPath: string, major: string, command: string): string {
    return `${fnmPath} exec --using=${major} ${command}`;
}

/** The Adobe CLI's Node, set once at activation from the register (core cannot import it). */
let adobeCliNode: string | undefined;

/** Wire the Adobe CLI's Node in (activation); tests may set or clear it. */
export function setAdobeCliNodeVersion(major: string | undefined): void {
    adobeCliNode = major;
}

/**
 * The Node every `aio` command runs on when its caller names none. Undefined until
 * activation sets it, which leaves the command as its caller wrote it.
 */
export function getAdobeCliNodeVersion(): string | undefined {
    return adobeCliNode;
}
