/**
 * Custom Block Library Utilities
 *
 * Utilities for parsing GitHub URLs into block library sources,
 * deriving display names from repo names, and detecting duplicates
 * in the custom library list.
 */

import { parseGitHubUrl } from '@/core/utils/githubUrlParser';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { AddonSource } from '@/types/demoPackages';

/** Parse a GitHub URL into an AddonSource (branch defaults to 'main') */
export function parseCustomBlockLibraryUrl(url: string): AddonSource | null {
    const info = parseGitHubUrl(url);
    if (!info) return null;
    return { owner: info.owner, repo: info.repo, branch: 'main' };
}

/** Derive a display name from a repo name: 'buildright-eds' -> 'Buildright Eds' */
export function deriveBlockLibraryName(repoName: string): string {
    return repoName
        .replace(/[-_]/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/** Check if a source is already in the custom library list (by owner+repo) */
export function isDuplicateCustomLibrary(
    source: AddonSource,
    existing: CustomBlockLibrary[],
): boolean {
    return existing.some(
        e => e.source.owner === source.owner && e.source.repo === source.repo,
    );
}

/** Convert VS Code settings URL strings into CustomBlockLibrary[], silently skipping invalid URLs */
export function parseCustomBlockLibrarySettings(
    urls: string[],
): CustomBlockLibrary[] {
    return urls.reduce<CustomBlockLibrary[]>((acc, url) => {
        const source = parseCustomBlockLibraryUrl(url.trim());
        if (source) {
            acc.push({ name: deriveBlockLibraryName(source.repo), source });
        }
        return acc;
    }, []);
}
