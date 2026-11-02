/**
 * What a component's newest release is, for this user. The one question behind every component's
 * install and update, asked from code that holds neither a token nor a way to tell who the user is,
 * so both arrive at activation (`configureReleaseAccess`), as the third-party tools setting does.
 * Until then early access stays closed and the lookup is anonymous.
 *
 * @module core/releases/componentRelease
 */

import * as vscode from 'vscode';
import { readNewestComponentRelease, type ReadReleaseOptions } from './readNewestRelease';
import { releasedRepoOf } from './releasedRepos';
import type { UpdateChannel } from '@/types/releases';

export interface ReleaseAccess {
    /** Whether this user may have early access. Must fail closed. */
    earlyAccessAllowed: () => Promise<boolean>;
    /** Headers for GitHub's API, with the user's token when there is one. */
    headers: () => Promise<Record<string, string>>;
}

const CLOSED: ReleaseAccess = {
    earlyAccessAllowed: async () => false,
    headers: async () => ({}),
};

let access: ReleaseAccess = CLOSED;

export function configureReleaseAccess(next: ReleaseAccess | undefined): void {
    access = next ?? CLOSED;
}

/** A published release of a component. */
export interface ComponentRelease {
    tag: string;
    version: string;
}

/**
 * The channel a lookup actually uses: early access only for those it has been opened to, and
 * beta for anyone else asking for it. The one rule, for the extension's own lookups too.
 * Never throws: a check that fails is a closed door.
 */
export async function channelFor(
    configured: UpdateChannel,
    earlyAccessAllowed: () => Promise<boolean>,
): Promise<UpdateChannel> {
    if (configured !== 'early-access') return configured;
    try {
        return (await earlyAccessAllowed()) ? 'early-access' : 'beta';
    } catch {
        return 'beta';
    }
}

function effectiveChannel(): Promise<UpdateChannel> {
    const configured = vscode.workspace
        .getConfiguration('demoBuilder')
        .get<UpdateChannel>('updateChannel', 'stable');
    return channelFor(configured, access.earlyAccessAllowed);
}

/**
 * The newest release of `owner/repo` on this user's channel.
 *
 * @returns The release, or null for none and for any failure, so a failed lookup never stops
 *          an update check. The reason goes to `logger`.
 */
export async function readComponentRelease(
    repo: string,
    logger?: ReadReleaseOptions['logger'],
): Promise<ComponentRelease | null> {
    try {
        const headers = await access.headers();
        const release = await readNewestComponentRelease(repo, await effectiveChannel(), {
            ...(Object.keys(headers).length > 0 ? { headers } : {}),
            logger,
        });
        return release && { tag: release.tag_name, version: release.tag_name.replace(/^v/, '') };
    } catch (error) {
        logger?.debug(`[Releases] Could not read ${repo}: ${(error as Error).message}`);
        return null;
    }
}

/**
 * The git ref to read a source's files at: the newest release of a repository the builder owns,
 * and otherwise the branch it names. An owned repository with no release yet reads its branch.
 */
export async function refOfSource(
    source: { owner: string; repo: string; branch: string },
    logger?: ReadReleaseOptions['logger'],
): Promise<{ ref: string; version?: string }> {
    const repo = releasedRepoOf(`https://github.com/${source.owner}/${source.repo}`);
    const release = repo ? await readComponentRelease(repo, logger) : null;
    return release ? { ref: release.tag, version: release.version } : { ref: source.branch };
}
