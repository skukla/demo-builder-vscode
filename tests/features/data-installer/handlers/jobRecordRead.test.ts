/**
 * readJobRecord — a job whose extension host is gone is not still running (walk F163, 2026-11-16).
 *
 * A window reload ended an install half way and its record still said `watching`, so the Datapacks
 * screen reopened a running install that could never end. The record is shared by every window,
 * so only a record whose host process is gone may be ended: another window's job keeps running.
 */

import * as vscode from 'vscode';
import { JOB_KEY } from '@/features/data-installer/handlers/importJobWatch';
import { STOPPED_BY_RELOAD, readJobRecord } from '@/features/data-installer/handlers/jobRecordRead';
import type { ImportJobRecord } from '@/features/data-installer/types';
import { TransientStateManager } from '@/core/state/transientStateManager';
import {
    createMockExtensionContext,
    createStatefulGlobalState,
} from '../../../helpers/extensionContextFake';

const RUNNING: ImportJobRecord = {
    activationId: 'demo-builder-1',
    datapackName: 'frescopa',
    version: 'main',
    commerceInstance: 'instance',
    dataTypes: ['categories'],
    startedAt: '2026-11-16T17:16:54.654Z',
    outcome: 'watching',
    perType: { categories: 'processing' },
};

function storeWith(record: ImportJobRecord): {
    transient: TransientStateManager;
    store: Map<string, unknown>;
} {
    const { globalState, store } = createStatefulGlobalState({ [JOB_KEY]: record });
    const context: vscode.ExtensionContext = createMockExtensionContext({ globalState });
    return { transient: new TransientStateManager(context), store };
}

describe('readJobRecord', () => {
    it('ends a running job whose host process is gone, and saves it ended', async () => {
        const { transient, store } = storeWith({ ...RUNNING, hostPid: 4242 });

        const read = await readJobRecord(transient, () => false);

        expect(read).toMatchObject({ outcome: 'unwatchable', reason: STOPPED_BY_RELOAD });
        expect(store.get(JOB_KEY)).toMatchObject({
            outcome: 'unwatchable',
            reason: STOPPED_BY_RELOAD,
        });
    });

    it('leaves a running job alone while its host runs: another window may be running it', async () => {
        const { transient, store } = storeWith({ ...RUNNING, hostPid: 4242 });

        const read = await readJobRecord(transient, (pid) => pid === 4242);

        expect(read?.outcome).toBe('watching');
        expect(store.get(JOB_KEY)).toMatchObject({ outcome: 'watching' });
    });

    it('ends a running job written before records named their host', async () => {
        const { transient } = storeWith(RUNNING);

        const read = await readJobRecord(transient, () => true);

        expect(read?.outcome).toBe('unwatchable');
    });

    it('leaves a finished job as it ended', async () => {
        const finished: ImportJobRecord = { ...RUNNING, outcome: 'success', hostPid: 4242 };
        const { transient } = storeWith(finished);

        await expect(readJobRecord(transient, () => false)).resolves.toEqual(finished);
    });
});
