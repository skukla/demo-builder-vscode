/**
 * Finish, or leave, a storefront update whose clash was kept for fixing (EDS-57 step 5).
 *
 * Finishing is the one place the fixed update is pushed, so every check is here, in order:
 *
 * 1. Still current: the update the clash belongs to is still the one on offer. If Adobe's
 *    tested version or the colleague's branch moved on, the kept fix is dropped and the
 *    normal check offers the newer update. A stale fix never goes out.
 * 2. Only the clash changed: compared with what the update applied when the clash was
 *    kept (`KeptClashRecord.applied`), the copy may differ only in the clashing files.
 *    It is measured from the commit the clash was kept on, so a commit made since still
 *    counts: the git-sync hook committed and pushed JustRite's whole update at the AI's
 *    first edit (2026-10-21), and finishing then refused what was already on GitHub.
 * 3. Fixed: no conflict marker is left in those files, and each JavaScript or JSON one
 *    parses. A merge that parses can still be wrong; this catches broken code, not that.
 *
 * Then Demo Builder's fixes ride in the commit on a tested-boilerplate storefront, the
 * commit (when anything is left to commit) is pushed with the SC's token (the push the SC confirmed by applying or by the
 * agent tool's consent), and the version is recorded as the clean path records it.
 *
 * Leaving undoes the copy to its last commit and forgets the clash.
 *
 * @module features/updates/services/pendingClashFinish
 */

import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import {
    clearKeptClash,
    CONFLICT_MARKER_RE,
    readKeptClash,
    type KeptClashRecord,
} from '@/features/eds/services/storefront/keptClashMark';
import { readBoilerplateBase, writeBoilerplateBase } from '@/features/updates/services/boilerplateBase';
import { checkoutLabelAccess, labelsPutBack, repairStubbedLabelFiles } from '@/features/updates/services/labelStubRepair';
import { openLocalCopy, type LocalCopy } from '@/features/updates/services/localStorefrontRefresh';
import {
    readPendingClash,
    stagedChange,
    writePendingClash,
    type PendingClash,
} from '@/features/updates/services/pendingClash';
import { BOILERPLATE_COMMIT, TEMPLATE_COMMIT } from '@/features/updates/services/templateSyncMessages';
import { patchesNotPutBack, reapplyPatchesInCheckout } from '@/features/updates/services/thinLayerUpdate';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import type { Project } from '@/types/base';

const COMMIT_SHA = /^[0-9a-f]{40}$/;

export type FinishOutcome =
    | { kind: 'finished'; commit: string; files: string[]; notes: string[] }
    | { kind: 'not-fixed'; reason: string }
    | { kind: 'moved-on' }
    | { kind: 'nothing' }
    | { kind: 'failed'; reason: string };

export interface FinishDeps {
    ctx: UpdateContext;
    /** The version this track would update to now; undefined when it cannot be read. */
    latestTarget(project: Project, clash: PendingClash): Promise<string | undefined>;
    /** Record the colleague's track's new version (the clean path's own recorder). */
    recordTemplateVersion(project: Project, commit: string): Promise<void>;
    /** Put back the 404 handling and Quick Edit after a tested-boilerplate update; lines for what could not be. */
    restorePieces(project: Project): Promise<string[]>;
}

/** Why a fixed file is not ready, or undefined when it is. */
async function notReady(copy: LocalCopy, file: string, ctx: UpdateContext): Promise<string | undefined> {
    let text: string;
    try {
        text = await fsPromises.readFile(path.join(copy.storefrontPath, file), 'utf8');
    } catch {
        return `${file} is missing`;
    }
    if (CONFLICT_MARKER_RE.test(text)) return `${file} still has conflict markers`;
    if (file.endsWith('.json')) {
        try {
            JSON.parse(text);
        } catch {
            return `${file} is not valid JSON`;
        }
    }
    if (/\.(m?js)$/.test(file)) return checkJavaScript(file, text, ctx);
    return undefined;
}

/** Node's own parser, on a copy named `.mjs` so the storefront's ES-module syntax is read as such. */
async function checkJavaScript(file: string, text: string, ctx: UpdateContext): Promise<string | undefined> {
    const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'clash-syntax-'));
    try {
        const copy = path.join(dir, 'check.mjs');
        await fsPromises.writeFile(copy, text, 'utf8');
        const checked = await ctx.commandManager.execute(`node --check "${copy}"`, { timeout: TIMEOUTS.QUICK, shell: true });
        return checked.code === 0 ? undefined : `${file} is not valid JavaScript`;
    } finally {
        await fsPromises.rm(dir, { recursive: true, force: true });
    }
}

