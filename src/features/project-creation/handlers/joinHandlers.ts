/**
 * Join-flow message handlers.
 *
 * `handleResolveJoinLink` bridges the Join UI's `onResolve` to the resolveJoinLink
 * service via an injected reader (unit-testable). `createPublicMasterReader` supplies
 * an UNAUTHENTICATED public read of the master, so pasting a link and previewing a
 * storefront needs no GitHub sign-in — the master is public, and GitHub sign-in
 * happens later, at fork creation (decision A).
 */

import { resolveJoinLink, type MasterFileReader, type ResolveJoinResult } from '../services/resolveJoinLink';

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

/** Minimal fetch contract — keeps the reader testable and avoids a global-fetch typing dep. */
export interface MasterFetchResponse {
    ok: boolean;
    status: number;
    text(): Promise<string>;
}
export type FetchLike = (url: string) => Promise<MasterFetchResponse>;

const RAW_HOST = 'https://raw.githubusercontent.com';

/**
 * Build a MasterFileReader that reads the (public) master via an UNAUTHENTICATED
 * raw read — no GitHub sign-in needed to preview a join. 404 ⇒ null (not shareable).
 */
export function createPublicMasterReader(fetchImpl: FetchLike): MasterFileReader {
    return async (owner, repo, path) => {
        const res = await fetchImpl(`${RAW_HOST}/${owner}/${repo}/HEAD/${path}`);
        if (res.status === 404) {
            return null;
        }
        if (!res.ok) {
            throw new Error(`Could not read the storefront (HTTP ${res.status}).`);
        }
        return res.text();
    };
}
