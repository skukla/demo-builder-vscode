/**
 * SetupGuideModal — Check All Steps starts from nothing (owner, 2026-11-03): every step in
 * the run shows an empty mark as it starts, and each fills in as its own check answers. Before,
 * the old marks stayed and only the spinner moved, so a run read as having found nothing new.
 */

import { mockRequest } from '../../../../../helpers/webviewClientMock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import type { IntegrationCardModel } from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import { SetupGuideModal } from './SetupGuideModal.testUtils';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

/** A step a check already found done, so the guide does not check it again as it opens. */
const doneStep = (id: string, title: string): SetupChecklistItem => ({
    id,
    title,
    why: 'w',
    where: 'Admin',
    state: 'done',
    checkState: 'passed',
    checkable: true,
});

const STEPS = [doneStep('a', 'Step A'), doneStep('b', 'Step B'), doneStep('c', 'Step C')];
const model = { id: 'erp-integration', name: 'ERP Integration', setupChecklist: STEPS } as IntegrationCardModel;

/** The mark each step in the list shows, top to bottom; a spinner has no mark of its own. */
const marks = () =>
    ['Step A', 'Step B', 'Step C'].map(
        (name) => screen.getByRole('tab', { name: new RegExp(name) }).querySelector('[data-mark]')?.getAttribute('data-mark') ?? 'spinner',
    );

describe('Check All Steps', () => {
    it('empties every step it will check, then fills each in as its check answers', async () => {
        const pending: Array<(answer: unknown) => void> = [];
        mockRequest.mockImplementation((type: string) =>
            type === 'prepareSetupChecks'
                ? Promise.resolve({ success: true, data: { ready: true } })
                : new Promise((resolve) => pending.push(resolve)),
        );
        render(<SetupGuideModal model={model} onClose={jest.fn()} onOpenAdmin={jest.fn()} />);
        await act(async () => {});
        expect(marks()).toEqual(['done', 'done', 'done']);

        fireEvent.click(screen.getByRole('button', { name: 'Check All Steps' }));
        expect(marks()).toEqual(['spinner', 'open', 'open']);

        await act(async () => pending[0]({ success: true, data: { items: STEPS } }));
        expect(marks()).toEqual(['done', 'spinner', 'open']);

        await act(async () => pending[1]({ success: true, data: { items: STEPS } }));
        await act(async () => pending[2]({ success: true, data: { items: STEPS } }));
        expect(marks()).toEqual(['done', 'done', 'done']);
    });
});
