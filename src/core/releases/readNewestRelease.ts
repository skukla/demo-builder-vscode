/**
 * The one reader of a repository's GitHub releases. The extension's update check, the
 * component update check, the installer and the patches lookup all ask here, so they agree
 * on what "the newest release" means: the highest version the channel accepts.
 */

import { selectLatestForChannel } from './releaseTrack';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { GitHubRelease, UpdateChannel } from '@/types/releases';

const GITHUB_API = 'https://api.github.com';
const RELEASE_LIST_SIZE = 20;
const HTTP_NOT_FOUND = 404;

export interface ReadReleaseOptions {
    /** Sent as given. Leave out for an anonymous lookup. */
    headers?: Record<string, string>;
    timeoutMs?: number;
    logger?: { debug(message: string): void };
}

function releaseUrl(repo: string, channel: UpdateChannel): string {
    // The latest-release endpoint leaves prereleases out; the list includes them.
    return channel === 'stable'
        ? `${GITHUB_API}/repos/${repo}/releases/latest`
        : `${GITHUB_API}/repos/${repo}/releases?per_page=${RELEASE_LIST_SIZE}`;
}

function toReleaseList(body: unknown, channel: UpdateChannel): GitHubRelease[] {
    const list: unknown = channel === 'stable' ? [body] : body;
    if (!Array.isArray(list)) return [];
    return list.filter((entry: GitHubRelease) => typeof entry?.tag_name === 'string');
}

/**
 * Read the newest release of `owner/repo` that the channel accepts.
 *
 * @returns The release, or null for no such release and for any failure, so a failed lookup
 *          never stops an install or an update check. The reason goes to `logger`.
 */
export async function readNewestRelease(
    repo: string,
    channel: UpdateChannel,
    options: ReadReleaseOptions = {},
): Promise<GitHubRelease | null> {
    const { headers, timeoutMs = TIMEOUTS.QUICK, logger } = options;
    try {
        const response = await fetch(releaseUrl(repo, channel), {
            ...(headers && { headers }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
            // A repository with no releases answers 404. That is normal, so it says nothing.
            if (response.status !== HTTP_NOT_FOUND) {
                logger?.debug(`[Releases] ${repo} answered HTTP ${response.status}`);
            }
            return null;
        }
        return selectLatestForChannel(toReleaseList(await response.json(), channel), channel);
    } catch (error) {
        logger?.debug(`[Releases] Could not read ${repo}: ${(error as Error).message}`);
        return null;
    }
}
