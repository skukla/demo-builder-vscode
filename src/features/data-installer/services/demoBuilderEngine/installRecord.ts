/**
 * The install record: every Commerce object Demo Builder's engine creates, written down as it
 * is created (DI-5, owner 2026-10-27).
 *
 * Removal reads this and takes away exactly what is in it, in reverse, and nothing the store
 * already had. The service's engine keeps no such list: it removes whatever a pack names,
 * matched by SKU, code or name, including things that were there before it installed
 * (`.rptc/plans/datapack-engine/catalog-spec.md`, "Installation record").
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
import type { DatapackId } from '../../types';
import { writeFileAtomic } from '@/core/utils/writeFileAtomic';

/** One object an install created: its pack data kind and the id Commerce knows it by. */
export interface CreatedObject {
    kind: string;
    id: string;
    /** What a changed setting held before the install, for removal to restore. */
    previous?: unknown;
}

/** What the file holds. */
export interface InstallRecord {
    format: 1;
    pack: DatapackId;
    engine: 'demo-builder';
    startedAt: string;
    created: CreatedObject[];
}

/** The three file operations the record needs, handed in so tests need no disk. */
export interface RecordFiles {
    /** The file's text, or undefined when there is no file. */
    read(filePath: string): Promise<string | undefined>;
    write(filePath: string, content: string): Promise<void>;
    /** Succeeds when the file is already gone. */
    remove(filePath: string): Promise<void>;
}

/** Writes an install's objects down as they are made, and drops them as they are removed. */
export interface InstallRecorder {
    readonly created: readonly CreatedObject[];
    has(kind: string, id: string): boolean;
    record(object: CreatedObject): Promise<void>;
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
    created: z.array(z.object({ kind: z.string(), id: z.string(), previous: z.unknown().optional() })),
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
    const record = parseRecord(text, pack);
    if (record.pack.name !== pack.name || record.pack.version !== pack.version) {
        throw new InstallRecordError(
            `The install record for ${packLabel(pack)} was written for ${packLabel(record.pack)}.`,
        );
    }
    return record;
}

function parseRecord(text: string, pack: DatapackId): InstallRecord {
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        json = undefined;
    }
    const parsed = recordSchema.safeParse(json);
    if (!parsed.success) {
        throw new InstallRecordError(`The install record for ${packLabel(pack)} cannot be read.`);
    }
    return parsed.data;
}

/**
 * Start recording an install, or carry on the record a failed one left.
 *
 * @param now - the time to stamp a new record with
 */
export async function openInstallRecord(
    files: RecordFiles,
    projectPath: string,
    pack: DatapackId,
    now: () => string,
): Promise<InstallRecorder> {
    const filePath = installRecordPath(projectPath, pack);
    const record: InstallRecord = (await readInstallRecord(files, projectPath, pack)) ?? {
        format: 1,
        pack: { name: pack.name, version: pack.version },
        engine: 'demo-builder',
        startedAt: now(),
        created: [],
    };
    const save = () => files.write(filePath, `${JSON.stringify(record, null, 2)}\n`);
    const indexOf = (kind: string, id: string) =>
        record.created.findIndex((o) => o.kind === kind && o.id === id);

    return {
        get created() {
            return record.created;
        },
        has: (kind, id) => indexOf(kind, id) >= 0,
        async record(object) {
            if (indexOf(object.kind, object.id) >= 0) return;
            record.created.push(object);
            await save();
        },
        async drop({ kind, id }) {
            const index = indexOf(kind, id);
            if (index < 0) return;
            record.created.splice(index, 1);
            await save();
        },
    };
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
};
