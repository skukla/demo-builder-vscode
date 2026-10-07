/**
 * The Node an integration from an SC's own repo needs (PR-1a step 8), read from the
 * repo itself at the add door: its `package.json` `engines.node`, then the one rule
 * (`nodeForRepoRange`): Demo Builder's Node if the range accepts it, else a Node
 * already in Demo Builder's folder, else the lowest release it accepts.
 *
 * The repo is read through GitHub's API with the SC's GitHub session when there is
 * one (a private repo), else anonymously (a public one). The release list is fnm's
 * own (`fnm list-remote`); offline, the rule answers from the range alone.
 *
 * @module features/app-builder/services/ownRepoNode
 */

import type { OwnRepoNodeResolver } from './componentEntry';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { fnmStoreProcessEnv } from '@/core/shell/nodeStore';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { demoBuilderNode } from '@/features/components/services/nodeRequirements';
import { engineRangeOf, nodeForRepoRange, parseFnmReleases } from '@/features/components/services/nodeResolution';
import { listStoreMajors } from '@/features/prerequisites/services/versioning/MultiVersionDetector';
import type { Logger } from '@/types/logger';

/** Reads one file of a repo at a ref, or undefined when it is not there or not readable. */
export type RepoTextReader = (owner: string, repo: string, path: string, ref: string) => Promise<string | undefined>;

async function releasesFrom(commandManager: Pick<CommandExecutor, 'execute'>, logger: Pick<Logger, 'debug'>) {
    try {
        const { stdout } = await commandManager.execute('fnm list-remote', {
            timeout: TIMEOUTS.PREREQUISITE_CHECK,
            shell: DEFAULT_SHELL,
            env: fnmStoreProcessEnv(),
        });
        return parseFnmReleases(stdout);
    } catch (error) {
        logger.debug(`[Node] No release list (offline?), answering from the range alone: ${String(error)}`);
        return [];
    }
}

/** The resolver the add door uses, built from a repo reader and the executor. */
export function ownRepoNodeResolver(
    readRepoText: RepoTextReader,
    commandManager: Pick<CommandExecutor, 'execute'>,
    logger: Pick<Logger, 'debug'>,
): OwnRepoNodeResolver {
    return async (source) => {
        const text = await readRepoText(source.owner, source.repo, 'package.json', source.branch ?? 'HEAD');
        const range = text === undefined ? undefined : engineRangeOf(text);
        if (!range) return { ok: true, major: demoBuilderNode() };
        const [storeMajors, releases] = await Promise.all([
            listStoreMajors(commandManager).catch(() => []),
            releasesFrom(commandManager, logger),
        ]);
        return nodeForRepoRange(range, demoBuilderNode(), storeMajors, releases);
    };
}

/**
 * A repo reader over GitHub: the SC's GitHub session first (a private repo), then an
 * anonymous read (a public one, or no session). Not there or unreadable: undefined,
 * which the rule reads as "declares no range", so the add carries on with
 * Demo Builder's Node rather than failing on a read.
 */
export function githubRepoTextReader(
    fileOps: { getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<{ content: string } | null> },
): RepoTextReader {
    return async (owner, repo, path, ref) => {
        try {
            const file = await fileOps.getFileContent(owner, repo, path, ref);
            if (file) return file.content;
        } catch {
            // No GitHub session, or no access: try it as a public repo.
        }
        try {
            const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`);
            return res.ok ? await res.text() : undefined;
        } catch {
            return undefined;
        }
    };
}
