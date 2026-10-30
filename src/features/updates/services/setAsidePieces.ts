/**
 * Demo Builder's own pieces, set aside while Adobe's boilerplate change is applied and put back
 * after it, so the update never clashes with Demo Builder's own additions.
 *
 * Measured on JustRite (2026-10-30, local replay): Adobe's 71a67e0 → d538506 change stopped on
 * three files, and two of them were only ours: the `aem-assets-sku-sanitization` code patch in
 * the AEM Assets dropin, and the Quick Edit Sidekick listener above the `loadHeader` line Adobe
 * changed. The third was a colleague's own edit, which must still stop the update (CLAUDE.md,
 * rule 2). Taking ours out first leaves Adobe's change landing on Adobe's own lines.
 *
 * Proof of authorship is the whole rule (rule 2: removal needs positive proof):
 *  - a code patch comes out only where its replacement text is in the file exactly once, and only
 *    when applying it again gives back exactly the file it came out of;
 *  - Quick Edit's wiring comes out only as `withoutQuickEditWiring` allows: the marked blocks,
 *    verbatim, again only when wiring again gives back the same file.
 * Anything else stays and may clash honestly. Putting back runs the same apply creation does,
 * so a storefront that had no clash ends exactly as it does today.
 *
 * Also here: the block folders an installed block library owns. Those are left out of every
 * template change: the library's own update keeps them current, and a colleague's older copy of
 * the same block (JustRite's catalog-menu, 2026-10-30) only clashes with it.
 *
 * @module features/updates/services/setAsidePieces
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { isAlreadyApplied, type CodePatch, type CodePatchResult } from '@/features/eds/services/patches/codePatchRegistry';
import { applyKnownPatches, patchesByTarget } from '@/features/eds/services/patches/knownPatches';
import { undoPatchGroups } from '@/features/eds/services/patches/retiredPatches';
import { SCRIPTS_JS_PATH } from '@/features/eds/services/quickEditPublisher';
import {
    QUICK_EDIT_BRANCH_MARKER,
    QUICK_EDIT_FIRSTIMAGE_MARKER,
    QUICK_EDIT_SIDEKICK_MARKER,
    buildQuickEditScriptsJs,
    withoutQuickEditWiring,
} from '@/features/eds/services/quickEditSnippet';
import { patchesNotPutBack } from '@/features/updates/services/thinLayerUpdate';
import type { Project } from '@/types/base';

/** What was taken out, so exactly that is put back. */
export interface SetAside {
    /** The code patches taken out, as the ledger lists them. */
    patches: CodePatch[];
    /** Whether Quick Edit's wiring was taken out of `scripts/scripts.js`. */
    quickEdit: boolean;
}

/** Nothing set aside. */
export const NOTHING_ASIDE: SetAside = { patches: [], quickEdit: false };

/** The files a set-aside touched: what a caller stages, or must not stage. */
export function filesSetAside(aside: SetAside): string[] {
    const files = new Set(aside.patches.map((patch) => patch.target));
    if (aside.quickEdit) files.add(SCRIPTS_JS_PATH);
    return [...files];
}

async function readIfThere(dir: string, file: string): Promise<string | undefined> {
    try {
        return await fs.readFile(path.join(dir, file), 'utf8');
    } catch {
        return undefined;
    }
}

/** One file's patches taken out, when they are provably ours; the patches that came out. */
async function setAsideInFile(dir: string, target: string, group: readonly CodePatch[]): Promise<CodePatch[]> {
    const original = await readIfThere(dir, target);
    if (original === undefined) return [];
    const present = group.filter((patch) => patch.replacement && original.includes(patch.replacement));
    if (present.length === 0) return [];
    const stripped = undoPatchGroups(new Map([[target, original]]), [present]).files.get(target);
    if (stripped === undefined) return [];
    // Applying them again must give back this very file, or putting back could write something new.
    if (applyKnownPatches(new Map([[target, stripped]]), present).files.get(target) !== original) return [];
    await fs.writeFile(path.join(dir, target), stripped);
    return present;
}

