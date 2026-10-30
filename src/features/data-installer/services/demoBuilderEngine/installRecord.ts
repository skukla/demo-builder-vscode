/**
 * The install record: every Commerce object Demo Builder's engine creates, written down as it
 * is created (DI-5, owner 2026-10-27).
 *
 * Removal reads this and takes away exactly what is in it, in reverse, and nothing the store
 * already had. The service's engine keeps no such list: it removes whatever a pack names,
 * matched by SKU, code or name, including things that were there before it installed
 * (`.rptc/research/datapack-engine/catalog-spec.md`, "Installation record").
 *
 * The file is rewritten after every object, so a failed install leaves a record of what it
 * did make: a re-run skips those, and removal still finds them. Removal drops each object as
 * it goes, for the same reason. A setting the pack changes is recorded with the value it had
 * before, so removal puts that back instead of deleting anything.
 *
 * One file per installed pack, beside the project, not in the manifest: the list can run to
 * hundreds of objects, and the manifest is rewritten whole by every save.
 *
 * @module features/data-installer/services/demoBuilderEngine/installRecord
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { writeFileAtomic } from '@/core/utils/writeFileAtomic';
import type { DatapackId } from '@/types/datapack';

/** One object an install created: its pack data kind and the id Commerce knows it by. */
export interface CreatedObject {
    kind: string;
    id: string;
    /** What a changed setting held before the install, for removal to restore. */
    previous?: unknown;
    /**
     * The pack's own name for it (a SKU, a category's place in the tree, a set's name), read
     * from the store right after it was written. A repeat install finds the pack's row by this,
     * so a thing renamed in the Admin is still known as ours (step 05).
     */
    key?: string;
    /** The store's copy in pack form, hashed when it was written: what "edited since" compares. */
    fingerprint?: string;
    /** The pack's row, hashed as it was installed: what "the pack changed" compares. */
    wrote?: string;
}

/** What an update may change about an object; the kind and id say which one. */
export type ObjectUpdate = Pick<CreatedObject, 'kind' | 'id'> & Partial<Pick<CreatedObject, 'key' | 'fingerprint' | 'wrote' | 'previous'>>;

/** The website and store view a pack is installed to, by code. */
export interface TargetCodes {
    websiteCode: string;
    storeCode: string;
}

/**
 * The Admin step a pack left (step 12, `packRootStep.ts`): the store shares its root category, so
 * the pack kept its own root, and only the SC can point the store at it.
 */
export interface PackRootStep {
    state: 'open' | 'done';
    /** The store (store group) to change, by code and as the Admin names it. */
    storeCode: string;
    storeName: string;
    /** The pack's root category, by id and name. */
    rootId: number;
    rootName: string;
    /** The root the store showed before, which removal asks to be put back first. */
    storeRootId: number;
    /** The stores sharing that root, as the question names them. */
    sharedWith: string;
    /** What the last check found. */
    note?: string;
}

/** What the file holds. */
export interface InstallRecord {
    format: 1;
    pack: DatapackId;
    engine: 'demo-builder';
    startedAt: string;
    /**
     * Where the pack was installed (live, scratch-1028, 2026-10-30): everything that reads what the
     * record lists opens the store here, not at the project's website now. Absent on a record
     * written before it was kept; those read at the project's (rule 3).
     */
    target?: TargetCodes;
    /** The Admin step the pack left, when its root is a root of its own (step 12). */
    rootStep?: PackRootStep;
    created: CreatedObject[];
}

/** The four file operations the record needs, handed in so tests need no disk. */
export interface RecordFiles {
    /** The file's text, or undefined when there is no file. */
    read(filePath: string): Promise<string | undefined>;
    write(filePath: string, content: string): Promise<void>;
    /** Succeeds when the file is already gone. */
    remove(filePath: string): Promise<void>;
    /** The file names in a folder; none when there is no folder. */
    list(dirPath: string): Promise<string[]>;
}

