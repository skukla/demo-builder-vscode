/**
 * SetupGuideModal — a step's Apply and Undo (AB-74, generalized by AB-77): "Apply this step"
 * on an open step Demo Builder can do itself, "Undo this step" once it applied and recorded
 * it. Pressing either runs it in the guide, which stays open (AB-82: no confirm, no progress
 * window; the step's pane says what Apply will do first). Split from
 * SetupGuideModal.test.tsx (its size); the stubs are the family's, in SetupGuideModal.testUtils.tsx.
 */

import { mockPostMessage, mockRequest } from '../../../../../helpers/webviewClientMock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import type { IntegrationCardModel } from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import { FIX_COPY, SetupGuideModal } from './SetupGuideModal.testUtils';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

const ATTRIBUTES: SetupChecklistItem = {
    id: 'erp-attributes',
    title: 'Create the erp_owner and brand product attributes',
    why: 'A product goes to the ERP its erp_owner names.',
    where: 'Stores > Attributes > Product',
    state: 'open',
    checkable: true,
    fix: { kind: 'handler', handler: 'create-erp-attributes' },
    applicable: true,
};
const PRICE: SetupChecklistItem = {
    id: 'price-scope-website',
    title: 'Set the catalog price scope to Website',
    label: 'Price scope',
    why: 'w',
    where: 'Admin',
    state: 'open',
    checkable: true,
    fix: { kind: 'config', items: [{ path: 'catalog/price/scope', value: '1', scope: 'default' }] },
    applicable: true,
};

const model = (item: SetupChecklistItem): IntegrationCardModel =>
    ({ id: 'erp-integration', name: 'ERP Integration', setupChecklist: [item] }) as IntegrationCardModel;

type OnAsk = NonNullable<React.ComponentProps<typeof SetupGuideModal>['onAsk']>;

async function renderGuide(item: SetupChecklistItem, onAsk?: OnAsk) {
    const onClose = jest.fn();
    render(<SetupGuideModal model={model(item)} onClose={onClose} onOpenAdmin={jest.fn()} onAsk={onAsk} />);
    await act(async () => {});
    return { onClose };
}

beforeEach(() => {
    mockPostMessage.mockReset();
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true, data: { ready: true } });
});

describe('a step with a fix offers Apply, and Undo once applied', () => {
    it('offers Apply on an open step before any check, and runs it in the guide, which stays open', async () => {
        const { onClose } = await renderGuide(PRICE, jest.fn());
        fireEvent.click(screen.getByRole('button', { name: FIX_COPY.fix }));
        expect(onClose).not.toHaveBeenCalled();
        expect(mockPostMessage).toHaveBeenCalledWith('prepareCommerceStore', {
            id: 'erp-integration',
            confirm: true,
            stepIds: ['price-scope-website'],
            progress: 'modal',
        });
    });

    it('offers Apply on a handler step once a check found it undone', async () => {
        await renderGuide({ ...ATTRIBUTES, lastCheck: 'failed', note: 'Commerce has no erp_owner product attribute.' }, jest.fn());
        fireEvent.click(screen.getByRole('button', { name: FIX_COPY.fix }));
        expect(mockPostMessage).toHaveBeenCalledWith('prepareCommerceStore', expect.objectContaining({ stepIds: ['erp-attributes'] }));
    });

    it('offers the undo, not Apply, once Demo Builder applied and recorded the step', async () => {
        await renderGuide({ ...ATTRIBUTES, state: 'done', lastCheck: 'passed', fixApplied: true }, jest.fn());
        expect(screen.queryByRole('button', { name: FIX_COPY.fix })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: FIX_COPY.undo }));
        expect(mockPostMessage).toHaveBeenCalledWith('undoCommerceStorePreparation', {
            id: 'erp-integration',
            confirm: true,
            stepId: 'erp-attributes',
            progress: 'modal',
        });
    });

    // Owner, 2026-10-22 ("Hide it, yes"): a step whose check passed is done, so Apply has
    // nothing to do there. The guide now checks every never-checked step as it opens, so a
    // saved done is fresh enough; a stale one is corrected by Check all steps, which opens the
    // step again and brings Apply back.
    it('offers neither Apply nor Undo on a step saved done that Demo Builder did not apply', async () => {
        await renderGuide({ ...PRICE, state: 'done', lastCheck: 'passed' }, jest.fn());
        expect(screen.queryByRole('button', { name: FIX_COPY.fix })).toBeNull();
        expect(screen.queryByRole('button', { name: FIX_COPY.undo })).toBeNull();
    });

    it('offers both once Demo Builder applied a step the store has since lost', async () => {
        await renderGuide({ ...PRICE, state: 'open', lastCheck: 'failed', fixApplied: true }, jest.fn());
        expect(screen.getByRole('button', { name: FIX_COPY.fix })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: FIX_COPY.undo })).toBeInTheDocument();
    });

    it('offers nothing on a skipped step', async () => {
        await renderGuide({ ...PRICE, state: 'dismissed' }, jest.fn());
        expect(screen.queryByRole('button', { name: FIX_COPY.fix })).toBeNull();
    });

    it('offers nothing when the screen gives no way to run it', async () => {
        await renderGuide(PRICE);
        expect(screen.queryByRole('button', { name: FIX_COPY.fix })).toBeNull();
    });
});
