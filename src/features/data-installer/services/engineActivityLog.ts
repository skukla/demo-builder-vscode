/**
 * The activity log of Demo Builder's datapack engine: one line per install or removal it
 * finished in this project (datapack step 14, item 17).
 *
 * The service logged every run itself (`requestLogger.js`, read by its `logs` route), so the
 * Data Installer screen's Activity tab and `get_datapack_activity` could say what happened. Our
 * engine's runs reached neither. The install record cannot stand in for a history: it says what
 * a pack made, it is rewritten as it goes, and a removal deletes it.
 *
 * So the engine reports each job's end (`onJobEnd`, `engine.ts`) and this appends it to
 * `<project>/.demo-builder/datapack-activity.jsonl`. Appended, never rewritten, so an entry
 * outlives the record it describes. Beside the project, as the records are, and OUTSIDE their
 * folder: `readProjectRecords` reads every `.json` there as a record.
 *
 * A line that cannot be read is skipped, not fatal: one torn write must not hide the rest of the
 * history, and nothing is decided from this log (removal reads the record, never this).
 *
 * @module features/data-installer/services/engineActivityLog
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import type { JobEnd } from './demoBuilderEngine/engine';
import type { TargetCodes } from './demoBuilderEngine/installRecord';
import type { DatapackId } from '@/types/datapack';

/** One finished job, as the log keeps it. */
export interface EngineActivityEntry {
    format: 1;
    activationId: string;
    pack: DatapackId;
    operation: JobEnd['operation'];
    dataTypes: string[];
    /** `success` when every requested kind succeeded; `failed` otherwise. */
    outcome: 'success' | 'failed';
    startedAt: string;
    finishedAt: string;
    /** The store's instance when the job ran, as `get-datapack-import-target` names it. */
    commerceInstance?: string;
    target?: TargetCodes;
    /** Why it failed, or what the engine said about a run that worked. */
    detail?: string;
}

/** The two file operations the log needs, handed in so tests need no disk. */
export interface ActivityFiles {
    /** The file's text, or undefined when there is no file. */
    read(filePath: string): Promise<string | undefined>;
    append(filePath: string, text: string): Promise<void>;
}

const entrySchema = z.object({
    format: z.literal(1),
    activationId: z.string(),
    pack: z.object({ name: z.string(), version: z.string() }),
    operation: z.enum(['import', 'delete']),
    dataTypes: z.array(z.string()),
    outcome: z.enum(['success', 'failed']),
    startedAt: z.string(),
    finishedAt: z.string(),
    commerceInstance: z.string().optional(),
    target: z.object({ websiteCode: z.string(), storeCode: z.string() }).optional(),
    detail: z.string().optional(),
});

/** Where the log lives: `<project>/.demo-builder/datapack-activity.jsonl`. */
export function engineActivityPath(projectPath: string): string {
    return path.join(projectPath, '.demo-builder', 'datapack-activity.jsonl');
}

/** A job's end as a log entry, at the instance the project wrote to when it ran. */
export function activityEntryFrom(end: JobEnd, commerceInstance: string | undefined): EngineActivityEntry {
    const succeeded = end.request.dataTypes.every((kind) => end.perType[kind] === 'success');
    const detail = end.reason ?? end.note;
    const target = end.request.target;
    return {
        format: 1,
        activationId: end.activationId,
        pack: { name: end.request.id.name, version: end.request.id.version },
        operation: end.operation,
        dataTypes: [...end.request.dataTypes],
        outcome: succeeded ? 'success' : 'failed',
        startedAt: new Date(end.startedAt).toISOString(),
        finishedAt: new Date(end.finishedAt).toISOString(),
        ...(commerceInstance ? { commerceInstance } : {}),
        ...(target ? { target: { websiteCode: target.websiteCode, storeCode: target.storeCode } } : {}),
        ...(detail ? { detail } : {}),
    };
}

/** Add one entry to the end of the log. */
export async function appendEngineActivity(files: ActivityFiles, projectPath: string, entry: EngineActivityEntry): Promise<void> {
    await files.append(engineActivityPath(projectPath), `${JSON.stringify(entry)}\n`);
}

function parseLine(line: string): EngineActivityEntry | undefined {
    try {
        const parsed = entrySchema.safeParse(JSON.parse(line));
        return parsed.success ? parsed.data : undefined;
    } catch {
        return undefined;
    }
}

/** Every entry the log holds, newest first. */
export async function readEngineActivity(files: ActivityFiles, projectPath: string): Promise<EngineActivityEntry[]> {
    const text = await files.read(engineActivityPath(projectPath));
    if (!text) return [];
    return text
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map(parseLine)
        .filter((entry): entry is EngineActivityEntry => entry !== undefined)
        .reverse();
}

/** What the engine's `onJobEnd` writer needs. */
export interface JobEndRecorder {
    files: ActivityFiles;
    projectPath: string;
    commerceInstance: string | undefined;
    log: (line: string) => void;
}

/**
 * The engine's `onJobEnd`: append the job's entry. Never throws: the job has already ended, and
 * a history that could not be written must not turn it into a failure. The line goes to Debug
 * Logs instead.
 */
export function recordJobEnd(recorder: JobEndRecorder): (end: JobEnd) => Promise<void> {
    return async (end) => {
        try {
            await appendEngineActivity(recorder.files, recorder.projectPath, activityEntryFrom(end, recorder.commerceInstance));
        } catch (error) {
            recorder.log(`could not write the activity log for ${end.request.id.name}@${end.request.id.version}: ${error instanceof Error ? error.message : String(error)}`);
        }
    };
}

function isMissing(error: unknown): boolean {
    return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

/** The log on disk. */
export const nodeActivityFiles: ActivityFiles = {
    async read(filePath) {
        try {
            return await fsPromises.readFile(filePath, 'utf8');
        } catch (error) {
            if (isMissing(error)) return undefined;
            throw error;
        }
    },
    async append(filePath, text) {
        await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
        await fsPromises.appendFile(filePath, text, 'utf8');
    },
};
