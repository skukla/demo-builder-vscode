/**
 * SetupChecklistSection — the flyout's demo setup checklist (AB-26x). Asserted by the
 * REQUESTS it sends, since the checklist itself is drawn from the card model and changes
 * only when the extension saves and pushes it back.
 */

import '../../../../../helpers/integrationCardSpectrumMocks';
import { mockRequest } from '../../../../../helpers/webviewClientMock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';
import type { IntegrationCardModel } from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import { SetupChecklistSection } from '@/features/dashboard/ui/components/integrations/SetupChecklistSection';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

const step = (overrides: Partial<SetupChecklistItem>): SetupChecklistItem => ({
    id: 'confirmed-status',
    title: 'Create the "Confirmed in ERP" order status',
    why: 'why',
    where: 'Stores > Settings > Order Status',
    state: 'open',
    checkable: false,
    ...overrides,
});

const model = (items?: SetupChecklistItem[]) => ({ id: 'erp-integration', setupChecklist: items }) as IntegrationCardModel;

beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.mockResolvedValue({ success: true });
});

describe('SetupChecklistSection', () => {
    it('renders nothing for an integration with no steps', () => {
        const { container } = render(<SetupChecklistSection model={model()} onOpenAdmin={jest.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows each step with what to do, where, and the summary', () => {
        render(<SetupChecklistSection model={model([step({}), step({ id: 'b', title: 'B', where: 'Catalog > Shared Catalogs', state: 'done' })])} onOpenAdmin={jest.fn()} />);
        expect(screen.getAllByTestId('setup-step')).toHaveLength(2);
        expect(screen.getByText('Stores > Settings > Order Status')).toBeInTheDocument();
        expect(screen.getByText('1 of 2 done')).toBeInTheDocument();
    });

    it('marks an open step done, by id', async () => {
        render(<SetupChecklistSection model={model([step({})])} onOpenAdmin={jest.fn()} />);
        await act(async () => {
            fireEvent.click(screen.getByText('Mark as done'));
        });
        expect(mockRequest).toHaveBeenCalledWith('setSetupStep', { id: 'erp-integration', stepId: 'confirmed-status', state: 'done' });
    });

    it('dismisses an open step, by id', async () => {
        render(<SetupChecklistSection model={model([step({})])} onOpenAdmin={jest.fn()} />);
        await act(async () => {
            fireEvent.click(screen.getByText('Dismiss'));
        });
        expect(mockRequest).toHaveBeenCalledWith('setSetupStep', { id: 'erp-integration', stepId: 'confirmed-status', state: 'dismissed' });
    });

    it('reopens a step that is done or dismissed', async () => {
        render(<SetupChecklistSection model={model([step({ state: 'dismissed' })])} onOpenAdmin={jest.fn()} />);
        await act(async () => {
            fireEvent.click(screen.getByText('Reopen'));
        });
        expect(mockRequest).toHaveBeenCalledWith('setSetupStep', { id: 'erp-integration', stepId: 'confirmed-status', state: 'open' });
    });

    it('offers Check now only when a step can be checked, and asks the extension to run it', async () => {
        const { rerender } = render(<SetupChecklistSection model={model([step({})])} onOpenAdmin={jest.fn()} />);
        expect(screen.queryByText('Check now')).not.toBeInTheDocument();
        rerender(<SetupChecklistSection model={model([step({ checkable: true })])} onOpenAdmin={jest.fn()} />);
        await act(async () => {
            fireEvent.click(screen.getByText('Check now'));
        });
        expect(mockRequest).toHaveBeenCalledWith('checkSetupSteps', { id: 'erp-integration' });
    });

    it('opens Commerce Admin through the grid', () => {
        const onOpenAdmin = jest.fn();
        render(<SetupChecklistSection model={model([step({})])} onOpenAdmin={onOpenAdmin} />);
        fireEvent.click(screen.getByText('Open Commerce Admin'));
        expect(onOpenAdmin).toHaveBeenCalledTimes(1);
    });

    it('says why when the extension refuses', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Adobe sign-in required.' });
        render(<SetupChecklistSection model={model([step({})])} onOpenAdmin={jest.fn()} />);
        await act(async () => {
            fireEvent.click(screen.getByText('Mark as done'));
        });
        expect(await screen.findByRole('alert')).toHaveTextContent('Adobe sign-in required.');
    });
});