/** The first path the copy changed beyond the update and the clash, if any. */
function strayChange(now: Record<string, string | null>, applied: Record<string, string | null>, files: string[]): string | undefined {
    const clash = new Set(files);
    const paths = new Set([...Object.keys(now), ...Object.keys(applied)]);
    for (const file of paths) {
        if (clash.has(file)) continue;
        if (now[file] !== applied[file]) return file;
    }
    return undefined;
}

/** Undo the copy to its last commit and forget the clash (the caller saves). */
async function forget(project: Project, copy: LocalCopy | undefined): Promise<void> {
    if (copy) {
        await copy.git('git reset --hard --quiet HEAD', TIMEOUTS.QUICK);
        await clearKeptClash(copy.storefrontPath);
    }
    writePendingClash(project, undefined);
}

/**
 * The commit the clash was kept on: as recorded, or, for a clash kept before that was
 * recorded, the last commit made before it was kept.
 */
async function keptOn(copy: LocalCopy, record: KeptClashRecord, clash: PendingClash): Promise<string | undefined> {
    if (record.head && COMMIT_SHA.test(record.head)) return record.head;
    const keptAt = new Date(clash.keptAt);
    if (Number.isNaN(keptAt.getTime())) return undefined;
    const found = await copy.git(`git rev-list -1 --first-parent --before="${keptAt.toISOString()}" HEAD`, TIMEOUTS.QUICK);
    const commit = found.stdout.trim();
    return found.code === 0 && COMMIT_SHA.test(commit) ? commit : undefined;
}

/** The checks before a push: the reason it cannot finish, or undefined. */
async function readiness(copy: LocalCopy, clash: PendingClash, ctx: UpdateContext): Promise<string | undefined> {
    const record = await readKeptClash(copy.storefrontPath);
    if (!record) return "the local copy no longer says what the update changed; leave it and update again";
    const since = await keptOn(copy, record, clash);
    if (!since) return 'the local copy no longer shows where the update started; leave it and update again';
    if ((await copy.git('git add -A', TIMEOUTS.NORMAL)).code !== 0) return 'the local copy could not be staged';
    const now = await stagedChange(copy, since);
    if (!now) return 'the local copy could not be read';
    const stray = strayChange(now, record.applied, clash.files);
    if (stray) return `${stray} changed too, and only ${clash.files.join(', ')} may`;
    for (const file of clash.files) {
        const reason = await notReady(copy, file, ctx);
        if (reason) return reason;
    }
    return undefined;
}

/** Commit and push the fixed update from the local copy; the new commit's id. */
async function commitAndPush(copy: LocalCopy, clash: PendingClash, project: Project, ctx: UpdateContext): Promise<{ commit: string; notes: string[] } | string> {
    // Our stub over the template's labels goes in the same commit, as on the clean path.
    const labels = await repairStubbedLabelFiles(checkoutLabelAccess(copy.storefrontPath, copy.git, clash.target));
    const patched = clash.fixes ? await reapplyPatchesInCheckout(copy.storefrontPath, project, ctx.logger) : [];
    if (clash.fixes || labels.length > 0) await copy.git('git add -A', TIMEOUTS.NORMAL);
    const message = clash.track === 'boilerplate' ? BOILERPLATE_COMMIT : TEMPLATE_COMMIT;
    // Nothing left to commit when the whole fixed update was committed already.
    const staged = (await copy.git('git diff --cached --quiet', TIMEOUTS.QUICK)).code !== 0;
    if (staged && (await copy.git(`git commit --quiet -m "${message}"`, TIMEOUTS.NORMAL)).code !== 0) return 'the commit failed';
    const pushed = await copy.git(`git push --quiet "${copy.remoteUrl}" HEAD:${copy.branch}`, TIMEOUTS.LONG);
    if (pushed.code !== 0) {
        // Not on GitHub, so not done: put the copy back to staged-and-fixed for another try.
        if (staged) await copy.git('git reset --soft --quiet HEAD~1', TIMEOUTS.QUICK);
        return 'GitHub refused the push';
    }
    const commit = (await copy.git('git rev-parse HEAD', TIMEOUTS.QUICK)).stdout.trim();
    return { commit, notes: [...labelsPutBack(labels), ...patchesNotPutBack(patched)] };
}

