/**
 * Storefront Sync Service (vscode-free).
 *
 * Orchestrates the storefront sync flow shared between the standalone MCP
 * server process (`src/mcp-server.ts`'s `sync_storefront` tool) and the
 * extension dashboard tile (`SyncStorefrontCommand`, shipped in B8). Lives in
 * `src/features/eds/services/` and MUST NOT import `vscode` — the MCP server
 * imports this module at process start.
 *
 * Flow:
 *   1. git add -A
 *   2. git commit -m <message>  (skipped cleanly when nothing to commit)
 *   3. git push  (with token-injected remote URL if `githubToken` is provided;
 *      falls back to ambient git auth otherwise)
 *   4. helixApiClient.previewAndPublishPage  (only when both Helix tokens AND
 *      `githubRepo` are provided)
 *
 * Conflict resolution is NOT handled here. On `git push` rejection the service
 * throws `PushRejectedError`; callers decide whether to surface the rebase /
 * merge-editor flow (the extension wrapper in B8) or return a clean error
 * (the MCP wrapper).
 */

import * as childProcess from 'child_process';
import { promisify } from 'util';
import { injectTokenIntoUrl } from './githubHelpers';
import { previewAndPublishPage } from './helixApiClient';

const execFile = promisify(childProcess.execFile);

export class PushRejectedError extends Error {
    constructor(message: string, readonly stderr?: string) {
        super(message);
        this.name = 'PushRejectedError';
    }
}

export class GitOperationError extends Error {
    constructor(message: string, readonly operation: string, readonly stderr?: string) {
        super(message);
        this.name = 'GitOperationError';
    }
}

export interface SyncAndPublishInput {
    /** Absolute path to the storefront git working tree. */
    storefrontPath: string;
    /** Commit message. Newlines/CR are stripped to a single space. */
    commitMessage: string;
    /** GitHub coordinates for the Helix preview/publish call. Optional. */
    githubRepo?: { owner: string; site: string; branch?: string };
    /** GitHub token used to authenticate `git push`. Optional — falls back to ambient git auth. */
    githubToken?: string;
    /** DA.live IMS token used for the Helix Admin call. Required for Helix step. */
    daLiveToken?: string;
    /** Skip the Helix preview/publish chain even if all tokens are present. */
    skipHelix?: boolean;
    /**
     * Skip the stage + commit steps. Useful for the rebase-recovery path: the
     * extension wrapper has already resolved conflicts and run
     * `git rebase --continue`, so a fresh `git add -A` would mis-stage things
     * and `git commit` would create an empty commit on top of the rebased
     * head. With this flag, the service starts directly at `push`.
     */
    skipCommit?: boolean;
}

export interface SyncAndPublishResult {
    committed: boolean;
    pushed: boolean;
    helixPublished: boolean;
    /** One-line summary safe to log or surface to a user. */
    summary: string;
}

/**
 * Commit, push, and (optionally) publish a storefront in one operation.
 *
 * @throws `PushRejectedError` when `git push` returns a non-fast-forward
 *   rejection (caller should `git pull --rebase` and retry).
 * @throws `GitOperationError` for any other git failure.
 * @throws `HelixApiError` for any Helix admin failure (re-thrown from the client).
 */
export async function syncAndPublish(input: SyncAndPublishInput): Promise<SyncAndPublishResult> {
    const safeMessage = input.commitMessage.replace(/[\n\r]/g, ' ').trim() || 'AI: sync files';
    const result: SyncAndPublishResult = { committed: false, pushed: false, helixPublished: false, summary: '' };

    if (!input.skipCommit) {
        await fetchAndFastForward(input.storefrontPath, input.githubToken);
        await stageAll(input.storefrontPath);

        const commitOutcome = await commit(input.storefrontPath, safeMessage);
        result.committed = commitOutcome === 'committed';

        // Skip push and Helix when there is nothing to commit. Edge case:
        // unpushed local commits without working-tree changes are not pushed
        // by this path — users with unpushed commits should `git push` directly.
        if (!result.committed) {
            result.summary = buildSummary(result);
            return result;
        }
    }

    await push(input.storefrontPath, input.githubToken);
    result.pushed = true;

    if (input.githubRepo && !input.skipHelix && input.githubToken && input.daLiveToken) {
        await previewAndPublishPage(
            input.githubRepo.owner,
            input.githubRepo.site,
            '/',
            input.githubRepo.branch ?? 'main',
            { githubToken: input.githubToken, contentSourceAuthorization: `Bearer ${input.daLiveToken}` },
        );
        result.helixPublished = true;
    }

    result.summary = buildSummary(result);
    return result;
}

