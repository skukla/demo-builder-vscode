/**
 * Join-flow message handlers.
 *
 * `handleResolveJoinLink` bridges the Join UI's `onResolve` to the resolveJoinLink
 * service. The GitHub file reader is injected so the handler is unit-testable; the
 * command supplies the real reader via `createGitHubMasterReader`.
 */

import * as vscode from 'vscode';
import { resolveJoinLink, type MasterFileReader, type ResolveJoinResult } from '../services/resolveJoinLink';
import { GitHubFileOperations } from '@/features/eds/services/githubFileOperations';
import { GitHubTokenService } from '@/features/eds/services/githubTokenService';
import type { Logger } from '@/types/logger';

export interface ResolveJoinDeps {
    /** Reads a file from a public master repo; resolves null when absent. */
    readFile: MasterFileReader;
}

/**
 * Resolve a pasted master link into a JoinDescriptor (or a user-facing error).
 */
export async function handleResolveJoinLink(
    payload: { link?: string } | undefined,
    deps: ResolveJoinDeps,
): Promise<ResolveJoinResult> {
    const link = payload?.link?.trim();
    if (!link) {
        return { ok: false, error: 'Enter a storefront link to continue.' };
    }
    return resolveJoinLink(link, deps.readFile);
}

/**
 * Build a MasterFileReader backed by GitHubFileOperations.
 *
 * Note: `getFileContent` authenticates with the user's GitHub token. The joiner
 * authenticates with GitHub to fork the master anyway, so the resolve runs with
 * their token (not a true anonymous read). Returns null on 404.
 */
export function createGitHubMasterReader(secrets: vscode.SecretStorage, logger: Logger): MasterFileReader {
    const ops = new GitHubFileOperations(new GitHubTokenService(secrets, logger), logger);
    return async (owner, repo, path) => {
        const file = await ops.getFileContent(owner, repo, path);
        return file?.content ?? null;
    };
}
