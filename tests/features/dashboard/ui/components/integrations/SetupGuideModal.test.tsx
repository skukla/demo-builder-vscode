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
    Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
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

/** Render the guide and let its sign-in ahead of the checks settle, as it does on open. */
async function renderGuide(
    items: SetupChecklistItem[] = THREE,
    props: { onClose?: () => void; onOpenAdmin?: () => void } = {}
) {
    const rendered = render(
        <SetupGuideModal
            model={model(items)}
            onClose={props.onClose ?? jest.fn()}
            onOpenAdmin={props.onOpenAdmin ?? jest.fn()}
        />
    );
    await act(async () => {});
    return rendered;
}

/** The guide's sign-in ahead of the checks, answered at once unless a test holds it. */
const PREPARED = { success: true, data: { ready: true } };

/** Answer check (and save) requests with `answer`; the sign-in ahead of them answers at once. */
function answerChecks(answer: (type: string, payload: unknown) => Promise<unknown>): void {
    mockRequest.mockImplementation((type: string, payload: unknown) =>
        type === 'prepareSetupChecks' ? Promise.resolve(PREPARED) : answer(type, payload),
    );
}

/** The check requests sent, without the sign-in ahead of them. */
const checkCalls = () => mockRequest.mock.calls.filter(([type]) => type === 'checkSetupSteps');

/** The detail pane: the one shown step. */
const shown = () => screen.getByTestId('setup-guide-step');

beforeEach(() => {
    jest.clearAllMocks();
    answerChecks(async () => ({ success: true }));
});