/**
 * Take Demo Builder's own pieces out of the working tree at `dir`. Writes files; stages nothing.
 *
 * @param live - the live code patches every shipped ledger lists (`readShippedPatches`)
 */
export async function setAsideOwnPieces(dir: string, live: readonly CodePatch[]): Promise<SetAside> {
    const patches: CodePatch[] = [];
    for (const [target, group] of patchesByTarget(live)) {
        patches.push(...(await setAsideInFile(dir, target, group)));
    }
    // After the patches: putting back runs in the other order, so each proof still holds.
    const scripts = await readIfThere(dir, SCRIPTS_JS_PATH);
    const unwired = scripts === undefined ? undefined : withoutQuickEditWiring(scripts);
    if (unwired !== undefined) await fs.writeFile(path.join(dir, SCRIPTS_JS_PATH), unwired);
    return { patches, quickEdit: unwired !== undefined };
}

const QUICK_EDIT_NOT_PUT_BACK =
    'Quick Edit could not be put back in scripts/scripts.js: the lines it hooks into have changed.';

async function putBackQuickEdit(dir: string): Promise<string | undefined> {
    const scripts = await readIfThere(dir, SCRIPTS_JS_PATH);
    if (scripts === undefined) return QUICK_EDIT_NOT_PUT_BACK;
    const wired = buildQuickEditScriptsJs(scripts);
    if (wired !== scripts) await fs.writeFile(path.join(dir, SCRIPTS_JS_PATH), wired);
    const markers = [QUICK_EDIT_BRANCH_MARKER, QUICK_EDIT_SIDEKICK_MARKER, QUICK_EDIT_FIRSTIMAGE_MARKER];
    return markers.every((marker) => wired.includes(marker)) ? undefined : QUICK_EDIT_NOT_PUT_BACK;
}

/** One file's patches put back; a result per patch that is not in the file afterwards. */
async function putBackInFile(dir: string, target: string, group: readonly CodePatch[]): Promise<CodePatchResult[]> {
    const content = await readIfThere(dir, target);
    const missing = (reason: string) => group.map((p) => ({ patchId: p.id, target, applied: false, reason }));
    if (content === undefined) return missing(`${target} is no longer in the storefront`);
    const next = applyKnownPatches(new Map([[target, content]]), group).files.get(target) ?? content;
    if (next !== content) await fs.writeFile(path.join(dir, target), next);
    return group
        .filter((patch) => !isAlreadyApplied(next, patch))
        .map((p) => ({ patchId: p.id, target, applied: false, reason: "Adobe's change no longer has the code it fixes" }));
}

/**
 * Put back what `setAsideOwnPieces` took out, in the working tree at `dir`. Writes files; stages
 * nothing. Re-running it changes nothing, so it can run again once a kept clash is fixed.
 *
 * @param skip - files to leave for now (a kept clash's files, still carrying git's markers)
 * @returns one plain line per piece that could not be put back
 */
export async function putBackOwnPieces(dir: string, aside: SetAside, skip: readonly string[] = []): Promise<string[]> {
    const left = new Set(skip);
    const lines: string[] = [];
    if (aside.quickEdit && !left.has(SCRIPTS_JS_PATH)) {
        const line = await putBackQuickEdit(dir);
        if (line) lines.push(line);
    }
    for (const [target, group] of patchesByTarget(aside.patches)) {
        if (left.has(target)) continue;
        lines.push(...patchesNotPutBack(await putBackInFile(dir, target, group)));
    }
    return lines;
}

/** A block id is used in a git pathspec inside a shell command: letters, digits, `-` and `_` only. */
const SAFE_BLOCK_ID = /^[A-Za-z0-9_-]+$/;

/**
 * The block folders the project's installed block libraries own (`blocks/<id>`), left out of
 * every template change. An id that is not a plain folder name is ignored, never quoted into git.
 */
export function blockLibraryFolders(project: Project): string[] {
    const ids = (project.installedBlockLibraries ?? []).flatMap((library) => library.blockIds ?? []);
    return [...new Set(ids.filter((id) => SAFE_BLOCK_ID.test(id)).map((id) => `blocks/${id}`))];
}
