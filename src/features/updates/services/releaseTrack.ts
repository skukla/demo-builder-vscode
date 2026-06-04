import * as semver from 'semver';
import type { GitHubRelease, UpdateChannel } from './types';

/** A release's track, derived from its semver prerelease identifier. */
export type ReleaseTrack = 'stable' | 'beta' | 'early-access' | 'other';

/** Strip a leading 'v' (mirrors UpdateManager.parseVersionFromTag). */
function cleanTag(tagName: string): string {
    return tagName.replace(/^v/, '');
}

/**
 * Classify a tag into a track by its first semver prerelease identifier.
 * - no prerelease               -> 'stable'
 * - 'beta' id                   -> 'beta'
 * - 'alpha' id                  -> 'early-access'
 * - anything else / unparseable -> 'other' (accepted by NO channel)
 */
export function classifyTrack(tagName: string): ReleaseTrack {
    const parsed = semver.parse(cleanTag(tagName));
    if (!parsed) return 'other';
    if (parsed.prerelease.length === 0) return 'stable';
    const id = String(parsed.prerelease[0]);
    if (id === 'beta') return 'beta';
    if (id === 'alpha') return 'early-access';
    return 'other';
}

/** Which tracks a channel will install. NOTE: beta intentionally EXCLUDES early-access. */
export function channelAcceptsTrack(channel: UpdateChannel, track: ReleaseTrack): boolean {
    if (channel === 'stable') return track === 'stable';
    if (channel === 'beta') return track === 'stable' || track === 'beta';
    // early-access
    return track === 'early-access';
}

/**
 * Pick the highest-semver, non-draft release that the channel accepts.
 * Returns null when nothing matches (graceful: caller treats as "no update").
 */
export function selectLatestForChannel(
    releases: GitHubRelease[],
    channel: UpdateChannel,
): GitHubRelease | null {
    const eligible = releases.filter((r) => {
        if (r.draft) return false;
        return channelAcceptsTrack(channel, classifyTrack(r.tag_name));
    });
    if (eligible.length === 0) return null;

    eligible.sort((a, b) => {
        const va = cleanTag(a.tag_name);
        const vb = cleanTag(b.tag_name);
        if (semver.gt(va, vb)) return -1;
        if (semver.lt(va, vb)) return 1;
        return 0;
    });
    return eligible[0];
}
