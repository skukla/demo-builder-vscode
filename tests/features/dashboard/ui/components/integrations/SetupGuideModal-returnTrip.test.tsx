/**
 * The trip out of the setup guide and back (owner, 2026-10-26): a step's Apply or Undo
 * closes the guide for its confirm and its progress; closing those reopens the guide on the
 * step the SC left from, instead of the result offering "Open demo setup" for it.
 */

import { mockRequest } from '../../../../../helpers/webviewClientMock';
import { act, render, renderHook, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import type { IntegrationCardModel } from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import { SetupGuideModal, useSetupGuide } from './SetupGuideModal.testUtils';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

const step = (id: string, state: SetupChecklistItem['state']): SetupChecklistItem => ({
    id,
    title: `Step ${id.toUpperCase()}`,
    why: 'Why it matters.',
    where: 'Stores > Settings',
    state,
    checkable: false,
});

const CARD = {
    id: 'erp-integration',
    name: 'ERP Integration',
    setupChecklist: [step('a', 'done'), step('b', 'open'), step('c', 'done')],
} as IntegrationCardModel;

beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true, data: { ready: true } });
});

describe('the guide opens on the step it was left from', () => {
    it('shows that step, not the first one left to do', async () => {
        render(<SetupGuideModal model={CARD} onClose={jest.fn()} onOpenAdmin={jest.fn()} startAt="c" />);
        await act(async () => {});
        expect(screen.getByTestId('setup-guide-step')).toHaveTextContent('Step C');
    });

    it('opens on the first step left to do when it was not left from one', async () => {
        render(<SetupGuideModal model={CARD} onClose={jest.fn()} onOpenAdmin={jest.fn()} />);
        await act(async () => {});
        expect(screen.getByTestId('setup-guide-step')).toHaveTextContent('Step B');
    });
});

describe('useSetupGuide, away and back', () => {
    it('remembers the step left from and reopens the guide there, once', () => {
        const { result } = renderHook(() => useSetupGuide([CARD]));
        act(() => result.current.open('erp-integration'));
        act(() => {
            result.current.away.leave('erp-integration', 'c');
            result.current.modal.onClose();
        });
        expect(result.current.modal.model).toBeNull();
        expect(result.current.away.pending).toBe(true);

        act(() => result.current.away.comeBack());
        expect(result.current.modal.model?.id).toBe('erp-integration');
        expect(result.current.modal.startAt).toBe('c');
        expect(result.current.away.pending).toBe(false);

        // Closed again and come back with nothing left from: the guide stays closed.
        act(() => result.current.modal.onClose());
        act(() => result.current.away.comeBack());
        expect(result.current.modal.model).toBeNull();
    });

    it('keeps one comeBack across renders, so a timer fed by it is not restarted', () => {
        const { result } = renderHook(() => useSetupGuide([CARD]));
        const first = result.current.away.comeBack;
        act(() => result.current.away.leave('erp-integration', 'b'));
        expect(result.current.away.comeBack).toBe(first);
    });
});