/** Writes an install's objects down as they are made, and drops them as they are removed. */
export interface InstallRecorder {
    readonly created: readonly CreatedObject[];
    /** Where the pack was installed, when the record says. */
    readonly target?: TargetCodes;
    /** The Admin step the pack left, when it left one. */
    readonly rootStep?: PackRootStep;
    /** Write down where that step stands. */
    setRootStep(step: PackRootStep): Promise<void>;
    has(kind: string, id: string): boolean;
    record(object: CreatedObject): Promise<void>;
    /** Change what is kept about an object already recorded; nothing for one that is not. */
    update(update: ObjectUpdate): Promise<void>;
    /** The object of a kind the pack names `key`; an object recorded with no key answers by its id. */
    byKey(kind: string, key: string): CreatedObject | undefined;
    drop(object: Pick<CreatedObject, 'kind' | 'id'>): Promise<void>;
}

/** The record is missing a safe name, unreadable, or belongs to another pack. */
export class InstallRecordError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InstallRecordError';
    }
}

/** A pack name or version safe to use as part of a file name. */
const SAFE_PART = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const recordSchema = z.object({
    format: z.literal(1),
    pack: z.object({ name: z.string(), version: z.string() }),
    engine: z.literal('demo-builder'),
    startedAt: z.string(),
    target: z.object({ websiteCode: z.string(), storeCode: z.string() }).optional(),
    rootStep: z
        .object({
            state: z.enum(['open', 'done']),
            storeCode: z.string(),
            storeName: z.string(),
            rootId: z.number(),
            rootName: z.string(),
            storeRootId: z.number(),
            sharedWith: z.string(),
            note: z.string().optional(),
        })
        .optional(),
    created: z.array(
        z.object({
            kind: z.string(),
            id: z.string(),
            previous: z.unknown().optional(),
            key: z.string().optional(),
            fingerprint: z.string().optional(),
            wrote: z.string().optional(),
        }),
    ),
});

function packLabel(pack: DatapackId): string {
    return `${pack.name}@${pack.version}`;
}

/**
 * Where a pack's record lives: `<project>/.demo-builder/datapacks/<name>@<version>.json`.
 *
 * @throws InstallRecordError when the name or version could not be a plain file name. Both
 *   come from the catalog, so neither may climb out of the project.
 */
export function installRecordPath(projectPath: string, pack: DatapackId): string {
    if (!SAFE_PART.test(pack.name) || !SAFE_PART.test(pack.version) || pack.name.includes('..')) {
        throw new InstallRecordError(`"${packLabel(pack)}" cannot name an install record file.`);
    }
    return path.join(projectPath, '.demo-builder', 'datapacks', `${packLabel(pack)}.json`);
}

/**
 * The record of a pack this engine installed into the project's store.
 *
 * @returns the record, or undefined when this engine never installed the pack
 * @throws InstallRecordError when the file is there but cannot be trusted: removing nothing
 *   and reporting success would strand everything the install made
 */
export async function readInstallRecord(
    files: RecordFiles,
    projectPath: string,
    pack: DatapackId,
): Promise<InstallRecord | undefined> {
    const text = await files.read(installRecordPath(projectPath, pack));
    if (text === undefined) return undefined;
    const record = parseRecord(text, packLabel(pack));
    if (record.pack.name !== pack.name || record.pack.version !== pack.version) {
        throw new InstallRecordError(
            `The install record for ${packLabel(pack)} was written for ${packLabel(record.pack)}.`,
        );
    }
    return record;
}

/**
 * Every record beside the project, one per pack this engine installed there: what a wipe must
 * leave to the removal that knows it (step 10).
 *
 * @throws InstallRecordError when a record cannot be read: a wipe that ignored it could delete what
 *   it lists
 */
