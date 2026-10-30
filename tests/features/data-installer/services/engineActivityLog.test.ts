/**
 * The activity log Demo Builder's engine keeps beside the project (step 14, item 17): one line
 * per finished install or removal, appended and never rewritten, so a removal's entry survives
 * the install record it deleted.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { JobEnd } from '@/features/data-installer/services/demoBuilderEngine/engine';
import {
    type ActivityFiles,
    type EngineActivityEntry,
    activityEntryFrom,
    appendEngineActivity,
    engineActivityPath,
    nodeActivityFiles,
    readEngineActivity,
    recordJobEnd,
} from '@/features/data-installer/services/engineActivityLog';

const PROJECT = '/projects/bodea';
const PACK = { name: 'bodea-main', version: '1.2.0' };

function memoryActivityFiles(seed: Record<string, string> = {}): ActivityFiles & { data: Map<string, string> } {
    const data = new Map(Object.entries(seed));
    return {
        data,
        read: async (filePath) => data.get(filePath),
        append: async (filePath, text) => void data.set(filePath, (data.get(filePath) ?? '') + text),
    };
}

function jobEnd(overrides: Partial<JobEnd> = {}): JobEnd {
    return {
        activationId: 'demo-builder-1',
        operation: 'import',
        request: {
            id: PACK,
            commerceInstance: 'ignored',
            dataTypes: ['categories', 'products'],
            target: { websiteCode: 'base', storeCode: 'default' },
        },
        perType: { categories: 'success', products: 'success' },
        startedAt: Date.parse('2026-10-30T10:00:00.000Z'),
        finishedAt: Date.parse('2026-10-30T10:02:00.000Z'),
        ...overrides,
    };
}

describe('engineActivityLog', () => {
    it('lives beside the project, outside the folder of install records', () => {
        expect(engineActivityPath(PROJECT)).toBe(path.join(PROJECT, '.demo-builder', 'datapack-activity.jsonl'));
    });

    it('turns a finished install into an entry naming the pack, the kinds, the store and the time', () => {
        expect(activityEntryFrom(jobEnd({ note: 'Kept the category Sale.' }), 'UoGYsHrcxMyeoVd2zUktZi')).toStrictEqual<EngineActivityEntry>({
            format: 1,
            activationId: 'demo-builder-1',
            pack: PACK,
            operation: 'import',
            dataTypes: ['categories', 'products'],
            outcome: 'success',
            startedAt: '2026-10-30T10:00:00.000Z',
            finishedAt: '2026-10-30T10:02:00.000Z',
            commerceInstance: 'UoGYsHrcxMyeoVd2zUktZi',
            target: { websiteCode: 'base', storeCode: 'default' },
            detail: 'Kept the category Sale.',
        });
    });

    it('calls a job with any kind that failed a failure, and keeps the reason over the note', () => {
        const entry = activityEntryFrom(
            jobEnd({ perType: { categories: 'success', products: 'error' }, reason: 'Commerce answered 400', note: 'a note' }),
            undefined,
        );

        expect(entry.outcome).toBe('failed');
        expect(entry.detail).toBe('Commerce answered 400');
        expect('commerceInstance' in entry).toBe(false);
    });

    it('reads entries back newest first', async () => {
        const files = memoryActivityFiles();
        await appendEngineActivity(files, PROJECT, activityEntryFrom(jobEnd({ activationId: 'first' }), 'i'));
        await appendEngineActivity(files, PROJECT, activityEntryFrom(jobEnd({ activationId: 'second', operation: 'delete' }), 'i'));

        const entries = await readEngineActivity(files, PROJECT);

        expect(entries.map((e) => [e.activationId, e.operation])).toStrictEqual([
            ['second', 'delete'],
            ['first', 'import'],
        ]);
    });

    it('reads nothing when the engine has never finished a job here', async () => {
        expect(await readEngineActivity(memoryActivityFiles(), PROJECT)).toStrictEqual([]);
    });

    it('skips a line it cannot read rather than losing the rest of the history', async () => {
        const good = JSON.stringify(activityEntryFrom(jobEnd(), 'i'));
        const files = memoryActivityFiles({ [engineActivityPath(PROJECT)]: `${good}\n{"torn":\n${good}\n` });

        expect(await readEngineActivity(files, PROJECT)).toHaveLength(2);
    });

    describe('recordJobEnd', () => {
        it('appends one entry per finished job', async () => {
            const files = memoryActivityFiles();
            const write = recordJobEnd({ files, projectPath: PROJECT, commerceInstance: 'i', log: () => undefined });

            await write(jobEnd());

            expect(await readEngineActivity(files, PROJECT)).toHaveLength(1);
        });

        it('logs a write it could not make and never throws: the job it records has already ended', async () => {
            const logged: string[] = [];
            const files: ActivityFiles = { read: async () => undefined, append: async () => Promise.reject(new Error('disk full')) };
            const write = recordJobEnd({ files, projectPath: PROJECT, commerceInstance: 'i', log: (line) => void logged.push(line) });

            await expect(write(jobEnd())).resolves.toBeUndefined();
            expect(logged.join('\n')).toMatch(/could not write the activity log.*disk full/);
        });
    });

    describe('nodeActivityFiles', () => {
        it('appends to a file it creates, folder and all', async () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-activity-'));
            try {
                await appendEngineActivity(nodeActivityFiles, dir, activityEntryFrom(jobEnd({ activationId: 'a' }), 'i'));
                await appendEngineActivity(nodeActivityFiles, dir, activityEntryFrom(jobEnd({ activationId: 'b' }), 'i'));

                expect((await readEngineActivity(nodeActivityFiles, dir)).map((e) => e.activationId)).toStrictEqual(['b', 'a']);
            } finally {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        });

        it('reads no file as no history', async () => {
            expect(await nodeActivityFiles.read(path.join(os.tmpdir(), 'no-such-dir-g4', 'x.jsonl'))).toBeUndefined();
        });
    });
});
