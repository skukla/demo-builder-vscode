/**
 * An update job that ends without success (step-07 U1, review U1-3): the types it asked for go back on
 * the install record's update note (`behind`), so the card keeps its dot and Update offers them again,
 * the update repeated with the types it asked for. A success leaves the note as the start set it.
 *
 * Imports the harness first: it owns the runner's mock, which `runAndWatch` must bind to.
 */

import { PAYLOAD, happyEngine, makeImportHarness, mockedWatch, resetImportHandlerMocks } from './importHandlers.testUtils';
import { runAndWatch } from '@/features/data-installer/handlers/importJobWatch';
import { addUpdateBehind } from '@/features/data-installer/services/demoBuilderEngine/installRecordUpdate';
import type { ImportRequest } from '@/features/data-installer/services/importRequest';
import type { JobPurpose } from '@/features/data-installer/types';
import type { HandlerContext } from '@/types/handlers';

jest.mock('@/features/data-installer/services/demoBuilderEngine/installRecordUpdate', () => ({
    addUpdateBehind: jest.fn(),
}));

const REQUEST: ImportRequest = {
    id: { name: PAYLOAD.datapackName, version: PAYLOAD.version },
    commerceInstance: PAYLOAD.commerceInstance,
    dataTypes: ['products', 'cart_rules'],
};

const flush = async (): Promise<void> => {
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

async function run(context: HandlerContext, purpose: JobPurpose): Promise<void> {
    const { engine } = happyEngine();
    await runAndWatch(context, engine, REQUEST, {
        operation: 'import',
        purpose,
        validate: async () => ({ valid: true }),
        begin: async () => ({ activationId: 'act-1' }),
        rejected: 'rejected',
        failed: 'failed',
    });
    await flush();
}

const failing = () =>
    mockedWatch.mockResolvedValue({ outcome: 'error', perType: { products: 'success', cart_rules: 'error' }, reason: 'Commerce refused.' });

beforeEach(() => {
    resetImportHandlerMocks();
    jest.mocked(addUpdateBehind).mockClear();
});

it('a failed update puts the types it asked for back on the update note', async () => {
    failing();
    const { context } = makeImportHarness();

    await run(context, 'update');

    expect(addUpdateBehind).toHaveBeenCalledWith(expect.anything(), expect.any(String), REQUEST.id, ['products', 'cart_rules']);
});

it('CONTROL: a successful update, or a failed install, leaves the note alone', async () => {
    const { context } = makeImportHarness();
    await run(context, 'update');
    failing();
    await run(context, 'install');

    expect(addUpdateBehind).not.toHaveBeenCalled();
});
