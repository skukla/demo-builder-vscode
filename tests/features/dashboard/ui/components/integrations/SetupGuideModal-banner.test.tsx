/**
 * SetupGuideModal — what the 2026-10-28 release walk (rows 4.14 and 4.19) changed: a done
 * step's banner is green and says how it got done, a refusal does not repeat the step's name,
 * every banner keeps two lines so nothing under it moves, and Apply all is not offered when it
 * would do exactly what the shown step's Apply does.
 */

import { mockRequest } from '../../../../../helpers/webviewClientMock';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import type { IntegrationCardModel } from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import { DONE_COPY, FIX_COPY, STATUS_COPY, SetupGuideModal } from './SetupGuideModal.testUtils';
import { applyAllIds } from '@/features/dashboard/ui/components/integrations/setupGuideFooter';
import { statusOf } from '@/features/dashboard/ui/components/integrations/StepHeader';
import type { GuideRun } from '@/features/dashboard/ui/components/integrations/useGuideRun';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

const FIX = { kind: 'handler' as const, handler: 'create-erp-attributes' as const };

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

/** A run on one step that has ended; `start` is never called here. */
const ended = (over: Partial<GuideRun>): GuideRun => ({
    running: false,
    stepIds: ['attributes'],
    mode: 'undo',
    results: {},
    start: jest.fn(),
    ...over,
});

describe('the step banner', () => {
    it('is green on a done step and says how it got done', () => {
        expect(statusOf(step('a', { state: 'done', fixApplied: true, lastCheck: 'passed' }))).toEqual({
            label: STATUS_COPY.done,
            tone: 'success',
            line: DONE_COPY.applied,
        });
        expect(statusOf(step('b', { state: 'done', lastCheck: 'passed' })).line).toBe(DONE_COPY.found);
        expect(statusOf(step('c', { state: 'done', checkable: false })).line).toBe(DONE_COPY.marked);
    });

    it('says a refusal without the step name the run puts in front of it', () => {
        const run = ended({ problem: 'attributes: 11 products are assigned to Accuform ERP.' });
        expect(statusOf(step('attributes', { state: 'done', fixApplied: true }), run)).toEqual({
            label: STATUS_COPY.undoFailed,
            tone: 'warning',
            line: '11 products are assigned to Accuform ERP.',
        });
    });

    it('keeps a second line on a state with nothing to say, so every banner is as tall', async () => {
        mockRequest.mockResolvedValue({ success: true, data: { ready: true } });
        const model = { id: 'erp-integration', name: 'ERP Integration', setupChecklist: [step('a')] } as IntegrationCardModel;
        render(<SetupGuideModal model={model} onClose={jest.fn()} onOpenAdmin={jest.fn()} />);
        await act(async () => {});
        const banner = screen.getByTestId('setup-guide-step-status');
        // CONTROL: the state has no sentence of its own here.
        expect(banner).toHaveTextContent(STATUS_COPY.notSetUp);
        // The icon is aria-hidden too, so the blank line is the last hidden node, not the first.
        const hidden = Array.from(banner.querySelectorAll('[aria-hidden="true"]')).map((node) => node.textContent);
        expect(hidden[hidden.length - 1]).toBe(' ');
    });
});

describe('Apply all', () => {
    const items = [step('warehouse', { fix: FIX, applicable: true }), step('done', { state: 'done', fix: FIX, applicable: true })];

    it('is not offered when the one step left is the one on view', () => {
        expect(applyAllIds(items, 'warehouse')).toStrictEqual([]);
    });

    it('is offered when the one step left is another', () => {
        expect(applyAllIds(items, 'done')).toEqual(['warehouse']);
    });

    it('is not drawn in the guide on that one step, while Check all steps stays', async () => {
        mockRequest.mockResolvedValue({ success: true, data: { ready: true } });
        const model = { id: 'erp-integration', name: 'ERP Integration', setupChecklist: items } as IntegrationCardModel;
        render(<SetupGuideModal model={model} onClose={jest.fn()} onOpenAdmin={jest.fn()} onAsk={jest.fn()} />);
        await act(async () => {});
        expect(screen.queryByRole('button', { name: FIX_COPY.all(1) })).not.toBeInTheDocument();
        // CONTROL: the step's own Apply and the list's check are there.
        expect(screen.getByRole('button', { name: FIX_COPY.fix })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Check all steps' })).toBeInTheDocument();
    });
});