// ─── git helpers ────────────────────────────────────────────────────────────

/**
 * Pull remote-only commits into the local clone via a fast-forward BEFORE
 * committing, so the later push fast-forwards instead of being rejected.
 *
 * The storefront's GitHub remote also receives commits the local clone never
 * sees — config.json republish, fstab writes, and asset vendoring all commit
 * through the GitHub API. Those leave the clone behind, and the next sync's
 * push is rejected as non-fast-forward. Fetching + `--ff-only` up front closes
 * that gap for the common case (the user's edits and the API's edits touch
 * different files).
 *
 * Best-effort: a diverged history (local has its own unpushed commits) or a
 * dirty file the incoming commits also touched cannot fast-forward. Those fail,
 * and we swallow the error — the existing push → rebase recovery handles them.
 */
async function fetchAndFastForward(storefrontPath: string, githubToken?: string): Promise<void> {
    try {
        if (githubToken) {
            const { stdout: remoteRaw } = await execFile('git', ['-C', storefrontPath, 'remote', 'get-url', 'origin']);
            const tokenizedUrl = injectTokenIntoUrl(remoteRaw.trim(), githubToken);
            await execFile('git', ['-C', storefrontPath, 'pull', '--ff-only', tokenizedUrl, 'HEAD']);
        } else {
            await execFile('git', ['-C', storefrontPath, 'pull', '--ff-only']);
        }
    } catch {
        // Diverged or dirty — let push → rebase handle it. Not fatal to the sync.
    }
}

async function stageAll(storefrontPath: string): Promise<void> {
    try {
        await execFile('git', ['-C', storefrontPath, 'add', '-A']);
    } catch (err) {
        throw wrapGitError(err, 'add');
    }
}

type CommitOutcome = 'committed' | 'nothing-to-commit';

async function commit(storefrontPath: string, message: string): Promise<CommitOutcome> {
    try {
        await execFile('git', ['-C', storefrontPath, 'commit', '-m', message]);
        return 'committed';
    } catch (err) {
        const stderr = (err as NodeJS.ErrnoException & { stderr?: string }).stderr ?? '';
        const stdout = (err as NodeJS.ErrnoException & { stdout?: string }).stdout ?? '';
        if (/nothing to commit/i.test(stderr) || /nothing to commit/i.test(stdout)) {
            return 'nothing-to-commit';
        }
        throw wrapGitError(err, 'commit');
    }
}

async function push(storefrontPath: string, githubToken?: string): Promise<void> {
    try {
        if (githubToken) {
            const { stdout: remoteRaw } = await execFile('git', ['-C', storefrontPath, 'remote', 'get-url', 'origin']);
            const tokenizedUrl = injectTokenIntoUrl(remoteRaw.trim(), githubToken);
            await execFile('git', ['-C', storefrontPath, 'push', tokenizedUrl, 'HEAD']);
        } else {
            await execFile('git', ['-C', storefrontPath, 'push']);
        }
    } catch (err) {
        const stderr = (err as NodeJS.ErrnoException & { stderr?: string }).stderr ?? '';
        if (/non-fast-forward|rejected/i.test(stderr)) {
            throw new PushRejectedError(
                'git push rejected: remote has new commits. Pull and rebase, then retry.',
                stderr,
            );
        }
        throw wrapGitError(err, 'push');
    }
}

function wrapGitError(err: unknown, operation: string): GitOperationError {
    const stderr = (err as NodeJS.ErrnoException & { stderr?: string }).stderr;
    const baseMessage = err instanceof Error ? err.message : String(err);
    return new GitOperationError(`git ${operation} failed: ${baseMessage}`, operation, stderr);
}

function buildSummary(result: SyncAndPublishResult): string {
    const parts: string[] = [];
    parts.push(result.committed ? 'committed' : 'no changes to commit');
    parts.push(result.pushed ? 'pushed' : 'push skipped');
    if (result.helixPublished) parts.push('Helix preview+publish');
    return parts.join('; ');
}
