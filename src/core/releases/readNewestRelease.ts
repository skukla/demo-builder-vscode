/**
 * The one reader of a repository's GitHub releases. The extension's update check, the
 * component update check, the installer and the patches lookup all ask here, so they agree
 * on what "the newest release" means: the highest version the channel accepts.
 */

import { selectLatestForChannel, selectNewestOfAnyTrack } from './releaseTrack';
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

async function readWith(
    repo: string,
    channel: UpdateChannel,
    options: ReadReleaseOptions,
    select: (releases: GitHubRelease[]) => GitHubRelease | null,
): Promise<GitHubRelease | null> {
    const { headers, timeoutMs = TIMEOUTS.QUICK, logger } = options;
    try {
        const response = await fetch(releaseUrl(repo, channel), {
            ...(headers && { headers }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
            // The latest-release endpoint answers 404 for a repository with none. That is normal.
            if (response.status !== HTTP_NOT_FOUND) {
                logger?.debug(`[Releases] ${repo} answered HTTP ${response.status}`);
            }
            return null;
        }
        return select(toReleaseList(await response.json(), channel));
    } catch (error) {
        logger?.debug(`[Releases] Could not read ${repo}: ${(error as Error).message}`);
        return null;
    }
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
    return readWith(repo, channel, options, (releases) =>
        selectLatestForChannel(releases, channel),
    );
}

/**
 * The same read for a component. The extension's early-access channel holds only alphas, because
 * a build graduates from one. A component has no such step, so early access takes the highest of
 * every track, and a collaborator trying an alpha still gets every normal release.
 *
 * The caller decides who may ask for early access.
 */
export async function readNewestComponentRelease(
    repo: string,
    channel: UpdateChannel,
    options: ReadReleaseOptions = {},
): Promise<GitHubRelease | null> {
    // Components are on the extension's beta track until it reaches 1.x (owner, 2026-11-02), so there
    // is no normal release yet for the stable channel to take, and it takes the betas. At 1.x, delete this.
    const track: UpdateChannel = channel === 'stable' ? 'beta' : channel;
    return readWith(repo, track, options, (releases) =>
        track === 'early-access'
            ? selectNewestOfAnyTrack(releases)
            : selectLatestForChannel(releases, track),
    );
}

const RELEASE_TAG_IN_REDIRECT = /\/releases\/tag\/([^/?#]+)$/;

/**
 * The latest normal release's tag, read from where GitHub's web address redirects. It is not under
 * the API's limit of 60 anonymous calls an hour, which everyone in an office shares, so it is
 * what to ask when the API has refused. Null for no release, and for any failure.
 */
export async function readLatestTagFromWeb(repo: string): Promise<string | null> {
    try {
        const response = await fetch(`https://github.com/${repo}/releases/latest`, {
            redirect: 'manual',
            signal: AbortSignal.timeout(TIMEOUTS.QUICK),
        });
        const tag = response.headers.get('location')?.match(RELEASE_TAG_IN_REDIRECT)?.[1];
        return tag ? decodeURIComponent(tag) : null;
    } catch {
        return null;
    }
}
