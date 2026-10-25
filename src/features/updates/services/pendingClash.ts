/**
 * Keep a stopped storefront update's clash in the project's local copy, for the SC's AI
 * to fix (EDS-57 step 2).
 *
 * A template or Adobe boilerplate update applies in a throwaway clone; on a clash that
 * clone is wiped and nothing is left to fix. Here the SAME change (the source's two
 * commits, the same files left out) is applied again in the local storefront copy, the
 * one AGENTS.md sends agents to, after bringing it up to GitHub. The clean files are
 * staged and the clashing ones carry git's markers. The clash is then recorded on the
 * storefront (`pendingClash`) so it survives a reload, and the next check offers to
 * finish it (step 05).
 *
 * Nothing local is lost: the copy must refresh cleanly first (`refreshLocalStorefront`
 * refuses a copy holding anything GitHub lacks), so undoing a mismatched apply with
 * `git reset --hard` only discards what this module just applied. Nothing here pushes.
 *
 * @module features/updates/services/pendingClash
 */

import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { COMPONENT_IDS } from '@/core/constants';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import { injectTokenIntoUrl } from '@/features/eds/services/github/githubHelpers';
import { markKeptClash } from '@/features/eds/services/storefront/keptClashMark';
import { openLocalCopy, refreshLocalStorefront, type LocalCopy } from '@/features/updates/services/localStorefrontRefresh';
import { applyChangeKeepingConflicts } from '@/features/updates/services/templateMergeBase';
import type { TemplateClash } from '@/features/updates/services/templateSyncTypes';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import type { Project } from '@/types/base';

/** Which update the clash belongs to: the template's (colleague's) or Adobe's boilerplate. */
export type ClashTrack = 'template' | 'boilerplate';

/** A clash kept in the local copy, recorded on the storefront until it is finished or left. */
export interface PendingClash {
    track: ClashTrack;
    /** The source repository the change comes from. */
    source: { owner: string; repo: string };
    /** The commit the change starts from. */
    base: string;
    /** The commit it brings the storefront to. */
    target: string;
    /** The clashing files, repository-relative. */
    files: string[];
    /** Whether Demo Builder's fixes ride in the finishing commit (a thin-layer storefront). */
    fixes: boolean;
    /** When it was kept (ISO). */
    keptAt: string;
}

export type KeepClashOutcome =
    | { kind: 'kept'; storefrontPath: string; files: string[] }
    | { kind: 'not-kept'; reason: string };

const FIELD = 'pendingClash';
const COMMIT_SHA = /^[0-9a-f]{40}$/;

function storefrontMetadata(project: Project): Record<string, unknown> | undefined {
    return project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata as Record<string, unknown> | undefined;
}

/** The recorded clash, when the field holds one; anything malformed reads as none. */
export function readPendingClash(project: Project): PendingClash | undefined {
    const value = storefrontMetadata(project)?.[FIELD];
    if (typeof value !== 'object' || value === null) return undefined;
    const clash = value as Partial<PendingClash>;
    const ok =
        (clash.track === 'template' || clash.track === 'boilerplate') &&
        typeof clash.source?.owner === 'string' &&
        typeof clash.source?.repo === 'string' &&
        typeof clash.base === 'string' &&
        COMMIT_SHA.test(clash.base) &&
        typeof clash.target === 'string' &&
        COMMIT_SHA.test(clash.target) &&
        Array.isArray(clash.files) &&
        clash.files.length > 0 &&
        typeof clash.fixes === 'boolean' &&
        typeof clash.keptAt === 'string';
    return ok ? (clash as PendingClash) : undefined;
}

/** Record the clash (the caller saves the project); `undefined` removes it. */
export function writePendingClash(project: Project, clash: PendingClash | undefined): void {
    const instance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    if (!instance) return;
    const metadata = { ...(instance.metadata ?? {}) };
    if (clash) metadata[FIELD] = clash;
    else delete metadata[FIELD];
    instance.metadata = metadata;
}

/** What a stopped update hands over: its change, its clashing files and its track. */
export interface KeepClashRequest {
    track: ClashTrack;
    clash: TemplateClash;
    /** The files the throwaway clone reported. */
    conflicts: string[];
    fixes: boolean;
}

const sameFiles = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().every((file, i) => file === [...b].sort()[i]);

