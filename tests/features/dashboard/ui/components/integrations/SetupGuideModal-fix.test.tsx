/**
 * SetupGuideModal — a step's fix and its undo (AB-74): the erp-attributes step's "Add erp_owner
 * to the attribute sets" when its last check failed, and "Take erp_owner out again" once Demo
 * Builder applied it. Pressing either closes the guide and hands the integration and the mode
 * to the screen, which confirms it. Split from SetupGuideModal.test.tsx (its size); the stubs
 * are the family's, in SetupGuideModal.testUtils.tsx.
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
    fix: 'add-erp-owner-to-attribute-sets',
};

const model = (item: SetupChecklistItem): IntegrationCardModel =>
    ({ id: 'erp-integration', name: 'ERP Integration', setupChecklist: [item] }) as IntegrationCardModel;

async function renderGuide(item: SetupChecklistItem, onFix?: (id: string, mode: 'add' | 'remove') => void) {
    const onClose = jest.fn();
    render(<SetupGuideModal model={model(item)} onClose={onClose} onOpenAdmin={jest.fn()} onFix={onFix} />);
    await act(async () => {});
    return { onClose };
}

beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true, data: { ready: true } });
});

describe('the erp-attributes step offers its fix', () => {
    it('offers the fix once a check found the step undone, and hands it to the screen', async () => {
        const onFix = jest.fn();
        const { onClose } = await renderGuide({ ...ATTRIBUTES, lastCheck: 'failed', note: 'erp_owner is not in the attribute set Default (12 products).' }, onFix);
        fireEvent.click(screen.getByRole('button', { name: FIX_COPY.fix }));
        expect(onClose).toHaveBeenCalled();
        expect(onFix).toHaveBeenCalledWith('erp-integration', 'add');
    });

    it('offers the undo once Demo Builder applied the fix', async () => {
        const onFix = jest.fn();
        await renderGuide({ ...ATTRIBUTES, state: 'done', lastCheck: 'passed', fixApplied: true }, onFix);
        expect(screen.queryByRole('button', { name: FIX_COPY.fix })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: FIX_COPY.undo }));
        expect(onFix).toHaveBeenCalledWith('erp-integration', 'remove');
    });

    it('offers nothing before a check, or when the screen gives no fix', async () => {
        await renderGuide(ATTRIBUTES, jest.fn());
        expect(screen.queryByRole('button', { name: FIX_COPY.fix })).toBeNull();
    });

    it('offers nothing when the screen gives no way to run it', async () => {
        await renderGuide({ ...ATTRIBUTES, lastCheck: 'failed' });
        expect(screen.queryByRole('button', { name: FIX_COPY.fix })).toBeNull();
    });
});
