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
    Button: ({ children, onPress, isDisabled, variant: _v, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} {...props}>
            {children}
        </button>
    ),
    DialogContainer: ({ children }: any) => <div data-testid="dialog-container">{children}</div>,
    Flex: ({ children }: any) => <div>{children}</div>,
    Heading: ({ children }: any) => <h3>{children}</h3>,
    ProgressCircle: ({ 'aria-label': label }: any) => <span role="progressbar" aria-label={label} />,
    Link: ({ children, onPress, isQuiet: _quiet, UNSAFE_className, ...props }: any) => (
        <span role="link" tabIndex={0} onClick={onPress} className={UNSAFE_className} {...props}>
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
import {
    SetupGuideModal,
    setupNextStep,
} from '@/features/dashboard/ui/components/integrations/SetupGuideModal';
import { NO_ANSWER } from '@/features/dashboard/ui/components/integrations/useSetupChecklist';
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
    step({ id: 'a', title: 'Step A', label: 'A', state: 'done' }),
    step({ id: 'b', title: 'Step B', label: 'B' }),
    step({ id: 'c', title: 'Step C', checkable: true }),
];

/** A step as the catalog now describes it: the path, the values, the follow-up. */
const STRUCTURED = step({
    id: 'confirmed-status',
    label: 'Confirmed in ERP status',
    title: 'Create the "Confirmed in ERP" order status',
    path: ['Stores', 'Settings', 'Order Status'],
    enter: ['erp_confirmed', 'Confirmed in ERP'],
    then: 'Assign the status to the Pending state.',
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

    it('opens on the first step still to do, with what, where and why all in view', () => {
        renderGuide();
        expect(
            screen.getByRole('dialog', { name: 'Demo setup: Northwind ERP Integration' })
        ).toBeInTheDocument();
        expect(within(shown()).getByRole('heading', { name: 'Step B' })).toBeInTheDocument();
        // No state word in the pane: the list marks done steps, the actions say the rest.
        expect(within(shown()).queryByText('To do')).not.toBeInTheDocument();
        expect(within(shown()).getByText('Stores > Settings > Order Status')).toBeInTheDocument();
        // The reason is one more labelled row, open, not a disclosure to click.
        expect(within(shown()).queryByText('Why this matters')).not.toBeInTheDocument();
        expect(within(shown()).getByText('Why')).toBeInTheDocument();
        expect(
            within(shown()).getByText(
                'An order the ERP confirmed looks different in the Orders grid.'
            )
        ).toBeInTheDocument();
        expect(screen.getAllByTestId('setup-guide-step')).toHaveLength(1);
    });

    it('lists every step by its short label with its state, and the list is the only progress', () => {
        renderGuide([...THREE, step({ id: 'd', title: 'Step D', state: 'dismissed' })]);
        const tabs = screen.getAllByRole('tab');
        // A label where the catalog gives one, the title where it does not.
        // A check on the done step, a dash on the skipped one, nothing on an open one.
        expect(tabs.map((tab) => tab.textContent)).toEqual(['✓A', 'B', 'Step C', '–Step D']);
        expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('the list is the only navigation: no Back or Next, and any step is one click away', () => {
        renderGuide();
        expect(screen.queryByText('Back')).not.toBeInTheDocument();
        expect(screen.queryByText('Next')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Step C' }));
        expect(within(shown()).getByRole('heading', { name: 'Step C' })).toBeInTheDocument();
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

    it('closes from the dialog footer', () => {
        const onClose = jest.fn();
        renderGuide(THREE, { onClose });
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('marks the shown step done, by id, from the dialog footer', async () => {
        renderGuide();
        // The footer holds the step's buttons after Close, the way every modal does.
        expect(
            screen.getAllByRole('button').slice(-3).map((button) => button.textContent)
        ).toStrictEqual(['Close', 'Mark as done', 'Open Commerce Admin']);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));
        });
        expect(mockRequest).toHaveBeenCalledWith('setSetupStep', {
            id: 'erp-integration',
            stepId: 'b',
            state: 'done',
        });
    });

    it('skips the shown step, by id — a quiet link in the step, not a footer button', async () => {
        renderGuide();
        expect(screen.queryByRole('button', { name: /Skip/ })).not.toBeInTheDocument();
        await act(async () => {
            fireEvent.click(within(shown()).getByRole('link', { name: 'Skip this step' }));
        });
        expect(mockRequest).toHaveBeenCalledWith('setSetupStep', {
            id: 'erp-integration',
            stepId: 'b',
            state: 'dismissed',
        });
    });

    it('reopens a step that is done, and offers only Open Commerce Admin beside Close', async () => {
        renderGuide();
        fireEvent.click(screen.getByRole('tab', { name: 'A' }));
        expect(screen.queryByRole('button', { name: 'Mark as done' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Open Commerce Admin' })).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(screen.getByRole('link', { name: 'Reopen' }));
        });
        expect(mockRequest).toHaveBeenCalledWith('setSetupStep', {
            id: 'erp-integration',
            stepId: 'a',
            state: 'open',
        });
    });

    it('offers Check all steps in place of Mark as done on a step Demo Builder can check', () => {
        renderGuide();
        expect(screen.queryByRole('button', { name: 'Check all steps' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Step C' }));
        expect(screen.queryByRole('button', { name: 'Mark as done' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Check all steps' })).toBeInTheDocument();
    });

    it('checks the steps one at a time, showing which and how far, then lands on the first still open', async () => {
        const checkable = [
            step({ id: 'a', title: 'Step A', checkable: true }),
            step({ id: 'b', title: 'Step B', checkable: true }),
            step({ id: 'c', title: 'Step C', checkable: true, state: 'dismissed' }),
            step({ id: 'd', title: 'Step D' }),
        ];
        const pending: Array<(answer: unknown) => void> = [];
        mockRequest.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
        renderGuide(checkable);
        fireEvent.click(screen.getByRole('button', { name: 'Check all steps' }));

        // The first step is being checked: its mark is a spinner and the button counts.
        expect(screen.getByRole('button', { name: 'Checking 1 of 2' })).toBeDisabled();
        expect(screen.getByRole('tab', { name: /Step A/ })).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByRole('progressbar', { name: 'Checking Step A' })).toBeInTheDocument();
        expect(mockRequest).toHaveBeenLastCalledWith('checkSetupSteps', { id: 'erp-integration', stepId: 'a' });

        const afterA = checkable.map((item) => (item.id === 'a' ? { ...item, state: 'done' as const } : item));
        await act(async () => pending[0]({ success: true, data: { items: afterA } }));
        expect(screen.getByRole('button', { name: 'Checking 2 of 2' })).toBeInTheDocument();
        // A skipped step is not checked; a step with no check is not asked for.
        expect(mockRequest).toHaveBeenLastCalledWith('checkSetupSteps', { id: 'erp-integration', stepId: 'b' });

        await act(async () => pending[1]({ success: true, data: { items: afterA } }));
        expect(mockRequest).toHaveBeenCalledTimes(2);
        expect(screen.getByRole('button', { name: 'Check all steps' })).toBeEnabled();
        // Step B is still open, so the guide lands there with its reason in view.
        expect(within(shown()).getByRole('heading', { name: 'Step B' })).toBeInTheDocument();
    });

    it('carries on past a step it cannot check, then names it in the house notice', async () => {
        // The guide's request limit ran out on step A (2026-10-01); B must still be checked.
        mockRequest
            .mockRejectedValueOnce(new Error('Request timeout: checkSetupSteps'))
            .mockResolvedValueOnce({ success: true, data: { items: [] } });
        renderGuide([
            step({ id: 'a', title: 'Step A', label: 'Price scope', checkable: true }),
            step({ id: 'b', title: 'Step B', checkable: true }),
        ]);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Check all steps' }));
        });
        expect(mockRequest).toHaveBeenCalledTimes(2);
        const notice = await screen.findByTestId('setup-guide-notice');
        expect(notice).toHaveTextContent("Couldn't check Price scope");
        expect(notice).toHaveTextContent(NO_ANSWER);
        // The person never reads the transport's own words.
        expect(notice).not.toHaveTextContent('Request timeout');
        expect(screen.getByRole('button', { name: 'Check all steps' })).toBeEnabled();
    });

    it("passes on the extension's own sentence when it refuses a check", async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Adobe sign-in required.' });
        renderGuide([step({ id: 'a', title: 'Step A', checkable: true })]);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Check all steps' }));
        });
        expect(await screen.findByTestId('setup-guide-notice')).toHaveTextContent(
            "Couldn't check Step AAdobe sign-in required.",
        );
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
        // The list now checks it off (the mark is decoration, so it is outside the tab's name).
        expect(screen.getByRole('tab', { name: 'B' })).toHaveTextContent('✓');
    });

    it('says why when the extension refuses', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Adobe sign-in required.' });
        renderGuide();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));
        });
        const notice = await screen.findByTestId('setup-guide-notice');
        expect(notice).toHaveTextContent("Couldn't save the step");
        expect(notice).toHaveTextContent('Adobe sign-in required.');
    });

    it('words a save that got no answer for a person, not with the transport error', async () => {
        mockRequest.mockRejectedValue(new Error('Request timeout: setSetupStep'));
        renderGuide();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));
        });
        expect(await screen.findByTestId('setup-guide-notice')).toHaveTextContent(
            "Demo Builder didn't get an answer in time. Try again.",
        );
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
