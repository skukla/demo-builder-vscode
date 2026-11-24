/**
 * When a template update deletes one of the Universal Editor files (EDS-71: Adobe removed
 * `component-definition.json`, `component-models.json` and `component-filters.json` from its
 * Commerce templates). Nothing in Demo Builder reads them any more, so the update takes the
 * deletion; but a storefront's copy can hold what a block library install before EDS-71 added,
 * recorded in `InstalledBlockLibrary.addedEntries`.
 *
 * `onlyRecordedEntriesDiffer` says whether the storefront's copy is the template's (at the
 * update's base) plus those recorded entries and nothing else. The entries come out by the
 * uninstall's own rule (`blockLibraryRemovalEntries.ts`: an entry leaves only while it is still
 * deep-equal to the library's at the commit it was installed from), and an HTML example the
 * install filled into one of the template's entries leaves while it is still the library's.
 * What remains is compared with the template's file as JSON content, because an install wrote
 * the file back in its own indentation. Anything else left (the SC's edit, an entry nothing
 * recorded, a library that cannot be read) means the file is not Demo Builder's to delete.
 *
 * `forgetEntriesOfFilesGone` keeps the record true after an update: it stops tracking entries
 * in a file the storefront no longer has.
 *
 * @module features/updates/services/authoringFileDeletion
 */

import { isDeepStrictEqual } from 'util';
import { extractErrorMessage } from '@/core/errors';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    DEFINITION_FILE,
    FILTERS_FILE,
    MODELS_FILE,
    removeAddedEntries,
    type AuthoringFileContents,
} from '@/features/eds/services/blockLibraryRemovalEntries';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import type { GitStep } from '@/features/updates/services/templateMergeBase';
import { TemplateSyncStepError } from '@/features/updates/services/templateSyncStepError';
import type { Project } from '@/types/base';
import type { AddedComponentEntries, InstalledBlockLibrary } from '@/types/blockLibraries';
import type { Logger } from '@/types/logger';

const AUTHORING_FILES: readonly string[] = [DEFINITION_FILE, FILTERS_FILE, MODELS_FILE];

/** What one library recorded adding, with its own files to prove each entry is still its. */
export interface RecordedAuthoringEntries {
    ids: AddedComponentEntries;
    /** The library's three files at the commit it was installed from; absent when unreadable. */
    library: AuthoringFileContents;
}

/** Reads every library's record and files; called only when a deleted file needs it. */
export type RecordedEntriesReader = () => Promise<RecordedAuthoringEntries[]>;

type WithEntries = InstalledBlockLibrary & { addedEntries: AddedComponentEntries };
type Entry = { id?: unknown; plugins?: unknown };

const hasEntries = (library: InstalledBlockLibrary): library is WithEntries => library.addedEntries !== undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