/** Record the version the storefront is on now, as the clean path does. */
async function recordVersion(project: Project, clash: PendingClash, deps: FinishDeps): Promise<string[]> {
    if (clash.track === 'boilerplate') {
        const base = readBoilerplateBase(project);
        if (base) writeBoilerplateBase(project, { ...base, commit: clash.target });
        return [];
    }
    await deps.recordTemplateVersion(project, clash.target);
    return clash.fixes ? deps.restorePieces(project) : [];
}

/**
 * Finish the kept clash: check, commit, push, record. The caller has the SC's consent to
 * push (the applied row, or the agent tool's dialog).
 */
export async function finishClash(project: Project, deps: FinishDeps): Promise<FinishOutcome> {
    const { ctx } = deps;
    const clash = readPendingClash(project);
    if (!clash) return { kind: 'nothing' };
    const token = (await getGitHubServices(ctx.secrets).tokenService.getToken())?.token;
    if (!token) return { kind: 'failed', reason: 'GitHub is not signed in' };
    const copy = await openLocalCopy(project, ctx, token);
    if (!copy) return { kind: 'failed', reason: 'this project has no local copy of its storefront' };

    const latest = await deps.latestTarget(project, clash);
    if (!latest) return { kind: 'failed', reason: 'could not check whether a newer version is out' };
    if (latest !== clash.target) {
        await forget(project, copy);
        await ctx.stateManager.saveProject(project);
        return { kind: 'moved-on' };
    }

    const reason = await readiness(copy, clash, ctx);
    if (reason) return { kind: 'not-fixed', reason };
    const pushed = await commitAndPush(copy, clash, project, ctx);
    if (typeof pushed === 'string') return { kind: 'failed', reason: pushed };

    await clearKeptClash(copy.storefrontPath);
    writePendingClash(project, undefined);
    const pieces = await recordVersion(project, clash, deps);
    await ctx.stateManager.saveProject(project);
    ctx.logger.info(`[Updates] Finished the ${clash.track} update for ${project.name} (${pushed.commit.slice(0, 7)})`);
    return { kind: 'finished', commit: pushed.commit, files: clash.files, notes: [...pushed.notes, ...pieces] };
}

/** Leave the kept clash: undo the local copy to its last commit, forget the clash, save. */
export async function leaveClash(project: Project, ctx: UpdateContext): Promise<void> {
    const token = (await getGitHubServices(ctx.secrets).tokenService.getToken())?.token;
    const copy = token ? await openLocalCopy(project, ctx, token) : undefined;
    await forget(project, copy);
    await ctx.stateManager.saveProject(project);
}

/** A kept clash as an agent or person sees it before finishing: the files, and what would go live. */
export interface KeptClashPreview {
    track: PendingClash['track'];
    files: string[];
    /** Files still carrying conflict markers. */
    markersLeft: string[];
    /** `git diff HEAD` of the clashing files: what finishing changes in them on the live site. */
    diff: string;
}

/** Describe the kept clash without changing anything; undefined when there is none. */
export async function previewClash(project: Project, ctx: UpdateContext): Promise<KeptClashPreview | undefined> {
    const clash = readPendingClash(project);
    if (!clash) return undefined;
    const token = (await getGitHubServices(ctx.secrets).tokenService.getToken())?.token;
    const copy = token ? await openLocalCopy(project, ctx, token) : undefined;
    if (!copy) return { track: clash.track, files: clash.files, markersLeft: clash.files, diff: '' };
    const markersLeft: string[] = [];
    for (const file of clash.files) {
        const text = await fsPromises.readFile(path.join(copy.storefrontPath, file), 'utf8').catch(() => '');
        if (!text || CONFLICT_MARKER_RE.test(text)) markersLeft.push(file);
    }
    const quoted = clash.files.map((file) => `"${file}"`).join(' ');
    const diff = (await copy.git(`git diff HEAD -- ${quoted}`, TIMEOUTS.NORMAL)).stdout;
    return { track: clash.track, files: clash.files, markersLeft, diff };
}