export async function readProjectRecords(files: RecordFiles, projectPath: string): Promise<InstallRecord[]> {
    const dir = path.dirname(installRecordPath(projectPath, { name: 'x', version: 'x' }));
    const names = (await files.list(dir)).filter((name) => name.endsWith('.json'));
    const records: InstallRecord[] = [];
    for (const name of names) {
        const text = await files.read(path.join(dir, name));
        if (text !== undefined) records.push(parseRecord(text, name.replace(/\.json$/u, '')));
    }
    return records;
}

function parseRecord(text: string, label: string): InstallRecord {
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        json = undefined;
    }
    const parsed = recordSchema.safeParse(json);
    if (!parsed.success) {
        throw new InstallRecordError(`The install record for ${label} cannot be read.`);
    }
    return parsed.data;
}

/**
 * Start recording an install, or carry on the record a failed one left.
 *
 * @param now - the time to stamp a new record with
 * @param target - where a new record's install goes; a record carried on keeps the one it has
 */
export async function openInstallRecord(
    files: RecordFiles,
    projectPath: string,
    pack: DatapackId,
    now: () => string,
    target?: TargetCodes,
): Promise<InstallRecorder> {
    const filePath = installRecordPath(projectPath, pack);
    const record: InstallRecord = (await readInstallRecord(files, projectPath, pack)) ?? {
        format: 1,
        pack: { name: pack.name, version: pack.version },
        engine: 'demo-builder',
        startedAt: now(),
        ...(target ? { target: { websiteCode: target.websiteCode, storeCode: target.storeCode } } : {}),
        created: [],
    };
    const save = () => files.write(filePath, `${JSON.stringify(record, null, 2)}\n`);
    const indexOf = (kind: string, id: string) =>
        record.created.findIndex((o) => o.kind === kind && o.id === id);

    return {
        get created() {
            return record.created;
        },
        target: record.target,
        get rootStep() {
            return record.rootStep;
        },
        async setRootStep(step) {
            record.rootStep = step;
            await save();
        },
        has: (kind, id) => indexOf(kind, id) >= 0,
        async record(object) {
            if (indexOf(object.kind, object.id) >= 0) return;
            record.created.push(object);
            await save();
        },
        async update(update) {
            const index = indexOf(update.kind, update.id);
            if (index < 0) return;
            record.created[index] = { ...record.created[index], ...update };
            await save();
        },
        byKey: (kind, key) => record.created.find((o) => o.kind === kind && (o.key ?? o.id) === key),
        async drop({ kind, id }) {
            const index = indexOf(kind, id);
            if (index < 0) return;
            record.created.splice(index, 1);
            await save();
        },
    };
}

/**
 * Write a whole record under the pack it names: a capture moves the record to the version it
 * saved, so the store and that version start out as one another (step 05).
 */
export async function writeInstallRecord(files: RecordFiles, projectPath: string, record: InstallRecord): Promise<void> {
    await files.write(installRecordPath(projectPath, record.pack), `${JSON.stringify(record, null, 2)}\n`);
}

/** What removal takes away, in the order it takes it: the reverse of creation. */
export function removalOrder(record: InstallRecord): CreatedObject[] {
    return [...record.created].reverse();
}

/** Delete a pack's record once everything in it has been removed. */
export async function forgetInstallRecord(
    files: RecordFiles,
    projectPath: string,
    pack: DatapackId,
): Promise<void> {
    await files.remove(installRecordPath(projectPath, pack));
}

function isMissing(error: unknown): boolean {
    return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

/** The record on disk: written atomically, so a crash mid-write leaves the last good copy. */
export const nodeRecordFiles: RecordFiles = {
    async read(filePath) {
        try {
            return await fsPromises.readFile(filePath, 'utf8');
        } catch (error) {
            if (isMissing(error)) return undefined;
            throw error;
        }
    },
    async write(filePath, content) {
        await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
        await writeFileAtomic(filePath, content);
    },
    async remove(filePath) {
        await fsPromises.rm(filePath, { force: true });
    },
    async list(dirPath) {
        try {
            return await fsPromises.readdir(dirPath);
        } catch (error) {
            if (isMissing(error)) return [];
            throw error;
        }
    },
};
