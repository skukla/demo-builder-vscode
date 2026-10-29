/**
 * Running REAL git in a test, safely: the environment every such suite needs, and an
 * executor that points the code's GitHub URLs at local bare repositories.
 *
 * SAFETY. Every git process runs with every `GIT_*` variable removed. The pre-push gate
 * runs jest inside a git hook with `GIT_DIR` set; a suite that inherited it committed a
 * delete-everything tree into the real repository on 2026-09-15. HOME points into the
 * temp root as well, so the developer's global git config (signing, hooks) cannot change
 * what these commands do.
 *
 * Four suites carried their own copy of the environment, word for word, until 2026-10-21.
 */

import { execFileSync, spawnSync } from 'child_process';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { ExecuteOptions } from '@/core/shell/types';
import { createMockCommandExecutor } from './commandExecutorFake';

/** This process's environment with every GIT_* variable removed, plus a fixed identity. */
export function gitEnv(home: string): NodeJS.ProcessEnv {
    const inherited = Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'));
    return {
        ...Object.fromEntries(inherited),
        HOME: home,
        XDG_CONFIG_HOME: home,
        GIT_AUTHOR_NAME: 'test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
    };
}

/** Run git in `cwd` and answer its trimmed stdout; git's own chatter on stderr is kept out of the run. */
export function runGit(home: string, cwd: string, ...args: string[]): string {
    return execFileSync('git', args, { cwd, env: gitEnv(home), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** A GitHub https URL, with or without credentials in it, as the code under test builds it. */
const GITHUB_URL = /https:\/\/(?:[^@\s"]+@)?github\.com\/([^/\s"]+)\/([^/\s"]+?)\.git/g;

/**
 * A CommandExecutor that runs git for real, with every `https://github.com/<owner>/<repo>.git`
 * rewritten to `<root>/github/<owner>/<repo>.git`, a local bare repository. Refuses anything
 * that is not a git command (or, with `alsoNode`, Node's own syntax check). `execute` is a jest spy, so a suite can assert what ran.
 */
export function realGitExecutor(
    root: string,
    home: string,
    options: { alsoNode?: boolean } = {},
): ReturnType<typeof createMockCommandExecutor> {
    const execute = async (command: string, opts: ExecuteOptions = {}) => {
        const allowed = command.startsWith('git ') || (options.alsoNode === true && command.startsWith('node --check '));
        if (!allowed) throw new Error(`not a git command: ${command}`);
        const local = command.replace(GITHUB_URL, (_url, owner: string, repo: string) =>
            pathToFileURL(path.join(root, 'github', owner, `${repo}.git`)).href,
        );
        const run = spawnSync('/bin/bash', ['-c', local], { cwd: opts.cwd, env: gitEnv(home), encoding: 'utf8' });
        return { code: run.status, stdout: run.stdout, stderr: run.stderr, duration: 0 };
    };
    return createMockCommandExecutor({ execute: jest.fn(execute) });
}
