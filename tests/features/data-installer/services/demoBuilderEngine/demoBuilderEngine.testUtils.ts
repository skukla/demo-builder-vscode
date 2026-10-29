/**
 * Shared fakes for the Demo Builder engine's suites: files held in memory, and a kind context
 * whose Commerce reads answer from a table of paths and whose writes are recorded in order.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { type RecordFiles, openInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { type KindContext, newCatalogSession } from '@/features/data-installer/services/demoBuilderEngine/kindContext';

export const PROJECT = '/projects/bodea';
export const PACK = { name: 'bodea-main', version: '1.2.0' };
export const NOW = () => '2026-10-27T18:00:00.000Z';

/** Files held in memory, so a test reads exactly what the recorder wrote. */
export function memoryFiles(seed: Record<string, string> = {}): RecordFiles & { data: Map<string, string> } {
    const data = new Map(Object.entries(seed));
    return {
        data,
        read: async (p) => data.get(p),
        write: async (p, content) => void data.set(p, content),
        remove: async (p) => void data.delete(p),
    };
}

/** One write the fake store was sent. */
export interface SentCall {
    method: string;
    path: string;
    body: unknown;
}

/**
 * A kind context over a fake store. `reads` maps a path to its answer; a path not in it
 * answers a 404, as Commerce does for a missing thing. A value that is a function is called
 * each time, so a read can change after a write. `answers` gives what a write answers.
 */
export async function fakeContext(
    reads: Record<string, unknown> = {},
    answers: (call: SentCall) => unknown = () => ({}),
): Promise<KindContext & { sent: SentCall[]; logged: string[] }> {
    const sent: SentCall[] = [];
    const logged: string[] = [];
    const recorder = await openInstallRecord(memoryFiles(), PROJECT, PACK, NOW);
    return {
        sent,
        logged,
        recorder,
        session: newCatalogSession(),
        log: (line) => void logged.push(line),
        get: async (path) => {
            if (!(path in reads)) throw new CommerceReadError(`Commerce answered 404 for ${path}`, 404);
            const answer = reads[path];
            return typeof answer === 'function' ? (answer as () => unknown)() : answer;
        },
        send: async (method, path, body) => {
            const call = { method, path, body };
            sent.push(call);
            return answers(call);
        },
    };
}

/** The first page of a Commerce search, as `readAllPages` asks for it. */
export const page = (path: string, criteria = '') =>
    `${path}?searchCriteria[currentPage]=1&searchCriteria[pageSize]=100${criteria}`;

/** One equals filter, as the engine's lookups write it. */
export const by = (field: string, value: string) =>
    `&searchCriteria[filterGroups][0][filters][0][field]=${field}&searchCriteria[filterGroups][0][filters][0][value]=${encodeURIComponent(value)}`;
