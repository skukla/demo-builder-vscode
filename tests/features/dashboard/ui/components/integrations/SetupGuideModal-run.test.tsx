/**
 * SetupGuideModal — a demo setup run inside the guide (AB-81, owner 2026-10-26: "why are there
 * so many modals?"). The shown step's line says what Apply will do (read from the store), the
 * button runs it in place, the step's badge follows the run's `operationProgress` pushes and
 * flips when it ends, or says why it stopped. A run that stops on a question goes to the
 * progress window.
 */

import { mockPostMessage, mockRequest, webviewClientHandlers } from '../../../../../helpers/webviewClientMock';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import type { IntegrationCardModel } from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import { FIX_COPY, STATUS_COPY, SetupGuideModal } from './SetupGuideModal.testUtils';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

/** Justrite's warehouse step after an undo, 2026-10-26. */
const WAREHOUSE: SetupChecklistItem = {
    id: 'second-source',
    label: 'ERP warehouse',
    title: "Give each ERP a warehouse, and assign it to the website's stock",
    why: 'w',
    where: 'Admin',
    state: 'open',
    checkable: true,
    fix: { kind: 'handler', handler: 'erp-warehouse-in-website-stock' },
    applicable: true,
};

const model = { id: 'erp-integration', name: 'ERP Integration', setupChecklist: [WAREHOUSE] } as IntegrationCardModel;

/** The preview the pane reads for the step, as the handler answers it. */
const PREVIEW = {
    success: true,
    data: {
        steps: [
            {
                id: 'second-source',
                label: 'ERP warehouse',
                title: WAREHOUSE.title,
                state: 'applicable',
                changes: ['Switch Test Warehouse back on', 'Add Test Warehouse to Justrite Stock'],
                rejected: [],
            },
        ],
    },
};

function push(payload: OperationProgressPayload): void {
    act(() => webviewClientHandlers.get('operationProgress')?.(payload));
}

async function renderGuide() {
    const onClose = jest.fn();
    const onAsk = jest.fn();
    render(<SetupGuideModal model={model} onClose={onClose} onOpenAdmin={jest.fn()} onAsk={onAsk} />);
    await act(async () => {});
    return { onClose, onAsk };
}

const pane = () => screen.getByTestId('setup-guide-step');
/**
 * Where the step stands, in the house banner under its title (owner, 2026-10-26): its title,
 * then one short sentence at most, read as one string. Nothing else in the pane reports a run.
 */
const banner = () => within(pane()).getByTestId('setup-guide-step-status');
// The icon mock renders its name as text; the banner's words follow it.
const says = () => banner().textContent?.replace(/^DefaultIcon/u, '');

beforeEach(() => {
    mockPostMessage.mockReset();
    mockRequest.mockReset();
    mockRequest.mockImplementation((type: string) =>
        Promise.resolve(type === 'prepareCommerceStore' ? PREVIEW : { success: true, data: { ready: true } }),
    );
});

describe('the step pane says what Apply will do', () => {
    it('reads the step from the store and says it in one sentence, before anything is pressed', async () => {
        await renderGuide();
        expect(mockRequest).toHaveBeenCalledWith('prepareCommerceStore', { id: 'erp-integration', stepIds: ['second-source'] });
        expect(says()).toBe(`${STATUS_COPY.notSetUp}Apply will switch Test Warehouse back on and add Test Warehouse to Justrite Stock.`);
        expect(banner()).not.toHaveClass('inline-notice--info');
        expect(mockPostMessage).not.toHaveBeenCalled();
    });
});

describe('Apply runs in the guide', () => {
    it('follows the run in the pane, waits its buttons, and ends on what changed', async () => {
        const { onClose } = await renderGuide();
        fireEvent.click(screen.getByRole('button', { name: FIX_COPY.fix }));
        push({ id: 'erp-integration', state: 'running', stage: 'Applying the demo setup', step: 'ERP warehouse: Applying' });
        // The extension's progress words stay out of the guide: the list's mark spins instead.
        expect(says()).toBe(STATUS_COPY.applying);
        expect(screen.getByRole('button', { name: 'Check all steps' })).toBeDisabled();

        push({
            id: 'erp-integration',
            state: 'succeeded',
            changes: [
                {
                    label: 'ERP warehouse',
                    lines: ['Switched Test Warehouse back on', 'Added Test Warehouse to Justrite Stock', 'By hand: Move the quantities.'],
                },
            ],
        });
        // The badge flips; nothing reports the run (owner, 2026-10-26).
        expect(says()).toBe(STATUS_COPY.done);
        expect(banner()).toHaveClass('inline-notice--info');
        expect(within(pane()).queryByText(/Switched Test Warehouse/)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Check all steps' })).not.toBeDisabled();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('says why when the run stops', async () => {
        await renderGuide();
        fireEvent.click(screen.getByRole('button', { name: FIX_COPY.fix }));
        push({ id: 'erp-integration', state: 'failed', error: 'Commerce answered 403.' });
        expect(says()).toBe(`${STATUS_COPY.applyFailed}Commerce answered 403.`);
    });

    it("ignores another integration's progress", async () => {
        await renderGuide();
        fireEvent.click(screen.getByRole('button', { name: FIX_COPY.fix }));
        push({ id: 'something-else', state: 'failed', error: 'Not this one.' });
        expect(within(pane()).queryByText('Not this one.')).not.toBeInTheDocument();
    });
});

// The progress window asks questions; the guide does not (sign-in, another org).
describe('a run that stops on a question', () => {
    it('closes the guide and hands the run to the progress window, with the step to come back to', async () => {
        const { onClose, onAsk } = await renderGuide();
        fireEvent.click(screen.getByRole('button', { name: FIX_COPY.fix }));
        push({ id: 'erp-integration', state: 'running', prompt: { message: 'Sign in to Adobe?', actions: ['Sign in'] } });
        // The guide forgets the run, so its pane reads the plan again: let that read land.
        await act(async () => {});
        expect(onClose).toHaveBeenCalled();
        expect(onAsk).toHaveBeenCalledWith(
            {
                id: 'erp-integration',
                name: 'ERP Integration',
                message: 'prepareCommerceStore',
                payload: { id: 'erp-integration', confirm: true, stepIds: ['second-source'] },
                title: 'Applying ERP warehouse',
                failureTitle: "Couldn't apply ERP warehouse",
                successTitle: 'ERP warehouse applied',
            },
            'second-source',
        );
    });
});
