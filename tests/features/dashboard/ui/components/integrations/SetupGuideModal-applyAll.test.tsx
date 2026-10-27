/**
 * SetupGuideModal — Apply all, and the marks in the step list (AB-82). The guide is the one
 * place for the demo setup: Apply all does what "Prepare this store" did, for every step
 * still to do that Demo Builder can apply, and the list says at a glance which those are.
 */

import { mockPostMessage, mockRequest } from '../../../../../helpers/webviewClientMock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import type { IntegrationCardModel } from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import { FIX_COPY, SetupGuideModal } from './SetupGuideModal.testUtils';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

const step = (id: string, over: Partial<SetupChecklistItem> = {}): SetupChecklistItem => ({
    id,
    title: `Step ${id}`,
    label: id,
    why: 'w',
    where: 'Admin',
    state: 'open',
    checkable: true,
    ...over,
});

const FIX = { kind: 'handler' as const, handler: 'create-erp-attributes' as const };
/** Justrite's list, 2026-10-26: two Demo Builder can apply, one by hand, one optional, one done. */
const ITEMS = [
    step('done', { state: 'done', fix: FIX, applicable: true }),
    step('warehouse', { fix: FIX, applicable: true }),
    step('status', { checkable: false }),
    step('attributes', { fix: FIX, applicable: true }),
    step('card-payments', { fix: FIX, applicable: true, optional: true }),
    step('unread', { checkState: 'unknown' }),
];

const model = (items: SetupChecklistItem[]): IntegrationCardModel =>
    ({ id: 'erp-integration', name: 'ERP Integration', setupChecklist: items }) as IntegrationCardModel;

async function renderGuide(items: SetupChecklistItem[]) {
    const onClose = jest.fn();
    render(<SetupGuideModal model={model(items)} onClose={onClose} onOpenAdmin={jest.fn()} onAsk={jest.fn()} />);
    await act(async () => {});
    return { onClose };
}

beforeEach(() => {
    mockPostMessage.mockReset();
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true, data: { ready: true } });
});

describe('Apply all', () => {
    it('counts the steps still to do that Demo Builder can apply, not an optional one, and applies them in the guide', async () => {
        const { onClose } = await renderGuide(ITEMS);
        fireEvent.click(screen.getByRole('button', { name: FIX_COPY.all(2) }));
        expect(onClose).not.toHaveBeenCalled();
        expect(mockPostMessage).toHaveBeenCalledWith('prepareCommerceStore', {
            id: 'erp-integration',
            confirm: true,
            stepIds: ['warehouse', 'attributes'],
            progress: 'modal',
        });
    });

    it('is not offered when nothing is left that Demo Builder can apply', async () => {
        await renderGuide([ITEMS[0], ITEMS[2], ITEMS[4]]);
        expect(screen.queryByRole('button', { name: /Apply all/ })).not.toBeInTheDocument();
        // CONTROL: the guide is open, with its own buttons.
        expect(screen.getByRole('button', { name: 'Open Commerce Admin' })).toBeInTheDocument();
    });
});

describe('the marks in the step list', () => {
    it('says done, can apply, could not check, or nothing', async () => {
        await renderGuide(ITEMS);
        const marks = Array.from(document.querySelectorAll('.setup-guide-rail-mark')).map((mark) => mark.getAttribute('data-mark'));
        expect(marks).toEqual(['done', 'ready', 'open', 'ready', 'open', 'unknown']);
    });
});
