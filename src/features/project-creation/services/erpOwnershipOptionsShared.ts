/**
 * The store read behind "Add another ERP", kept by the extension so the dialog rarely waits.
 *
 * Reading every product took about 5 s on Justrite (2026-10-18). The read starts when a project
 * screen opens (`warmErpOwnershipOptions`), and it lives here, not in a screen: moving between
 * the dashboard and Integrations, or closing either, does not stop it. A dialog opened while it
 * runs joins it; one opened after it finished gets its answer at once.
 *
 * A kept answer is used only while it can still be right:
 * - nothing has been written to Commerce or an App Builder action since the read began
 *   (`storeWriteCount`), so an assign, a fill or a settings change is followed by a fresh read;
 * - it is younger than {@link CACHE_TTL.MEDIUM}, for the changes this extension does not make
 *   (the Commerce Admin, an ERP's own events);
 * - the project still has the same ERPs, which is part of the key.
 *
 * A refusal or a failure is never kept: the next ask reads again. A reload starts empty.
 *
 * @module features/project-creation/services/erpOwnershipOptionsShared
 */

import { listedErpNames } from './erpRules';
import { storeWriteCount } from '@/core/utils/storeWrites';
import { CACHE_TTL } from '@/core/utils/timeoutConfig';
import type { Project } from '@/types/base';
import type { ErpOwnershipOptions } from '@/types/erpOwnership';

export type OwnershipRead = ErpOwnershipOptions | { refusal: string };

interface KeptRead {
    answer: Promise<OwnershipRead>;
    /** The write count when the read began. */
    writes: number;
    /** When it answered; absent while in flight. */
    answeredAt?: number;
}

const kept = new Map<string, KeptRead>();

/** One project's integration, with the ERPs it serves now. */
function keyOf(project: Project, integrationId: string): string {
    const erps = listedErpNames(project, integrationId).map((erp) => erp.listId);
    return [project.path, integrationId, ...erps].join('|');
}

function stillRight(read: KeptRead, now: number): boolean {
    if (read.writes !== storeWriteCount()) return false;
    return read.answeredAt === undefined || now - read.answeredAt < CACHE_TTL.MEDIUM;
}

/**
 * The options for one project's integration: the kept answer while it is still right, else
 * `read` started once and shared with everyone who asks while it runs.
 *
 * @param read - the store read itself, run only when nothing kept can be used
 * @param now - the clock, for tests
 */
export function readErpOwnershipOptionsShared(
    project: Project,
    integrationId: string,
    read: () => Promise<OwnershipRead>,
    now: () => number = Date.now,
): Promise<OwnershipRead> {
    const key = keyOf(project, integrationId);
    const held = kept.get(key);
    if (held && stillRight(held, now())) return held.answer;

    // Set before anything is awaited, so a second ask in the same moment joins this one.
    const entry: KeptRead = { answer: read(), writes: storeWriteCount() };
    kept.set(key, entry);
    const drop = () => {
        if (kept.get(key) === entry) kept.delete(key);
    };
    entry.answer.then((answer) => {
        if ('refusal' in answer) drop();
        else entry.answeredAt = now();
    }, drop);
    return entry.answer;
}
