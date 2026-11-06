/**
 * Datapack files inside the open project: where an agent's path lands, reading one, writing one.
 *
 * Moved out of `datapackZipHandlers.ts` (2026-11-05) when a second handler, the export-to-datapack
 * tool (`exportPackHandlers.ts`), needed the same rules: a path is inside the project or refused,
 * the folders a save names are made, and a disk that refuses says why in words.
 *
 * @module features/data-installer/handlers/datapackFiles
 */

import * as fs from 'fs';
import * as path from 'path';
import { DatapackTransferError } from '../services/datapackTransfer';
import { assertPathInsideSync } from '@/core/validation/PathSafetyValidator';
import type { HandlerContext } from '@/types/handlers';

/** The deepest part of a path that already exists: the project itself, at worst. */
function nearestExisting(candidate: string): string {
    let existing = path.resolve(candidate);
    while (!fs.existsSync(existing) && path.dirname(existing) !== existing) {
        existing = path.dirname(existing);
    }
    return existing;
}

const outsideProject = (given: string) =>
    new DatapackTransferError(
        `${given} is not in the open project: a datapack file path must be inside the project.`,
    );

/**
 * Check a path that may not exist yet against the project, through the part of it that does
 * (`assertPathInsideSync` follows links there, and refuses a path whose folder is missing).
 * What is left below that part is plain names, so it cannot lead anywhere else.
 */
function existingPartInside(candidate: string, base: string, given: string): string {
    const existing = nearestExisting(candidate);
    try {
        return assertPathInsideSync(existing, base);
    } catch {
        throw outsideProject(given);
    }
}

/** Make the folders a save names, inside the project; refuse a file that stands in the way. */
async function makeFolderInside(folder: string, base: string, given: string): Promise<void> {
    const existing = existingPartInside(folder, base, given);
    if (!fs.statSync(existing).isDirectory()) {
        throw new DatapackTransferError(
            `${path.basename(existing)} is a file, not a folder, so the datapack cannot be saved inside it.`,
        );
    }
    await fs.promises.mkdir(folder, { recursive: true });
}

/**
 * An agent's path, resolved inside the open project. When saving (`defaultName` given), the
 * folders it names are made if missing (live test, 2026-10-29), and a path that does not end in
 * `.zip` is a folder that gets the default file name: a file without `.zip` is one the screen's
 * Open dialog cannot show.
 */
export async function projectPath(
    context: HandlerContext,
    given: string,
    defaultName?: string,
): Promise<string> {
    const project = await context.stateManager.getCurrentProject();
    if (!project)
        throw new DatapackTransferError(
            'Open a project first: a datapack file path must be inside it.',
        );
    let candidate = path.isAbsolute(given) ? given : path.join(project.path, given);
    existingPartInside(candidate, project.path, given);
    if (defaultName) {
        const isFile = candidate.toLowerCase().endsWith('.zip');
        const folder = isFile ? path.dirname(candidate) : candidate;
        await makeFolderInside(folder, project.path, given);
        if (!isFile) candidate = path.join(folder, defaultName);
    }
    try {
        return assertPathInsideSync(candidate, project.path);
    } catch {
        // The part that exists is inside, so only a missing folder is left (open and load).
        throw new DatapackTransferError(noFileAt(project.name, given));
    }
}

/**
 * "There is none", naming the project whose folder was looked in: an agent's relative path is
 * read inside the CURRENT project, and when that is not the one the agent meant, the project's
 * name is what says so (live, 2026-10-30: a path meant for scratch-1028 was looked for in JustRite's).
 */
function noFileAt(projectName: string, given: string): string {
    return `The project ${projectName} has no datapack file at ${given}.`;
}

/** The file's bytes, or the same "there is none" when it is missing from a folder that exists. */
export async function readPackFile(context: HandlerContext, file: string): Promise<Buffer> {
    try {
        return await fs.promises.readFile(file);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        const project = await context.stateManager.getCurrentProject();
        throw new DatapackTransferError(project ? noFileAt(project.name, file) : `There is no datapack file at ${file}.`);
    }
}

/** Why the disk refused a write, in words an SC can act on, for the errors that have them. */
const DISK_REFUSALS: Record<string, string> = {
    EACCES: 'Demo Builder is not allowed to write there',
    EPERM: 'Demo Builder is not allowed to write there',
    EROFS: 'that disk cannot be written to',
    ENOSPC: 'the disk is full',
    EISDIR: 'a folder of that name is already there',
    ENAMETOOLONG: 'the path is too long',
};

/** Write the file, saying why when the disk refuses. Anything else keeps the generic line. */
export async function writeZip(target: string, bytes: Uint8Array): Promise<void> {
    try {
        await fs.promises.writeFile(target, bytes);
    } catch (error) {
        const why = DISK_REFUSALS[(error as NodeJS.ErrnoException).code ?? ''];
        if (!why) throw error;
        throw new DatapackTransferError(`The datapack could not be saved to ${target}: ${why}.`);
    }
}
