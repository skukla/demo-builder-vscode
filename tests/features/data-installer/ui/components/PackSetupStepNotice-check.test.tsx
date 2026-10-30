/**
 * The pack step's Check, end to end through the real request hook (DI-5, live 2026-10-30): the
 * SC pressed Check, the extension wrote what it found into the install record, and the panel
 * showed no answer until it was closed and opened again. Only `webviewClient` is faked here, so
 * the envelope the handler returns travels the same hook the panel reads.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { press, settle } from '../../../../helpers/reactSettle';

// Below the mocks on purpose: they hoist above these imports.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { rootStepItem } from '@/features/data-installer/services/demoBuilderEngine/packRootCheck';
import type { PackRootStep } from '@/features/data-installer/services/demoBuilderEngine/packRootStep';
import type { DatapackSetupStep } from '@/features/data-installer/types';
import { PackSetupStepNotice } from '@/features/data-installer/ui/components/PackSetupStepNotice';
import type { HandlerResponse } from '@/types/handlers';

const mockRequest = webviewClient.request as jest.Mock;
const ID = { name: 'zz-test-root-db12', version: 'v1' };
const STEP: PackRootStep = {
    state: 'open',
    storeCode: 'justrite_test_store',
    storeName: 'Justrite Test Store',
    rootId: 215,
    rootName: 'ZZ Root DB12',
    storeRootId: 119,
    sharedWith: 'the store justrite_store (website justrite)',
};
const NOTE = 'The store Justrite Test Store still uses the root category Justrite Catalog, not ZZ Root DB12.';

/** The handler's envelope, as `setupStepAnswer` builds it. */
const answer = (step: PackRootStep): HandlerResponse => {
    const data: DatapackSetupStep = { datapackName: ID.name, version: ID.version, step: rootStepItem(step) };
    return { success: true, data };
};

beforeEach(() => {
    mockRequest.mockReset();
});

it('shows what the Check found without closing the panel: read without a note, Check answers with one', async () => {
    mockRequest.mockImplementation(async (type: string) =>
        type === 'check-datapack-setup-step' ? answer({ ...STEP, note: NOTE }) : answer(STEP),
    );
    render(<PackSetupStepNotice id={ID} />);
    await settle();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();

    await press(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByText(NOTE)).toBeInTheDocument();
    expect(mockRequest).toHaveBeenCalledWith('check-datapack-setup-step', { datapackName: ID.name, version: ID.version }, undefined);
});

it('says in plain words that no answer came back, never the transport text, when the Check request gives up', async () => {
    mockRequest.mockImplementation(async (type: string) => {
        if (type === 'check-datapack-setup-step') throw new Error('Request timeout: check-datapack-setup-step');
        return answer(STEP);
    });
    render(<PackSetupStepNotice id={ID} />);
    await settle();

    await press(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByText(/didn't get an answer in time/)).toBeInTheDocument();
    expect(screen.queryByText(/Request timeout/)).not.toBeInTheDocument();
});
