/**
 * The `sync_storefront` MCP tool handler.
 *
 * Commit + push the agent's local storefront edits and publish via Helix,
 * with the one-shot rebase-and-retry for the non-fast-forward race the
 * extension's own ConfigSync writes create routinely.
 *
 * Split from `mcp-server.ts` (god-file decomposition, 2026-08-23); the
 * combined `toolHandlers` object there spreads this map back in.
 *
 * @module mcp/storefrontSyncHandler
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import type { McpToolCredentials } from './credentials';
import { assertInsideProject, resolveProjectPath, resolveStorefrontPath } from './projectSecurity';
import {
    PushRejectedError,
    rebaseOntoRemote,
    syncAndPublish,
    type SyncAndPublishInput,
    type SyncAndPublishResult,
} from '@/features/eds/services/storefront/storefrontSyncService';

/**
 * Read the project manifest and extract the storefront's GitHub repo (owner, repo, branch).
 * Returns undefined if the storefront has no `githubRepo` recorded.
 */
async function readStorefrontGithubRepo(
    projectPath: string,
): Promise<{ owner: string; site: string; branch?: string } | undefined> {
    try {
        const raw = await fsPromises.readFile(
            path.join(projectPath, '.demo-builder.json'),
            'utf-8',
        );
        const manifest = JSON.parse(raw);
        const repo = manifest?.componentInstances?.['eds-storefront']?.metadata?.githubRepo;
        const branch = manifest?.componentInstances?.['eds-storefront']?.metadata?.edsBranch;
        if (typeof repo !== 'string' || !repo.includes('/')) return undefined;
        const [owner, site] = repo.split('/');
        return { owner, site, branch: typeof branch === 'string' ? branch : undefined };
    } catch {
        return undefined;
    }
}

/**
 * Recover from a `non-fast-forward` push rejection: rebase onto the remote's new
 * commits and push again, once.
 *
 * The extension writes to the same branch this clone holds — `ConfigSync`
 * commits config.json straight through the GitHub API — so an agent editing
 * locally loses this race routinely. Left to itself it pulled and MERGED,
 * because "Pull and rebase, then retry" named a remedy and then handed the whole
 * thing back. The extension side already re-reads and retries
 * (`commitTreeToBranch`); this is the same remedy on the side that lacked it.
 *
 * Two things it deliberately does NOT do:
 *   - retry a `ruleset` rejection (filtered by the caller) — replaying a push
 *     that a repository rule refused changes nothing about why it was refused;
 *   - retry twice. A second loser of the same race is reported, not re-run.
 *
 * `rebaseOntoRemote` aborts on conflict, so the checkout is exactly as we found
 * it when this throws.
 */
async function retryAfterRebase(input: SyncAndPublishInput): Promise<SyncAndPublishResult> {
    const outcome = await rebaseOntoRemote(input.storefrontPath, input.githubToken);
    if (outcome === 'aborted') {
        throw new Error(
            'git push was rejected because the remote has new commits, and rebasing onto them ' +
                'conflicts. The rebase was aborted — your storefront is exactly as it was, and ' +
                'nothing was lost. Resolve from VS Code (Demo Builder dashboard → Sync ' +
                'Storefront), which opens the merge editor.',
        );
    }

    // The commit already exists; skipCommit starts this attempt at push. Without
    // it, `git add -A` would re-stage and `git commit` would sit an empty commit
    // on top of the rebased head.
    try {
        return await syncAndPublish({ ...input, skipCommit: true });
    } catch (err) {
        if (err instanceof PushRejectedError) {
            throw new Error(
                `${err.message} Demo Builder already rebased onto the remote once and the push ` +
                    `was rejected again; it does not retry a second time. Your commits are ` +
                    `intact locally.`,
            );
        }
        throw err;
    }
}

/** The storefront-sync tool handler (spread into `toolHandlers` in mcp-server). */
export const storefrontSyncHandler = {
    async syncStorefront(
        projectsDir: string,
        projectName: string,
        commitMessage: string,
        tokens?: McpToolCredentials,
    ): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const storefrontPath = await resolveStorefrontPath(projectPath);
        if (!path.isAbsolute(storefrontPath)) {
            throw new Error(`storefrontPath must be an absolute path: ${storefrontPath}`);
        }
        await assertInsideProject(projectPath, storefrontPath);
        try {
            await fsPromises.stat(path.join(storefrontPath, '.git'));
        } catch {
            throw new Error(`storefrontPath is not a git repository root: ${storefrontPath}`);
        }

        // Credentials come from the live extension session (DaLiveAuthService /
        // GitHubTokenService), injected by registerProjectTools. Absence is fine:
        // git falls back to ambient auth and the Helix publish step is skipped.
        const githubToken = tokens?.githubToken ?? undefined;
        const daLiveToken = tokens?.daLiveToken ?? undefined;

        const githubRepo = await readStorefrontGithubRepo(projectPath);

        const input: SyncAndPublishInput = {
            storefrontPath,
            commitMessage,
            githubRepo,
            githubToken,
            daLiveToken,
        };

        try {
            let result: SyncAndPublishResult;
            try {
                result = await syncAndPublish(input);
            } catch (err) {
                if (!(err instanceof PushRejectedError) || err.reason !== 'non-fast-forward') {
                    throw err;
                }
                result = await retryAfterRebase(input);
            }

            // Keyed on `pushed`, not `committed`: the rebase-and-retry path
            // re-enters syncAndPublish with skipCommit, so it reports
            // committed=false for a sync that pushed a real commit. Reading
            // that as "nothing to commit" told the caller its work had
            // evaporated at exactly the moment it had just been saved.
            if (!result.pushed && !result.helixPublished) return 'Nothing to commit';

            // Name the commit we pushed. Publishing reaches the CDN edge on a
            // delay, so an agent that syncs and then looks at the live site sees
            // the OLD page — and one that has nothing to weigh that against has
            // talked itself into believing its commits were being discarded.
            // The sha is what `git log` can confirm in one command.
            const at = result.commitSha ? ` (commit ${result.commitSha})` : '';
            if (result.helixPublished) {
                return (
                    `Storefront synced and published successfully${at}. Publishing reaches the ` +
                    `CDN edge on a delay — if the live site still shows the old content, that is ` +
                    `propagation, not lost work. Confirm with \`git log\` in the storefront ` +
                    `before changing anything.`
                );
            }
            return (
                `Storefront synced successfully${at} — pushed to GitHub, not published. ` +
                `Call sync_content (or the dashboard's Republish) to publish it to the CDN.`
            );
        } catch (err) {
            if (err instanceof PushRejectedError && err.reason === 'ruleset') {
                // Nothing this surface can do — and nothing VS Code can do
                // either. The content itself has to change.
                throw new Error(err.message);
            }
            if (err instanceof PushRejectedError) {
                throw new Error(
                    `${err.message} Resolve from VS Code (Demo Builder dashboard → Sync Storefront) — ` +
                        `rebase/merge editor is not available in the AI tool surface.`,
                );
            }
            throw err;
        }
    },
};
