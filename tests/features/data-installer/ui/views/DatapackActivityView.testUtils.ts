/**
 * The shared setup all three DatapackActivityView suites install.
 *
 * They differed by one key: the first-frame suite also stubbed `postMessage`.
 * The superset is safe — a suite that never calls it is unaffected — and one
 * definition beats three that drift.
 *
 * The fixtures moved here when the third suite arrived: `resolveWith` encodes
 * the TWO-request shape this view has (the project target, then the log scoped
 * to it), which is the piece every suite gets wrong when it writes its own.
 */
import { mockRequest } from '../../../../helpers/webviewClientMock';
import type { ActivityEntry } from '@/features/data-installer/types';

export { mockRequest };

/** The timestamp every fixture entry carries, so a suite can assert on it. */
export const ENTRY_AT = '2026-08-06T18:12:13.115Z';

export function makeEntry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
    return {
        id: { name: 'bodea', version: 'main' },
        dataTypes: ['categories', 'products'],
        commerceInstance: 'aBcDeFgHiJkLmNoPqRsTu',
        mode: 'import',
        scenario: 'DATAPACK_SPECIFIC_ITEMS',
        at: ENTRY_AT,
        ...overrides,
    };
}

/**
 * `total` drives whether more can be loaded, so it is explicit.
 *
 * Two request types: the view asks for the project's target FIRST, because the
 * log is scoped to that instance. `instance: null` stands for "no project open",
 * which is a real state on this panel — the catalog browses fine without one.
 */
export function resolveWith(
    items: ActivityEntry[],
    total = items.length,
    instance: string | null = 'TENANT123'
): void {
    mockRequest.mockImplementation(async (type: string) => {
        if (type === 'get-datapack-import-target') {
            return { success: true, data: instance ? { instance, projectName: 'demo-1' } : {} };
        }
        return { success: true, data: { items, count: items.length, total } };
    });
}

/**
 * Answer the target once, then each activity page in order.
 *
 * A bare `mockResolvedValueOnce` queue no longer works: the TARGET request now
 * consumes the first entry, so page one went to the wrong caller and the view
 * read "no project open".
 */
export function resolveSequence(pages: Array<{ items: ActivityEntry[]; total: number }>): void {
    let next = 0;
    mockRequest.mockImplementation(async (type: string) => {
        if (type === 'get-datapack-import-target') {
            return { success: true, data: { instance: 'TENANT123', projectName: 'demo-1' } };
        }
        const page = pages[Math.min(next++, pages.length - 1)];
        return {
            success: true,
            data: { items: page.items, count: page.items.length, total: page.total },
        };
    });
}

/** How many ACTIVITY requests were made — the target lookup is not one. */
export function activityCallCount(): number {
    return mockRequest.mock.calls.filter((c) => c[0] === 'get-datapack-activity').length;
}

/** The most recent ACTIVITY request, ignoring the target lookup. */
export function lastActivityRequest(): { type: unknown; payload: unknown } {
    const call =
        [...mockRequest.mock.calls].reverse().find((c) => c[0] === 'get-datapack-activity') ?? [];
    return { type: call[0], payload: call[1] };
}
