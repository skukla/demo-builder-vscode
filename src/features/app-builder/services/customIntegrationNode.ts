/**
 * The Node a custom integration needs (PR-1a step 8), read from the
 * repo itself at the add door: its `package.json` `engines.node`, then the one rule
 * (`nodeForRepoRange`): Demo Builder's Node if the range accepts it, else a Node
 * already in Demo Builder's Node folder, else the lowest release it accepts.
 *
 * The repo is read through GitHub's API with the SC's GitHub session when there is
 * one (a private repo), else anonymously (a public one). The release list is fnm's
 * own (`fnm list-remote`); offline, the rule answers from the range alone.
 *
 * @module features/app-builder/services/customIntegrationNode
 */

import type { CustomIntegrationNodeResolver } from './componentEntry';
import { nodeRangeOfRepo } from './integrationRepoReader';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { demoBuilderNode } from '@/core/shell/demoBuilderNode';
import { nodeFolderProcessEnv , listNodeFolderMajors } from '@/core/shell/nodeFolder';
import { nodeForRepoRange, parseFnmReleases } from '@/core/shell/nodeRangeRule';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { publicRepoReaders } from '@/features/eds/services/github/publicGitHubReads';
import type { Logger } from '@/types/logger';

/** Reads one file of a repo at a ref, or undefined when it is not there or not readable. */
export type RepoTextReader = (owner: string, repo: string, path: string, ref?: string) => Promise<string | undefined>;

async function releasesFrom(commandManager: Pick<CommandExecutor, 'execute'>, logger: Pick<Logger, 'debug'>) {
    try {
        const { stdout } = await commandManager.execute('fnm list-remote', {
            timeout: TIMEOUTS.PREREQUISITE_CHECK,
            shell: DEFAULT_SHELL,
            env: nodeFolderProcessEnv(),
        });
        return parseFnmReleases(stdout);
    } catch (error) {
        logger.debug(`[Node] No release list (offline?), answering from the range alone: ${String(error)}`);
        return [];
    }
}

/** The resolver the add door uses, built from a repo reader and the executor. */
export function customIntegrationNodeResolver(
    readRepoText: RepoTextReader,
    commandManager: Pick<CommandExecutor, 'execute'>,
    logger: Pick<Logger, 'debug'>,
): CustomIntegrationNodeResolver {
    return async (source) => {
        const range = await nodeRangeOfRepo((file) => readRepoText(source.owner, source.repo, file, source.branch));
        if (!range) return { ok: true, major: demoBuilderNode() };
        const [folderMajors, releases] = await Promise.all([
            listNodeFolderMajors(commandManager).catch(() => []),
            releasesFrom(commandManager, logger),
        ]);
        return nodeForRepoRange(range, demoBuilderNode(), folderMajors, releases);
    };
}

/** One way to read a file from GitHub (the signed-in and the anonymous reader share it). */
type FileReader = {
    getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<{ content: string } | null>;
};

/**
 * A repo reader over the two GitHub readers the codebase already has: the SC's
 * GitHub session first (a private repo), then the anonymous public reader
 * (`publicRepoReaders`, with its timeout). Not there or unreadable by either:
 * undefined, which the rule reads as "declares no range", so the add carries on with
 * Demo Builder's Node rather than failing on a read.
 */
export function githubRepoTextReader(
    signedIn: FileReader,
    anonymous: FileReader = publicRepoReaders().fileOps,
): RepoTextReader {
    return async (owner, repo, path, ref) => {
        for (const reader of [signedIn, anonymous]) {
            try {
                const file = await reader.getFileContent(owner, repo, path, ref);
                if (file) return file.content;
            } catch {
                // No session, no access, or no answer: try the next reader.
            }
        }
        return undefined;
    };
}
