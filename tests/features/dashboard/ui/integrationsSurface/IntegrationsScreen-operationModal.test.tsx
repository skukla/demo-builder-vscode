/**
 * PL-59 — the SCREEN hosts the operation progress modal, so it opens for an Add even
 * on a screen with no integrations yet, where there is no grid to host it. (What the
 * modal shows is pinned in IntegrationsGrid-progressModal.test.tsx.)
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import {
    DEPLOYED,
    IntegrationsScreen,
    captureHandlers,
    resetIntegrationsScreenMocks,
    settleStatus,
} from './IntegrationsScreen.testUtils';

beforeEach(() => {
    resetIntegrationsScreenMocks();
});

async function sendAdd(): Promise<void> {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(screen.getAllByRole('button', { name: 'Add integration' })[0]);
    await user.click(screen.getByRole('button', { name: 'send-add' }));
}

describe('IntegrationsScreen — the operation progress modal', () => {
    it('opens for the first Add, on a screen with no integrations yet', async () => {
        const handlers = captureHandlers();
        render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{}} />);
        settleStatus(handlers);

        await sendAdd();

        expect(screen.getByTestId('operation-modal')).toHaveAttribute('data-id', 'erp-sync');
        expect(screen.getByTestId('operation-modal')).toHaveTextContent('ERP Sync');
    });

    it('opens for an Add beside existing integrations', async () => {
        const handlers = captureHandlers();
        render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} />);
        settleStatus(handlers);

        await sendAdd();

        expect(screen.getByTestId('operation-modal')).toHaveAttribute('data-id', 'erp-sync');
    });

    it('is closed until something is started', () => {
        const handlers = captureHandlers();
        render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} />);
        settleStatus(handlers);

        expect(screen.queryByTestId('operation-modal')).not.toBeInTheDocument();
    });
});