/** Apply the change in the refreshed copy; the reason when it is not the clone's clash. */
async function applyInCopy(copy: LocalCopy, request: KeepClashRequest, token: string): Promise<string | undefined> {
    const { source, base, target, preserveFiles } = request.clash;
    const sourceUrl = injectTokenIntoUrl(`https://github.com/${source.owner}/${source.repo}.git`, token);
    const fetched = await copy.git(`git fetch --quiet "${sourceUrl}" ${base} ${target}`, TIMEOUTS.LONG);
    if (fetched.code !== 0) return `the ${source.owner}/${source.repo} versions could not be fetched`;

    // The patch is written outside the copy, so it never shows up as a local change.
    const patchDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'kept-clash-'));
    try {
        const patchFile = path.join(patchDir, 'change.patch');
        const outcome = await applyChangeKeepingConflicts(copy.git, { base, target, preserveFiles, patchFile });
        if (outcome.kind === 'kept' && sameFiles(outcome.conflicts, request.conflicts)) return undefined;
        // The copy holds only what was just applied (it refreshed clean), so this loses nothing.
        await copy.git('git reset --hard --quiet HEAD', TIMEOUTS.QUICK);
        return outcome.kind === 'failed'
            ? `the change could not be applied there (${outcome.reason})`
            : 'the change did not clash there the way it did on GitHub';
    } finally {
        await fsPromises.rm(patchDir, { recursive: true, force: true });
    }
}

/**
 * Each staged path and its full git object id (null for a deletion): what the update
 * changed outside the clash, as `git diff --cached --raw` reports it in one call. Full,
 * because git shortens ids to whatever length it needs that day (see `sameObject`).
 *
 * @param since - the commit to measure from: the copy's latest by default, or the one
 *   the clash was kept on, so what was committed since still counts
 */
export async function stagedChange(copy: LocalCopy, since = 'HEAD'): Promise<Record<string, string | null> | undefined> {
    if (since !== 'HEAD' && !COMMIT_SHA.test(since)) return undefined;
    const raw = await copy.git(`git diff --cached --raw -z --no-abbrev --no-renames --diff-filter=ADM ${since}`, TIMEOUTS.NORMAL);
    if (raw.code !== 0) return undefined;
    return parseRawDiff(raw.stdout);
}

/** `--raw -z` output: ":<mode> <mode> <old> <new> <status>\0<path>\0" per entry. */
export function parseRawDiff(output: string): Record<string, string | null> {
    const parts = output.split('\0').filter(Boolean);
    const change: Record<string, string | null> = {};
    for (let i = 0; i + 1 < parts.length; i += 2) {
        const [, , , next, status] = parts[i].split(' ');
        change[parts[i + 1]] = status === 'D' ? null : next;
    }
    return change;
}

/**
 * Apply a stopped update's change in the project's local copy, keeping the clash, and
 * record it. The caller saves the project when the outcome is `kept`.
 */
export async function keepClash(project: Project, request: KeepClashRequest, ctx: UpdateContext): Promise<KeepClashOutcome> {
    const notKept = (reason: string): KeepClashOutcome => ({ kind: 'not-kept', reason });
    const token = (await getGitHubServices(ctx.secrets).tokenService.getToken())?.token;
    if (!token) return notKept('GitHub is not signed in');
    const copy = await openLocalCopy(project, ctx, token);
    if (!copy) return notKept('this project has no local copy of its storefront');

    const refreshed = await refreshLocalStorefront(copy.git, copy);
    if (refreshed.kind === 'left') return notKept(`its local copy was left as it is: ${refreshed.reason}`);
    const problem = await applyInCopy(copy, request, token);
    if (problem) return notKept(problem);

    const { track, clash, conflicts, fixes } = request;
    const applied = await stagedChange(copy);
    if (!applied) {
        await copy.git('git reset --hard --quiet HEAD', TIMEOUTS.QUICK);
        return notKept('what the update changed could not be read back');
    }
    const note = `${track} update ${clash.base.slice(0, 7)}..${clash.target.slice(0, 7)}: ${conflicts.join(', ')}`;
    const head = (await copy.git('git rev-parse HEAD', TIMEOUTS.QUICK)).stdout.trim();
    await markKeptClash(copy.storefrontPath, { note, applied, ...(COMMIT_SHA.test(head) ? { head } : {}) });
    writePendingClash(project, {
        track,
        source: clash.source,
        base: clash.base,
        target: clash.target,
        files: conflicts,
        fixes,
        keptAt: new Date().toISOString(),
    });
    ctx.logger.info(`[Updates] Kept the ${track} clash for ${project.name} in its local copy (${conflicts.join(', ')})`);
    return { kind: 'kept', storefrontPath: copy.storefrontPath, files: conflicts };
}
