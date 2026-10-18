/**
 * The store read behind "Add another ERP", kept by the extension: started when a project screen
 * opens, joined or reused by the dialog, and read again once anything may have changed.
 *
 * Each test uses its own project path, because what is kept lives for the extension's life.
 */

const mockListedErps = jest.fn();
jest.mock('@/features/project-creation/services/erpRules', () => ({
    listedErpNames: (...a: unknown[]) => mockListedErps(...a),
}));

import { noteStoreWrite } from '@/core/utils/storeWrites';
import { CACHE_TTL } from '@/core/utils/timeoutConfig';
import {
    type OwnershipRead,
    readErpOwnershipOptionsShared,
} from '@/features/project-creation/services/erpOwnershipOptionsShared';
import type { Project } from '@/types/base';
import type { ErpOwnershipOptions } from '@/types/erpOwnership';
import { createMockProject } from '../../../helpers/projectFake';

const OPTIONS: ErpOwnershipOptions = {
    websites: [{ code: 'base', name: 'Main Website' }],
    products: [{ sku: 'A', websiteCodes: ['base'], attributes: {} }],
    erps: [{ erp: 'nordwind', name: 'Nordwind', owns: { mode: 'all' } }],
    takenListIds: ['nordwind'],
};

let paths = 0;
function project(): Project {
    paths += 1;
    return createMockProject({ name: 'justrite', path: `/projects/justrite-${paths}` });
}

/** A read that answers when told to, counting how often it was started. */
function heldRead(answer: OwnershipRead = OPTIONS) {
    const pending: Array<() => void> = [];
    const read = jest.fn(
        () => new Promise<OwnershipRead>((resolve) => pending.push(() => resolve(answer))),
    );
    const answerAll = async () => {
        pending.splice(0).forEach((done) => done());
        await Promise.resolve();
        await Promise.resolve();
    };
    return { read, answerAll };
}

beforeEach(() => {
    mockListedErps.mockReturnValue([{ listId: 'nordwind', name: 'Nordwind' }]);
});

it('joins a read already running rather than starting another', async () => {
    const p = project();
    const { read, answerAll } = heldRead();

    const first = readErpOwnershipOptionsShared(p, 'erp-integration', read);
    const second = readErpOwnershipOptionsShared(p, 'erp-integration', read);
    await answerAll();

    expect(read).toHaveBeenCalledTimes(1);
    await expect(first).resolves.toBe(OPTIONS);
    await expect(second).resolves.toBe(OPTIONS);
});

it('answers at once from a finished read', async () => {
    const p = project();
    const { read, answerAll } = heldRead();
    const started = readErpOwnershipOptionsShared(p, 'erp-integration', read);
    await answerAll();
    await started;

    await expect(readErpOwnershipOptionsShared(p, 'erp-integration', read)).resolves.toBe(OPTIONS);
    expect(read).toHaveBeenCalledTimes(1);
});

it('reads again once anything has been written since the read began', async () => {
    const p = project();
    const { read, answerAll } = heldRead();
    const started = readErpOwnershipOptionsShared(p, 'erp-integration', read);
    await answerAll();
    await started;

    noteStoreWrite();
    void readErpOwnershipOptionsShared(p, 'erp-integration', read);

    expect(read).toHaveBeenCalledTimes(2);
});

it('does not join a read that a write landed during', () => {
    const p = project();
    const { read } = heldRead();
    void readErpOwnershipOptionsShared(p, 'erp-integration', read);

    noteStoreWrite();
    void readErpOwnershipOptionsShared(p, 'erp-integration', read);

    expect(read).toHaveBeenCalledTimes(2);
});

it('reads again once the kept answer is older than its limit', async () => {
    const p = project();
    const { read, answerAll } = heldRead();
    let clock = 1_000;
    const now = () => clock;
    const started = readErpOwnershipOptionsShared(p, 'erp-integration', read, now);
    await answerAll();
    await started;

    clock += CACHE_TTL.MEDIUM - 1;
    void readErpOwnershipOptionsShared(p, 'erp-integration', read, now);
    expect(read).toHaveBeenCalledTimes(1);

    clock += 1;
    void readErpOwnershipOptionsShared(p, 'erp-integration', read, now);
    expect(read).toHaveBeenCalledTimes(2);
});

it('reads again when the project has gained an ERP', async () => {
    const p = project();
    const { read, answerAll } = heldRead();
    const started = readErpOwnershipOptionsShared(p, 'erp-integration', read);
    await answerAll();
    await started;

    mockListedErps.mockReturnValue([
        { listId: 'nordwind', name: 'Nordwind' },
        { listId: 'accuform', name: 'Accuform' },
    ]);
    void readErpOwnershipOptionsShared(p, 'erp-integration', read);

    expect(read).toHaveBeenCalledTimes(2);
});

it('keeps each project apart', () => {
    const { read } = heldRead();

    void readErpOwnershipOptionsShared(project(), 'erp-integration', read);
    void readErpOwnershipOptionsShared(project(), 'erp-integration', read);

    expect(read).toHaveBeenCalledTimes(2);
});

it('never keeps a refusal: the next ask reads again', async () => {
    const p = project();
    const { read, answerAll } = heldRead({ refusal: 'No Commerce credential on this project.' });
    const started = readErpOwnershipOptionsShared(p, 'erp-integration', read);
    await answerAll();
    await started;

    void readErpOwnershipOptionsShared(p, 'erp-integration', read);

    expect(read).toHaveBeenCalledTimes(2);
});

it('never keeps a failure: everyone waiting hears it, and the next ask reads again', async () => {
    const p = project();
    const read = jest.fn().mockRejectedValueOnce(new Error('Commerce answered 504')).mockResolvedValue(OPTIONS);

    const first = readErpOwnershipOptionsShared(p, 'erp-integration', read);
    const joined = readErpOwnershipOptionsShared(p, 'erp-integration', read);
    await expect(first).rejects.toThrow('Commerce answered 504');
    await expect(joined).rejects.toThrow('Commerce answered 504');

    await expect(readErpOwnershipOptionsShared(p, 'erp-integration', read)).resolves.toBe(OPTIONS);
    expect(read).toHaveBeenCalledTimes(2);
});
