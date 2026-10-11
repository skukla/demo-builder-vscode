/**
 * SetupGuideModal — a step's Apply and Undo (AB-74, generalized by AB-77): "Apply this step"
 * on an open step Demo Builder can do itself, "Undo this step" once it applied and recorded
 * it. Pressing either closes the guide and hands the integration, the step and the mode to
 * the screen, which confirms it and runs it through "Prepare this store". Split from
 * SetupGuideModal.test.tsx (its size); the stubs are the family's, in SetupGuideModal.testUtils.tsx.
 */

import { mockRequest } from '../../../../../helpers/webviewClientMock';
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

type OnFix = NonNullable<React.ComponentProps<typeof SetupGuideModal>['onFix']>;

async function renderGuide(item: SetupChecklistItem, onFix?: OnFix) {
    const onClose = jest.fn();
    render(<SetupGuideModal model={model(item)} onClose={onClose} onOpenAdmin={jest.fn()} onFix={onFix} />);
    await act(async () => {});
    return { onClose };
}

beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true, data: { ready: true } });
});

describe('a step with a fix offers Apply, and Undo once applied', () => {
    it('offers Apply on an open step before any check, and hands the step to the screen', async () => {
        const onFix = jest.fn();
        const { onClose } = await renderGuide(PRICE, onFix);
        fireEvent.click(screen.getByRole('button', { name: FIX_COPY.fix }));
        expect(onClose).toHaveBeenCalled();
        expect(onFix).toHaveBeenCalledWith({ id: 'erp-integration', name: 'ERP Integration', mode: 'apply', stepId: 'price-scope-website', label: 'Price scope' });
    });

    it('offers Apply on a handler step once a check found it undone', async () => {
        const onFix = jest.fn();
        await renderGuide({ ...ATTRIBUTES, lastCheck: 'failed', note: 'Commerce has no erp_owner product attribute.' }, onFix);
        fireEvent.click(screen.getByRole('button', { name: FIX_COPY.fix }));
        expect(onFix).toHaveBeenCalledWith(expect.objectContaining({ mode: 'apply', stepId: 'erp-attributes', label: 'Create the erp_owner and brand product attributes' }));
    });

    it('offers the undo, not Apply, once Demo Builder applied and recorded the step', async () => {
        const onFix = jest.fn();
        await renderGuide({ ...ATTRIBUTES, state: 'done', lastCheck: 'passed', fixApplied: true }, onFix);
        expect(screen.queryByRole('button', { name: FIX_COPY.fix })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: FIX_COPY.undo }));
        expect(onFix).toHaveBeenCalledWith(expect.objectContaining({ mode: 'undo', stepId: 'erp-attributes' }));
    });

    it('still offers Apply on a step SAVED done: the apply decides from a fresh check, not the saved state', async () => {
        const onFix = jest.fn();
        await renderGuide({ ...PRICE, state: 'done', lastCheck: 'passed' }, onFix);
        expect(screen.queryByRole('button', { name: FIX_COPY.undo })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: FIX_COPY.fix }));
        expect(onFix).toHaveBeenCalledWith(expect.objectContaining({ mode: 'apply', stepId: 'price-scope-website' }));
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
