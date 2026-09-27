/**
 * SetupGuideModal — an integration's demo setup steps, one at a time (AB-26x).
 *
 * Asserted by what it shows and the REQUESTS it sends: the steps are drawn from the card
 * model and change only when the extension saves and pushes them back, so a re-render with
 * a new model stands in for that push.
 */

import { mockRequest } from '../../../../../helpers/webviewClientMock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

jest.mock('@adobe/react-spectrum', () => ({
    DialogContainer: ({ children }: any) => <div data-testid="dialog-container">{children}</div>,
    Flex: ({ children }: any) => <div>{children}</div>,
    Heading: ({ children }: any) => <h3>{children}</h3>,
    Link: ({ children, onPress, isQuiet: _quiet, ...props }: any) => (
        <span role="link" tabIndex={0} onClick={onPress} {...props}>
            {children}
        </span>
    ),
    Text: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@/core/ui/components/ui/Modal', () => ({
    Modal: ({ title, actionButtons = [], onClose, closeLabel, children }: any) => (
        <div role="dialog" aria-label={title}>
            {children}
            <button onClick={onClose}>{closeLabel ?? 'Close'}</button>
            {actionButtons.map((b: any) => (
                <button key={b.label} onClick={b.onPress} disabled={b.isDisabled}>
                    {b.label}
                </button>
            ))}
        </div>
    ),
}));

// Below the mocks on purpose: jest.mock hoists above this file's imports.
import type { IntegrationCardModel } from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import { SetupGuideModal } from '@/features/dashboard/ui/components/integrations/SetupGuideModal';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

const step = (overrides: Partial<SetupChecklistItem>): SetupChecklistItem => ({
    id: 'confirmed-status',
    title: 'Create the "Confirmed in ERP" order status',
    why: 'An order the ERP confirmed looks different in the Orders grid.',
    where: 'Stores > Settings > Order Status',
    state: 'open',
    checkable: false,
    ...overrides,
});

const THREE = [
    step({ id: 'a', title: 'Step A', state: 'done' }),
    step({ id: 'b', title: 'Step B' }),
    step({ id: 'c', title: 'Step C', checkable: true }),
];

const model = (items: SetupChecklistItem[]) =>
    ({ id: 'erp-integration', name: 'Northwind ERP Integration', setupChecklist: items }) as IntegrationCardModel;

function renderGuide(items: SetupChecklistItem[] = THREE, props: { onClose?: () => void; onOpenAdmin?: () => void } = {}) {
    return render(
        <SetupGuideModal model={model(items)} onClose={props.onClose ?? jest.fn()} onOpenAdmin={props.onOpenAdmin ?? jest.fn()} />,
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.mockResolvedValue({ success: true });
});

describe('SetupGuideModal', () => {
    it('shows nothing when no guide is open', () => {
        render(<SetupGuideModal model={null} onClose={jest.fn()} onOpenAdmin={jest.fn()} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens on the first step still to do, with what, why and where', () => {
        renderGuide();
        expect(screen.getByRole('dialog', { name: 'Demo setup: Northwind ERP Integration' })).toBeInTheDocument();
        expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
        expect(screen.getByText('Step B')).toBeInTheDocument();
        expect(screen.getByText('An order the ERP confirmed looks different in the Orders grid.')).toBeInTheDocument();
        expect(screen.getByText('Stores > Settings > Order Status')).toBeInTheDocument();
        expect(screen.getAllByTestId('setup-guide-step')).toHaveLength(1);
    });

    it('walks the steps with Back and Next, and ends with Done', () => {
        const onClose = jest.fn();
        renderGuide(THREE, { onClose });
        fireEvent.click(screen.getByText('Back'));
        expect(screen.getByText('Step A')).toBeInTheDocument();
        expect(screen.getByText('Back')).toBeDisabled();
        fireEvent.click(screen.getByText('Next'));
        fireEvent.click(screen.getByText('Next'));
        expect(screen.getByText('Step C')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Done'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('marks the shown step done, by id', async () => {
        renderGuide();
        await act(async () => {
            fireEvent.click(screen.getByText('Mark as done'));
        });
        expect(mockRequest).toHaveBeenCalledWith('setSetupStep', { id: 'erp-integration', stepId: 'b', state: 'done' });
    });

    it('skips the shown step, by id', async () => {
        renderGuide();
        await act(async () => {
            fireEvent.click(screen.getByText('Skip'));
        });
        expect(mockRequest).toHaveBeenCalledWith('setSetupStep', { id: 'erp-integration', stepId: 'b', state: 'dismissed' });
    });

    it('reopens a step that is done', async () => {
        renderGuide();
        fireEvent.click(screen.getByText('Back'));
        await act(async () => {
            fireEvent.click(screen.getByText('Reopen'));
        });
        expect(mockRequest).toHaveBeenCalledWith('setSetupStep', { id: 'erp-integration', stepId: 'a', state: 'open' });
    });

    it('offers Check now only on a step Demo Builder can check, and asks the extension to run it', async () => {
        renderGuide();
        expect(screen.queryByText('Check now')).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('Next'));
        await act(async () => {
            fireEvent.click(screen.getByText('Check now'));
        });
        expect(mockRequest).toHaveBeenCalledWith('checkSetupSteps', { id: 'erp-integration' });
    });

    it('opens Commerce Admin', () => {
        const onOpenAdmin = jest.fn();
        renderGuide(THREE, { onOpenAdmin });
        fireEvent.click(screen.getByText('Open Commerce Admin'));
        expect(onOpenAdmin).toHaveBeenCalledTimes(1);
    });

    it('stays on the step when the pushed-back model marks it done', () => {
        const { rerender } = renderGuide();
        const updated = THREE.map((item) => (item.id === 'b' ? { ...item, state: 'done' as const } : item));
        rerender(<SetupGuideModal model={model(updated)} onClose={jest.fn()} onOpenAdmin={jest.fn()} />);
        expect(screen.getByText('Step B')).toBeInTheDocument();
        expect(screen.getByText('Done')).toBeInTheDocument();
    });

    it('says why when the extension refuses', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Adobe sign-in required.' });
        renderGuide();
        await act(async () => {
            fireEvent.click(screen.getByText('Mark as done'));
        });
        expect(await screen.findByRole('alert')).toHaveTextContent('Adobe sign-in required.');
    });
});