describe('SetupGuideModal', () => {
    it('shows nothing when no guide is open', async () => {
        render(<SetupGuideModal model={null} onClose={jest.fn()} onOpenAdmin={jest.fn()} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens on the first step still to do, with what, where and why all in view', async () => {
        await renderGuide();
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

    it('opens past an optional step to the first one that must be done', async () => {
        await renderGuide([
            step({ id: 'a', title: 'Step A', state: 'done' }),
            step({ id: 'o', title: 'Step O', optional: true }),
            step({ id: 'b', title: 'Step B' }),
        ]);
        expect(within(shown()).getByRole('heading', { name: 'Step B' })).toBeInTheDocument();
    });

    it('labels an optional step Optional, and only that step', async () => {
        await renderGuide([step({ id: 'o', title: 'Step O', optional: true }), step({ id: 'b', title: 'Step B' })]);
        // The guide opens on Step B, the one every demo needs; it carries no label.
        expect(within(shown()).getByRole('heading', { name: 'Step B' })).toBeInTheDocument();
        expect(within(shown()).queryByTestId('badge')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: /Step O/ }));
        expect(within(shown()).getByTestId('badge')).toHaveTextContent('Optional');
    });

    it('lists every step by its short label with its state, and the list is the only progress', async () => {
        await renderGuide([...THREE, step({ id: 'd', title: 'Step D', state: 'dismissed' })]);
        const tabs = screen.getAllByRole('tab');
        // A label where the catalog gives one, the title where it does not.
        // The extension's done mark on the done step, a dash on the skipped one, nothing on an open one.
        const part = (tab: HTMLElement, cls: string) => tab.querySelector(cls)?.textContent;
        expect(tabs.map((tab) => part(tab, '.setup-guide-rail-title'))).toStrictEqual(['A', 'B', 'Step C', 'Step D']);
        const done = (tab: HTMLElement) => tab.querySelector('.setup-guide-rail-mark .text-green-600') !== null;
        expect(tabs.map(done)).toStrictEqual([true, false, false, false]);
        expect(part(tabs[3], '.setup-guide-rail-mark')).toBe('–');
        expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('draws every step in one place so the pane is as tall as the tallest, showing only the chosen one', async () => {
        // A guide opening on a short step jumped when a taller one was chosen (2026-10-01).
        const { container } = await renderGuide();
        const panes = container.querySelectorAll('.setup-guide-panes > .setup-guide-step');
        expect(panes).toHaveLength(THREE.length);
        const hidden = Array.from(panes).filter((pane) => pane.classList.contains('setup-guide-step--hidden'));
        expect(hidden).toHaveLength(THREE.length - 1);
        // The hidden ones are out of the accessibility tree; one step answers to the test id.
        expect(hidden.every((pane) => pane.getAttribute('aria-hidden') === 'true')).toBe(true);
        expect(screen.getAllByTestId('setup-guide-step')).toHaveLength(1);
        expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toStrictEqual(['Step B']);
    });

    it('the list is the only navigation: no Back or Next, and any step is one click away', async () => {
        await renderGuide();
        expect(screen.queryByText('Back')).not.toBeInTheDocument();
        expect(screen.queryByText('Next')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Step C' }));
        expect(within(shown()).getByRole('heading', { name: 'Step C' })).toBeInTheDocument();
    });

    it('draws the Admin path as breadcrumbs, the values as copyable pills, and the follow-up as one line', async () => {
        await renderGuide([STRUCTURED]);
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

    it('shows a passed check as a blue notice under the title, with what it found', async () => {
        await renderGuide([
            step({
                id: 'c',
                title: 'Step C',
                checkable: true,
                state: 'done',
                note: '2 companies, each with its own catalog.',
                lastCheck: 'passed',
            }),
        ]);
        const result = within(shown()).getByTestId('setup-guide-check-result');
        expect(result).toHaveClass('inline-notice--info');
        expect(result).toHaveTextContent('Checked: set up correctly');
        expect(result).toHaveTextContent('2 companies, each with its own catalog.');
    });

    it('shows a failed check, and one that could not tell, as amber notices', async () => {
        await renderGuide([
            step({ id: 'p', title: 'Step P', checkable: true, note: 'Payment on Account is off for the acme website.', lastCheck: 'failed' }),
            step({ id: 'q', title: 'Step Q', checkable: true, note: 'Could not check: Commerce REST answered HTTP 503.', lastCheck: 'unknown' }),
        ]);
        const failed = within(shown()).getByTestId('setup-guide-check-result');
        expect(failed).not.toHaveClass('inline-notice--info');
        expect(failed).toHaveTextContent('Not set up yetPayment on Account is off for the acme website.');
        fireEvent.click(screen.getByRole('tab', { name: 'Step Q' }));
        // The check's own "Could not check:" lead is not repeated under the same title.
        expect(within(shown()).getByTestId('setup-guide-check-result')).toHaveTextContent(
            "Couldn't check this stepCommerce REST answered HTTP 503.",
        );
    });

    it('shows no result before a check has run, or on a skipped step', async () => {
        await renderGuide([
            step({ id: 'a', title: 'Step A', checkable: true }),
            step({ id: 'b', title: 'Step B', checkable: true, state: 'dismissed', note: 'x', lastCheck: 'failed' }),
        ]);
        expect(within(shown()).queryByTestId('setup-guide-check-result')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Step B' }));
        expect(within(shown()).queryByTestId('setup-guide-check-result')).not.toBeInTheDocument();
    });

    it('signs in to Commerce as it opens, ahead of any check', async () => {
        await renderGuide();
        expect(mockRequest).toHaveBeenCalledWith('prepareSetupChecks', { id: 'erp-integration' });
        expect(checkCalls()).toHaveLength(0);
    });

    it('says Connecting to Commerce while a run waits on that sign-in', async () => {
        let signedIn: (answer: unknown) => void = () => undefined;
        mockRequest.mockImplementation((type: string) =>
            type === 'prepareSetupChecks'
                ? new Promise((resolve) => (signedIn = resolve))
                : new Promise(() => undefined),
        );
        render(<SetupGuideModal model={model([step({ id: 'a', title: 'Step A', checkable: true })])} onClose={jest.fn()} onOpenAdmin={jest.fn()} />);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Check all steps' }));
        });
        expect(screen.getByRole('button', { name: 'Connecting to Commerce' })).toBeDisabled();
        await act(async () => signedIn(PREPARED));
        expect(screen.getByRole('button', { name: 'Checking 1 of 1' })).toBeDisabled();
    });

    it('closes from the dialog footer', async () => {
        const onClose = jest.fn();
        await renderGuide(THREE, { onClose });
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('marks the shown step done, by id, from the dialog footer', async () => {
        await renderGuide();
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
        await renderGuide();
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
        await renderGuide();
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

    it('offers Check all steps in place of Mark as done on a step Demo Builder can check', async () => {
        await renderGuide();
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
        answerChecks(() => new Promise((resolve) => pending.push(resolve)));
        await renderGuide(checkable);
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
        expect(checkCalls()).toHaveLength(2);
        expect(screen.getByRole('button', { name: 'Check all steps' })).toBeEnabled();
        // Step B is still open, so the guide lands there with its reason in view.
        expect(within(shown()).getByRole('heading', { name: 'Step B' })).toBeInTheDocument();
    });

    it('carries on past a step it cannot check, then names it in the house notice', async () => {
        // The guide's request limit ran out on step A (2026-10-01); B must still be checked.
        let asked = 0;
        answerChecks(async () => {
            asked += 1;
            if (asked === 1) throw new Error('Request timeout: checkSetupSteps');
            return { success: true, data: { items: [] } };
        });
        await renderGuide([
            step({ id: 'a', title: 'Step A', label: 'Price scope', checkable: true }),
            step({ id: 'b', title: 'Step B', checkable: true }),
        ]);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Check all steps' }));
        });
        expect(checkCalls()).toHaveLength(2);
        const notice = await screen.findByTestId('setup-guide-notice');
        expect(notice).toHaveTextContent("Couldn't check Price scope");
        expect(notice).toHaveTextContent(NO_ANSWER);
        // The person never reads the transport's own words.
        expect(notice).not.toHaveTextContent('Request timeout');
        expect(screen.getByRole('button', { name: 'Check all steps' })).toBeEnabled();
    });

    it("passes on the extension's own sentence when it refuses a check", async () => {
        answerChecks(async () => ({ success: false, error: 'Adobe sign-in required.' }));
        await renderGuide([step({ id: 'a', title: 'Step A', checkable: true })]);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Check all steps' }));
        });
        expect(await screen.findByTestId('setup-guide-notice')).toHaveTextContent(
            "Couldn't check Step AAdobe sign-in required.",
        );
    });

    it('opens Commerce Admin', async () => {
        const onOpenAdmin = jest.fn();
        await renderGuide(THREE, { onOpenAdmin });
        fireEvent.click(screen.getByRole('button', { name: 'Open Commerce Admin' }));
        expect(onOpenAdmin).toHaveBeenCalledTimes(1);
    });

    it('stays on the step when the pushed-back model marks it done', async () => {
        const { rerender } = await renderGuide();
        const updated = THREE.map((item) =>
            item.id === 'b' ? { ...item, state: 'done' as const } : item
        );
        rerender(
            <SetupGuideModal model={model(updated)} onClose={jest.fn()} onOpenAdmin={jest.fn()} />
        );
        expect(within(shown()).getByRole('heading', { name: 'Step B' })).toBeInTheDocument();
        // The list now checks it off (the mark is decoration, so it is outside the tab's name).
        expect(screen.getByRole('tab', { name: 'B' }).querySelector('.text-green-600')).not.toBeNull();
    });

    it('says why when the extension refuses', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Adobe sign-in required.' });
        await renderGuide();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));
        });
        const notice = await screen.findByTestId('setup-guide-notice');
        expect(notice).toHaveTextContent("Couldn't save the step");
        expect(notice).toHaveTextContent('Adobe sign-in required.');
    });

    it('words a save that got no answer for a person, not with the transport error', async () => {
        mockRequest.mockRejectedValue(new Error('Request timeout: setSetupStep'));
        await renderGuide();
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

    it('offers the guide of the card the operation was for, counting the steps left', async () => {
        const openGuide = jest.fn();
        const next = setupNextStep(cards, 'erp-integration', openGuide);

        expect(next?.message).toBe('Next: 2 setup steps in Commerce for the demo.');
        expect(next?.action).toBe('Start setup guide');
        next?.onPress();
        expect(openGuide).toHaveBeenCalledWith('erp-integration');
    });

    it('does not count an open optional step as left', async () => {
        const withOptional = [
            {
                ...cards[0],
                setupChecklist: [...THREE, step({ id: 'o', title: 'Step O', optional: true })],
            },
        ];
        expect(setupNextStep(withOptional, 'erp-integration', jest.fn())?.message).toBe(
            'Next: 2 setup steps in Commerce for the demo.',
        );
        const onlyOptional = [{ ...cards[0], setupChecklist: [step({ id: 'o', optional: true })] }];
        expect(setupNextStep(onlyOptional, 'erp-integration', jest.fn())).toBeUndefined();
    });

    it('offers nothing for a card with no steps left, or no operation', async () => {
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
