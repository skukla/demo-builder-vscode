/**
 * Whose edit a clashing file holds, so a stopped update can say it.
 *
 * Demo Builder's own pieces are set aside before Adobe's change (`setAsidePieces.ts`), so a file
 * that still clashes holds somebody's edit. On a storefront copied from a colleague's demo it is
 * often the colleague's, brought along at copy time: JustRite's header.js carries Khalil's
 * "Request a Quote" change (2026-10-30). That is told apart by one comparison: when the file in
 * the storefront is byte-for-byte the colleague's version at the commit the storefront last
 * matched, the edit came with the demo. Anything else, or anything that cannot be read, is
 * counted as made in this storefront.
 *
 * @module features/updates/services/clashAttribution
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { injectTokenIntoUrl } from '@/features/eds/services/github/githubHelpers';
import type { GitStep } from '@/features/updates/services/templateMergeBase';
import { describeTemplateConflicts, failure } from '@/features/updates/services/templateSyncMessages';
import type { ClashEdit, TemplateClash, TemplateSyncResult } from '@/features/updates/services/templateSyncTypes';

/** The colleague's demo a storefront was copied from, at the commit it last matched. */
export interface CopiedDemoAt {
    owner: string;
    repo: string;
    commit: string;
}

/** The same, with the URL to fetch it from (with the SC's token for a private repository). */
export interface CopiedDemo extends CopiedDemoAt {
    url: string;
}

/** The colleague's demo a storefront records as its template, at the commit it last matched. */
export function copiedDemoOf(metadata: Record<string, unknown> | undefined): CopiedDemoAt | undefined {
    const owner = metadata?.templateOwner;
    const repo = metadata?.templateRepo;
    const commit = metadata?.lastSyncedCommit;
    if (typeof owner !== 'string' || typeof repo !== 'string' || typeof commit !== 'string') return undefined;
    return { owner, repo, commit };
}

/** Where the colleague's demo is fetched from: with the SC's token when there is one (it may be private). */
function fetchUrl(demo: CopiedDemoAt, token?: string): string {
    const plain = `https://github.com/${demo.owner}/${demo.repo}.git`;
    return token ? injectTokenIntoUrl(plain, token) : plain;
}

/**
 * What a merge that stopped on a clash answers: the files, the change, and whose edit each
 * file holds, in the sentence every surface shows. Nothing was pushed.
 *
 * @param copiedFrom - on the Adobe boilerplate track, the colleague's demo; absent otherwise
 * @param token - the SC's GitHub token, to fetch a private colleague repository
 */
export async function stoppedOnClash(
    git: GitStep,
    conflicts: string[],
    clash: TemplateClash,
    copiedFrom?: CopiedDemoAt,
    token?: string,
): Promise<TemplateSyncResult> {
    const edits = await whoseEdits(git, conflicts, copiedFrom && { ...copiedFrom, url: fetchUrl(copiedFrom, token) });
    return { ...failure('merge', describeTemplateConflicts(edits)), conflicts, clash, edits };
}

const FULL_SHA = /^[0-9a-f]{40}$/;

/** The blob id of `file` at `rev`, or undefined when git cannot name it. */
async function blobOf(git: GitStep, rev: string, file: string): Promise<string | undefined> {
    // The name goes into a shell command: one that could break out of the quotes is not read.
    if (/["$`\\]/.test(file)) return undefined;
    const found = await git(`git rev-parse "${rev}:${file}"`, TIMEOUTS.QUICK);
    const id = found.stdout.trim();
    return found.code === 0 && FULL_SHA.test(id) ? id : undefined;
}

/**
 * Whose edit each clashing file holds, in the order given. Reads only; the checkout's HEAD is
 * the storefront as it is on GitHub.
 *
 * @param copiedFrom - the colleague's demo, on a storefront copied from one; absent otherwise
 */
export async function whoseEdits(git: GitStep, files: readonly string[], copiedFrom?: CopiedDemo): Promise<ClashEdit[]> {
    const storefront = (file: string): ClashEdit => ({ file, whose: 'storefront' });
    if (!copiedFrom || !FULL_SHA.test(copiedFrom.commit)) return files.map(storefront);
    const fetched = await git(`git fetch --quiet --depth 1 "${copiedFrom.url}" ${copiedFrom.commit}`, TIMEOUTS.LONG);
    if (fetched.code !== 0) return files.map(storefront);
    const from = `${copiedFrom.owner}/${copiedFrom.repo}`;
    const edits: ClashEdit[] = [];
    for (const file of files) {
        const ours = await blobOf(git, 'HEAD', file);
        const theirs = await blobOf(git, copiedFrom.commit, file);
        edits.push(ours && ours === theirs ? { file, whose: 'copied-demo', from } : storefront(file));
    }
    return edits;
}
