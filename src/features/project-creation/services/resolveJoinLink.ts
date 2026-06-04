/**
 * resolveJoinLink — turns a public master storefront link into a typed
 * JoinDescriptor for seeding the content-SC ("Join a shared storefront") wizard.
 *
 * With a public master, joining is a single paste of a link. The master carries a
 * small self-describing marker (written by the starter) at MASTER_MARKER_PATH; this
 * service parses the link and reads that marker. The file reader is injected so the
 * service stays unit-testable and the caller can wire the public (no-auth)
 * GitHubFileOperations read.
 */

import { parseGitHubUrl } from '@/core/utils';
import { isRecord } from '@/types/typeGuards';

/** Repo path of the master's self-describing marker. */
export const MASTER_MARKER_PATH = '.demo-builder/master.json';

/** Commerce coordinates a content fork inherits from the master. */
export interface MasterCommerceCoords {
    endpoint?: string;
    websiteCode?: string;
    storeCode?: string;
    storeViewCode?: string;
}

/** The self-describing marker the starter writes into a shareable master repo. */
export interface MasterMarker {
    packageId: string;
    commerce?: MasterCommerceCoords;
}

/** Resolved join data used to seed the gallery-less joiner wizard. */
export interface JoinDescriptor {
    upstream: { owner: string; repo: string };
    packageId: string;
    commerce?: MasterCommerceCoords;
}

/**
 * Build the marker the starter writes into a shareable master repo so a content
 * fork can resolve it (the write-side pair of resolveJoinLink). Omits `commerce`
 * when no coords are provided.
 */
export function buildMasterMarker(packageId: string, commerce?: MasterCommerceCoords): MasterMarker {
    return commerce ? { packageId, commerce } : { packageId };
}

/** Serialize a marker to the JSON written at MASTER_MARKER_PATH. */
export function serializeMasterMarker(marker: MasterMarker): string {
    return JSON.stringify(marker, null, 2);
}

/** Reads a file from a public master repo; resolves null when absent (404). */
export type MasterFileReader = (owner: string, repo: string, path: string) => Promise<string | null>;

export type ResolveJoinResult =
    | { ok: true; descriptor: JoinDescriptor }
    | { ok: false; error: string };

/**
 * Resolve a pasted master storefront link into a JoinDescriptor.
 *
 * @param link - Public GitHub repo URL of the master storefront.
 * @param readFile - Reads a repo file (returns null when missing). Public reads need no auth.
 */
export async function resolveJoinLink(link: string, readFile: MasterFileReader): Promise<ResolveJoinResult> {
    const repoInfo = parseGitHubUrl(link);
    if (!repoInfo) {
        return { ok: false, error: 'Enter a valid GitHub storefront link (https://github.com/owner/repo).' };
    }

    const raw = await readFile(repoInfo.owner, repoInfo.repo, MASTER_MARKER_PATH);
    if (raw === null) {
        return { ok: false, error: 'That repository is not a shareable storefront (no storefront marker found).' };
    }

    const marker = parseMarker(raw);
    if (!marker) {
        return { ok: false, error: 'The storefront marker could not be read (invalid format).' };
    }

    return {
        ok: true,
        descriptor: {
            upstream: { owner: repoInfo.owner, repo: repoInfo.repo },
            packageId: marker.packageId,
            commerce: marker.commerce,
        },
    };
}

/** Parse + validate the marker JSON; null on malformed or missing packageId. */
function parseMarker(raw: string): MasterMarker | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isRecord(parsed) || typeof parsed.packageId !== 'string' || parsed.packageId.length === 0) {
        return null;
    }
    const commerce = isRecord(parsed.commerce) ? (parsed.commerce as MasterCommerceCoords) : undefined;
    return { packageId: parsed.packageId, commerce };
}
