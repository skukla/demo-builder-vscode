/**
 * An update repairs the label files our stub overwrote (owner, 2026-10-22).
 *
 * Until 2026-10-22 creation and reset wrote Demo Builder's one-row stub over every label
 * file the template shipped. The B2B template's `placeholders/checkout.json` carries the two
 * labels its checkout block reads with no fallback, so storefronts made before then show
 * "undefined" for the checkout's item-list heading and its Edit link (measured on JustRite).
 * Creation and reset now keep the template's rows (`placeholderLabelFiles`); a template
 * update keeps the storefront's label files as they are (`DEFAULT_PRESERVE_FILES`), so without
 * this an old storefront would stay broken until it was reset.
 *
 * Only OUR stub is replaced ({@link isPlaceholderStub}): a label file the SC or a colleague
 * wrote is never touched. The template is read at the commit the update brings the storefront
 * to, through the same `placeholderLabelFiles` creation and reset use, so all three agree.
 * An area the template ships no labels for keeps its stub.
 *
 * @module features/updates/services/labelStubRepair
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    isPlaceholderStub,
    PLACEHOLDER_STUB_PATHS,
    placeholderLabelFiles,
} from '@/features/eds/services/placeholderStubs';
import type { GitStep } from '@/features/updates/services/templateMergeBase';

/** Where the repair reads and writes. */
interface LabelFileAccess {
    /** The storefront's file at a path, as the update leaves it; undefined when it has none. */
    readStorefront(filePath: string): Promise<string | undefined>;
    /** The template's file at a path, at the commit the update brings the storefront to. */
    readTemplate(filePath: string): Promise<string | undefined>;
    write(filePath: string, content: string): Promise<void>;
}

/**
 * Replace each label file that is our stub with the template's rows for that area.
 *
 * @returns the paths written, in list order; none when nothing was our stub over template labels
 */
export async function repairStubbedLabelFiles(files: LabelFileAccess): Promise<string[]> {
    const stubbed: string[] = [];
    for (const sheetPath of PLACEHOLDER_STUB_PATHS) {
        const content = await files.readStorefront(`${sheetPath}.json`);
        if (content !== undefined && isPlaceholderStub(content)) stubbed.push(sheetPath);
    }
    if (stubbed.length === 0) return [];
    const repaired: string[] = [];
    for (const [filePath, content] of await placeholderLabelFiles(stubbed, (p) => files.readTemplate(p))) {
        // Still a stub: the template has no labels for this area, so there is nothing to put back.
        if (isPlaceholderStub(content)) continue;
        await files.write(filePath, content);
        repaired.push(filePath);
    }
    return repaired;
}

/**
 * The repair's access to a clone with the template fetched: the storefront's files in the
 * working tree, the template's by `git show` at `templateCommit`.
 */
export function checkoutLabelAccess(repoDir: string, git: GitStep, templateCommit: string): LabelFileAccess {
    return {
        readStorefront: (filePath) => fs.readFile(path.join(repoDir, filePath), 'utf8').catch(() => undefined),
        async readTemplate(filePath) {
            const shown = await git(`git show "${templateCommit}:${filePath}"`, TIMEOUTS.QUICK);
            return shown.code === 0 ? shown.stdout : undefined;
        },
        write: (filePath, content) => fs.writeFile(path.join(repoDir, filePath), content, 'utf8'),
    };
}

/** A label file's page, as the SC names it: `placeholders/payment-services.json` is "payment services". */
function pageOf(filePath: string): string {
    return path.posix.basename(filePath, '.json').replace(/-/g, ' ');
}

/**
 * The line the SC reads for the files put back; none when there were none. It sits under
 * the project's own heading, so it names neither the project nor the file (owner,
 * 2026-10-22: "bodea: Put back the template's own page labels in placeholders/checkout.json."
 * repeated the heading, and the path meant nothing to an SC).
 */
export function labelsPutBack(paths: readonly string[]): string[] {
    if (paths.length === 0) return [];
    const pages = paths.map(pageOf);
    if (pages.length === 1) return [`Fixed the ${pages[0]} page's labels.`];
    return [`Fixed the labels of the ${pages.slice(0, -1).join(', ')} and ${pages[pages.length - 1]} pages.`];
}