function parseJson(text: string | null | undefined): unknown {
    if (!text) return undefined;
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

/** Every `groups[].components[]` entry of a parsed `component-definition.json`. */
function definitionEntries(definition: unknown): Entry[] {
    const groups = isRecord(definition) && Array.isArray(definition.groups) ? definition.groups : [];
    return groups.flatMap((group: unknown) =>
        isRecord(group) && Array.isArray(group.components) ? group.components.filter(isRecord) : [],
    );
}

/** An entry's `plugins.da` object, when it has one. */
function daPluginOf(entry: Entry | undefined): Record<string, unknown> | undefined {
    const plugins = entry?.plugins;
    return isRecord(plugins) && isRecord(plugins.da) ? plugins.da : undefined;
}

/** Take the example out of an entry, and the containers it leaves empty. */
function dropExample(entry: Entry): void {
    const da = daPluginOf(entry);
    if (!da || !isRecord(entry.plugins)) return;
    delete da.unsafeHTML;
    if (Object.keys(da).length === 0) delete entry.plugins.da;
    if (Object.keys(entry.plugins).length === 0) delete entry.plugins;
}

/**
 * The definition without the HTML examples the install filled into existing entries, where
 * each is still exactly the library's. Text out, for the next library's turn.
 */
function withoutFilledExamples(text: string, ids: string[], libraryText: string | null | undefined): string {
    const dest = parseJson(text);
    if (ids.length === 0 || dest === undefined) return text;
    const library = definitionEntries(parseJson(libraryText));
    for (const entry of definitionEntries(dest)) {
        if (typeof entry.id !== 'string' || !ids.includes(entry.id)) continue;
        const html = daPluginOf(entry)?.unsafeHTML;
        const original = daPluginOf(library.find((e) => e.id === entry.id))?.unsafeHTML;
        if (typeof html === 'string' && html === original) dropExample(entry);
    }
    return JSON.stringify(dest);
}

async function readBlob(git: GitStep, object: string, file: string): Promise<string> {
    const read = await git(`git cat-file blob "${object}"`, TIMEOUTS.QUICK);
    if (read.code !== 0) throw new TemplateSyncStepError(`Could not read ${file}.`, read.stderr);
    return read.stdout;
}

/** The storefront's working-tree `file`, read through git, which runs in both shells. */
async function workingTreeText(git: GitStep, file: string): Promise<string> {
    const hashed = await git(`git hash-object -w -- "${file}"`, TIMEOUTS.QUICK);
    const sha = hashed.stdout.trim();
    if (hashed.code !== 0 || !sha) throw new TemplateSyncStepError(`Could not read ${file}.`, hashed.stderr);
    return readBlob(git, sha, file);
}

function sameContent(a: string, b: string): boolean {
    const left = parseJson(a);
    return left !== undefined && isDeepStrictEqual(left, parseJson(b));
}

/**
 * Whether the storefront's `file` differs from the template's at `base` only by entries Demo
 * Builder recorded adding, each still as the library added it. With nothing recorded, the
 * content comparison still decides: an older install rewrote the file in its own indentation,
 * and a library uninstalled since leaves only that. False for any other file.
 * `file` must already be safe inside double quotes (`safeInQuotes`).
 */
export async function onlyRecordedEntriesDiffer(
    git: GitStep,
    base: string,
    file: string,
    read: RecordedEntriesReader,
): Promise<boolean> {
    if (!AUTHORING_FILES.includes(file)) return false;
    let text = await workingTreeText(git, file);
    for (const { ids, library } of await read()) {
        const removal = removeAddedEntries(ids, { [file]: text }, library);
        if (removal.left.some((entry) => entry.file === file)) return false;
        text = removal.files.find((written) => written.path === file)?.content ?? text;
        if (file === DEFINITION_FILE) text = withoutFilledExamples(text, ids.htmlExamples ?? [], library[file]);
    }
    return sameContent(text, await readBlob(git, `${base}:${file}`, file));
}

/** One library's three files at its recorded commit; a file that cannot be read is left out. */
async function libraryFiles(
    library: WithEntries,
    fileOps: Pick<GitHubFileOperations, 'getFileContent'>,
    logger: Logger,
): Promise<AuthoringFileContents> {
    const { owner, repo } = library.source;
    const contents: AuthoringFileContents = {};
    for (const file of AUTHORING_FILES) {
        try {
            contents[file] = (await fileOps.getFileContent(owner, repo, file, library.commitSha))?.content;
        } catch (error) {
            logger.warn(`[TemplateSync] Could not read ${file} of ${owner}/${repo} at ${library.commitSha}: ${extractErrorMessage(error)}`);
        }
    }
    return contents;
}

/**
 * The reader for a project's recorded entries: reads GitHub once, on the first call, and only
 * for libraries that recorded any.
 */
export function recordedEntriesReader(
    project: Project,
    fileOps: Pick<GitHubFileOperations, 'getFileContent'>,
    logger: Logger,
): RecordedEntriesReader {
    let read: Promise<RecordedAuthoringEntries[]> | undefined;
    const readAll = () => Promise.all((project.installedBlockLibraries ?? []).filter(hasEntries).map(
        async (library) => ({ ids: library.addedEntries, library: await libraryFiles(library, fileOps, logger) }),
    ));
    return () => (read ??= readAll());
}

/** The record without the entries of files the storefront no longer has; undefined when empty. */
function entriesInFiles(added: AddedComponentEntries, present: Set<string>): AddedComponentEntries | undefined {
    const kept = (file: string, ids: string[]): string[] => (present.has(file) ? ids : []);
    const next: AddedComponentEntries = {
        definition: kept(DEFINITION_FILE, added.definition),
        sectionFilter: kept(FILTERS_FILE, added.sectionFilter),
        filters: kept(FILTERS_FILE, added.filters),
        models: kept(MODELS_FILE, added.models),
        ...(added.htmlExamples && present.has(DEFINITION_FILE) ? { htmlExamples: added.htmlExamples } : {}),
    };
    return Object.values(next).some((ids) => ids.length > 0) ? next : undefined;
}

/**
 * After an update is committed: forget the recorded entries of every Universal Editor file the
 * storefront's commit no longer has, so the record says only what is still there. Changes the
 * project in memory; the caller saves it with the version it records. When git cannot list the
 * files, the record is left as it was.
 */
export async function forgetEntriesOfFilesGone(project: Project, git: GitStep): Promise<void> {
    const libraries: InstalledBlockLibrary[] = (project.installedBlockLibraries ?? []).filter(hasEntries);
    if (libraries.length === 0) return;
    const names = AUTHORING_FILES.map((file) => `"${file}"`).join(' ');
    const listed = await git(`git ls-tree -z --name-only HEAD -- ${names}`, TIMEOUTS.QUICK);
    if (listed.code !== 0) return;
    const present = new Set(listed.stdout.split('\0').filter(Boolean));
    for (const library of libraries) {
        const kept = library.addedEntries && entriesInFiles(library.addedEntries, present);
        if (kept) library.addedEntries = kept;
        else delete library.addedEntries;
    }
}
