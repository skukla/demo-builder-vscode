/**
 * SetupGuideModal — an integration's demo setup steps, every step in view (AB-26x).
 *
 * Asserted by what it shows and the REQUESTS it sends: the steps are drawn from the card
 * model and change only when the extension saves and pushes them back, so a re-render with
 * a new model stands in for that push.
 */

import { mockRequest } from '../../../../../helpers/webviewClientMock';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

jest.mock('@adobe/react-spectrum', () => ({
    Button: ({ children, onPress, isDisabled, variant: _v, style: _s, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} {...props}>
            {children}
        </button>
    ),
    DialogContainer: ({ children }: any) => <div data-testid="dialog-container">{children}</div>,
    Flex: ({ children }: any) => <div>{children}</div>,
    Heading: ({ children }: any) => <h3>{children}</h3>,
    Link: ({ children, onPress, isQuiet: _quiet, ...props }: any) => (
        <span role="link" tabIndex={0} onClick={onPress} {...props}>
            {children}
        </span>
    ),
    ProgressBar: ({ label, valueLabel, value }: any) => (
        <div role="progressbar" aria-label={label} aria-valuenow={value}>
            {valueLabel}
        </div>
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
import {
    SetupGuideModal,
    setupNextStep,
} from '@/features/dashboard/ui/components/integrations/SetupGuideModal';
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

/** A step as the catalog now describes it: the path, the values, the follow-up. */
const STRUCTURED = step({
    id: 'confirmed-status',
    title: 'Create the "Confirmed in ERP" order status',
    path: ['Stores', 'Settings', 'Order Status'],
    enter: ['erp_confirmed', 'Confirmed in ERP'],
    then: 'Assign the status to the Pending state.',
    icon: 'status',
});

const model = (items: SetupChecklistItem[]) =>
    ({
        id: 'erp-integration',
        name: 'Northwind ERP Integration',
        setupChecklist: items,
    }) as IntegrationCardModel;

function renderGuide(
    items: SetupChecklistItem[] = THREE,
    props: { onClose?: () => void; onOpenAdmin?: () => void } = {}
) {
    return render(
        <SetupGuideModal
            model={model(items)}
            onClose={props.onClose ?? jest.fn()}
            onOpenAdmin={props.onOpenAdmin ?? jest.fn()}
        />
    );
}

/** The detail pane: the one shown step. */
const shown = () => screen.getByTestId('setup-guide-step');

beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.mockResolvedValue({ success: true });
});

describe('SetupGuideModal', () => {
    it('shows nothing when no guide is open', () => {
        render(<SetupGuideModal model={null} onClose={jest.fn()} onOpenAdmin={jest.fn()} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens on the first step still to do, with what and where, the why folded away', () => {
        renderGuide();
        expect(
            screen.getByRole('dialog', { name: 'Demo setup: Northwind ERP Integration' })
        ).toBeInTheDocument();
        expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
        expect(within(shown()).getByRole('heading', { name: 'Step B' })).toBeInTheDocument();
        expect(within(shown()).getByText('Stores > Settings > Order Status')).toBeInTheDocument();
        // The reason sits under a disclosure, present but not in the way.
        const why = within(shown()).getByText('Why this matters').closest('details');
        expect(why).not.toHaveAttribute('open');
        expect(
            within(why as HTMLElement).getByText(
                'An order the ERP confirmed looks different in the Orders grid.'
            )
        ).toBeInTheDocument();
        expect(screen.getAllByTestId('setup-guide-step')).toHaveLength(1);
    });

    it('lists every step down the side with its state, and counts progress over the steps not skipped', () => {
        renderGuide([...THREE, step({ id: 'd', title: 'Step D', state: 'dismissed' })]);
        const tabs = screen.getAllByRole('tab');
        expect(tabs.map((tab) => tab.textContent)).toEqual([
            '1Step A',
            '2Step B',
            '3Step C',
            '4Step D',
        ]);
        expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('progressbar', { name: 'Set up in Commerce' })).toHaveTextContent(
            '1 of 3 done'
        );
    });

    it('jumps to any step from the list', () => {
        renderGuide();
        fireEvent.click(screen.getByRole('tab', { name: /Step C/ }));
        expect(within(shown()).getByRole('heading', { name: 'Step C' })).toBeInTheDocument();
        expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
    });

    it('draws the Admin path as breadcrumbs, the values as copyable pills, and the follow-up as one line', () => {
        renderGuide([STRUCTURED]);
        const pane = shown();
        expect(within(pane).getByLabelText('Stores > Settings > Order Status')).toBeInTheDocument();
        expect(within(pane).getAllByText(/^(Stores|Settings|Order Status)$/)).toHaveLength(3);
        expect(within(pane).getByText('erp_confirmed').closest('code')).toHaveClass(
            'copyable-text'
        );
        expect(within(pane).getByText('Confirmed in ERP').closest('code')).toHaveClass(
            'copyable-text'
        );
        expect(
            within(pane).getByText('Assign the status to the Pending state.')
        ).toBeInTheDocument();
        // The prose sentence is not repeated beside its structured form.
        expect(within(pane).queryByText(STRUCTURED.where)).not.toBeInTheDocument();
        // The step's picture: the icon mock cannot name which, only that one rendered.
        expect(pane.querySelector('.setup-guide-icon svg')).toBeInTheDocument();
    });

    it('shows what the last check found beside the step', () => {
        renderGuide([
            step({
                id: 'c',
                title: 'Step C',
                checkable: true,
                state: 'done',
                note: '2 companies, each with its own catalog.',
            }),
        ]);
        expect(
            within(shown()).getByText('2 companies, each with its own catalog.')
        ).toBeInTheDocument();
    });

    it('walks the steps with Back and Next, and ends with Done', () => {
        const onClose = jest.fn();
        renderGuide(THREE, { onClose });
        fireEvent.click(screen.getByText('Back'));
        expect(within(shown()).getByRole('heading', { name: 'Step A' })).toBeInTheDocument();
        expect(screen.getByText('Back')).toBeDisabled();
        fireEvent.click(screen.getByText('Next'));
        fireEvent.click(screen.getByText('Next'));
        expect(within(shown()).getByRole('heading', { name: 'Step C' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('marks the shown step done, by id', async () => {
        renderGuide();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));
        });
        expect(mockRequest).toHaveBeenCalledWith('setSetupStep', {
            id: 'erp-integration',
            stepId: 'b',
            state: 'done',
        });
    });

    it('skips the shown step, by id', async () => {
        renderGuide();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
        });
        expect(mockRequest).toHaveBeenCalledWith('setSetupStep', {
            id: 'erp-integration',
            stepId: 'b',
            state: 'dismissed',
        });
    });

    it('reopens a step that is done', async () => {
        renderGuide();
        fireEvent.click(screen.getByText('Back'));
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
        });
        expect(mockRequest).toHaveBeenCalledWith('setSetupStep', {
            id: 'erp-integration',
            stepId: 'a',
            state: 'open',
        });
    });

    it('offers Check now only on a step Demo Builder can check, and asks the extension to run it', async () => {
        renderGuide();
        expect(screen.queryByRole('button', { name: 'Check now' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('Next'));
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
        });
        expect(mockRequest).toHaveBeenCalledWith('checkSetupSteps', { id: 'erp-integration' });
    });

    it('opens Commerce Admin', () => {
        const onOpenAdmin = jest.fn();
        renderGuide(THREE, { onOpenAdmin });
        fireEvent.click(screen.getByRole('button', { name: 'Open Commerce Admin' }));
        expect(onOpenAdmin).toHaveBeenCalledTimes(1);
    });

    it('stays on the step when the pushed-back model marks it done', () => {
        const { rerender } = renderGuide();
        const updated = THREE.map((item) =>
            item.id === 'b' ? { ...item, state: 'done' as const } : item
        );
        rerender(
            <SetupGuideModal model={model(updated)} onClose={jest.fn()} onOpenAdmin={jest.fn()} />
        );
        expect(within(shown()).getByRole('heading', { name: 'Step B' })).toBeInTheDocument();
        expect(within(shown()).getByText('Done')).toBeInTheDocument();
        expect(screen.getByRole('progressbar')).toHaveTextContent('2 of 3 done');
    });

    it('says why when the extension refuses', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Adobe sign-in required.' });
        renderGuide();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));
        });
        expect(await screen.findByRole('alert')).toHaveTextContent('Adobe sign-in required.');
    });
});

describe('setupNextStep', () => {
    const cards = [
        { id: 'erp-integration', componentId: 'erp-integration', setupChecklist: THREE },
        { id: 'mesh', componentId: 'eds-accs-mesh' },
    ] as IntegrationCardModel[];

    it('offers the guide of the card the operation was for, counting the steps left', () => {
        const openGuide = jest.fn();
        const next = setupNextStep(cards, 'erp-integration', openGuide);

        expect(next?.message).toBe('Next: 2 setup steps in Commerce for the demo.');
        expect(next?.action).toBe('Start setup guide');
        next?.onPress();
        expect(openGuide).toHaveBeenCalledWith('erp-integration');
    });

    it('offers nothing for a card with no steps left, or no operation', () => {
        expect(setupNextStep(cards, 'eds-accs-mesh', jest.fn())).toBeUndefined();
        expect(setupNextStep(cards, undefined, jest.fn())).toBeUndefined();
        const done = [
            {
                ...cards[0],
                setupChecklist: THREE.map((item) => ({ ...item, state: 'done' as const })),
            },
        ];
        expect(setupNextStep(done, 'erp-integration', jest.fn())).toBeUndefined();
    });
});
