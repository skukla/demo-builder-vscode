/**
 * The row an added demo travels as, and "keep my own copy": the one fork the
 * extension makes for a colleague's demo. Shared by the add and the
 * change-source commits, which differ only in what they do with the row after.
 *
 * The fork is a cloud write into the SC's own account (D28: personal account
 * only); the dialog's tick box is its confirmation. It is skipped when the
 * repository is already the SC's own. The row's `source` is then the fork, so
 * reset and updates follow the copy. We own the copy, so it can be a GitHub
 * template: project creation then generates from it. Best effort; the create
 * path reads the flag live and falls back to a reset when it is not set.
 *
 * @module features/eds/services/sharedDemoCopy
 */

import type { GitHubRepoOperations } from './github/githubRepoOperations';
import type { GitHubTokenService } from './github/githubTokenService';
import type { Logger } from '@/types/logger';
import type { AddedDemo } from '@/types/projectFile';

export const COPY_FAILED =
    "We couldn't make your own copy of this demo. Nothing was changed; you can try again, or go on without a copy.";

/** A demo row with a source and a storefront kind, as the dialog builds it. */
export function isAddedDemo(value: unknown): value is AddedDemo {
    const demo = value as Partial<AddedDemo> | null;
    return (
        typeof demo === 'object' &&
        demo !== null &&
        demo.kind === 'demo' &&
        typeof demo.name === 'string' &&
        typeof demo.source?.owner === 'string' &&
        typeof demo.source.repo === 'string' &&
        (demo.storefrontKind === 'eds' || demo.storefrontKind === 'headless')
    );
}

export interface KeepCopyServices {
    tokenService: Pick<GitHubTokenService, 'validateToken'>;
    repoOperations: Pick<GitHubRepoOperations, 'createFork' | 'setTemplateFlag'>;
}

export type KeepCopyOutcome = { row: AddedDemo; forkedTo?: string } | { error: string };

/**
 * Fork the demo into the signed-in account and answer the row that reads from
 * the fork. The SC's own repository is answered unchanged.
 */
export async function keepOwnCopy(
    demo: AddedDemo,
    services: KeepCopyServices,
    logger: Logger,
): Promise<KeepCopyOutcome> {
    const login = (await services.tokenService.validateToken()).user?.login;
    if (login !== undefined && login.toLowerCase() === demo.source.owner.toLowerCase()) {
        return { row: demo };
    }
    try {
        const fork = await services.repoOperations.createFork(demo.source.owner, demo.source.repo);
        const [owner, repo] = fork.fullName.split('/');
        try {
            await services.repoOperations.setTemplateFlag(owner, repo);
        } catch (error) {
            logger.warn(`[SharedDemo] Could not flag ${fork.fullName} as a template: ${(error as Error).message}`);
        }
        return { row: { ...demo, source: { owner, repo, branch: fork.defaultBranch } }, forkedTo: fork.fullName };
    } catch (error) {
        logger.warn(
            `[SharedDemo] Could not keep a copy of ${demo.source.owner}/${demo.source.repo}: ${(error as Error).message}`,
        );
        return { error: COPY_FAILED };
    }
}
