/**
 * ErpDowntimeDialog — "Simulate downtime" on the mock ERP's card (AB-59).
 *
 * The real Modal over the shared Spectrum mock; only the webview client is mocked, and every
 * request it receives is asserted in full. The ERP's answers are typed to the handlers' result
 * (`ErpDemoControlsResult`), so a fixture that drifts from what the extension sends fails to
 * compile.
 */

import { mockRequest } from '../../../../helpers/webviewClientMock';
import '@testing-library/jest-dom';

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

// Below the mock on purpose: jest.mock hoists within its own module only.
import { ErpDowntimeDialog } from '@/features/dashboard/ui/components/ErpDowntimeDialog';
import type { ErpDemoControlsResult } from '@/types/erpDemoControls';

const WINDOW = {
    until: '2026-10-02T15:00:00.000Z',
    message: 'Nordwind is in maintenance until 15:00 UTC.',
};
function answer(data: Omit<NonNullable<ErpDemoControlsResult['data']>, 'id'>): ErpDemoControlsResult {
    return { success: true, data: { id: 'erp-integration', ...data } };
}

const WHICH = { id: 'erp-integration', erp: 'demo-erp' };

async function flush(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

async function open(isOpen = true) {
    const onClose = jest.fn();
    const target = isOpen ? { ...WHICH, name: 'Nordwind' } : null;
    render(
        <Provider theme={defaultTheme}>
            <ErpDowntimeDialog target={target} onClose={onClose} />
        </Provider>,
    );
    await flush();
    return { onClose };
}

const button = (name: RegExp) => screen.getByRole('button', { name });
/** The core Modal's action buttons are focusable divs, so disabled reads off aria-disabled. */
const disabled = (name: RegExp) => button(name).getAttribute('aria-disabled') === 'true';

beforeEach(() => {
    mockRequest.mockReset();
});

describe('ErpDowntimeDialog', () => {
    it('renders nothing while closed, and asks the ERP nothing', async () => {
        await open(false);

        expect(screen.queryByRole('dialog')).toBeNull();
        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('says why when the ERP cannot be read', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Adobe sign-in required.' });

        await open();

        // The title is the outcome, with nothing to start.
        expect(screen.getByText("Couldn't Read Nordwind")).toBeInTheDocument();
        expect(document.querySelector('.modal-status-icon')).not.toBeNull();
        expect(screen.getByText('Adobe sign-in required.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^start downtime$/i })).toBeNull();
    });

    it('while the ERP is read, the dialog is the wait, saying so', async () => {
        mockRequest.mockReturnValue(new Promise(() => undefined));

        await open();

        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(screen.getByText('Reading the ERP status')).toBeInTheDocument();
        expect(screen.queryByLabelText('Minutes')).toBeNull();
        expect(screen.queryByRole('button', { name: /^start downtime$/i })).toBeNull();
    });

    it('a request with no answer says so in plain words, not the transport\'s', async () => {
        mockRequest.mockRejectedValue(new Error('Request timeout (30000ms)'));

        await open();

        expect(screen.getByText('No answer came back from the ERP. Try again.')).toBeInTheDocument();
        expect(screen.queryByText(/Request timeout/)).toBeNull();
    });
});

describe('ErpDowntimeDialog — the window', () => {
    it('offers 30 minutes, starts the window, then offers to end it', async () => {
        mockRequest.mockResolvedValueOnce(answer({ maintenance: null }));
        mockRequest.mockResolvedValueOnce(answer({ maintenance: WINDOW }));
        await open();

        expect(mockRequest).toHaveBeenCalledWith('getErpDemoControls', WHICH);
        expect(screen.getByText(/Nordwind: Simulate Downtime/)).toBeInTheDocument();
        expect(screen.getByLabelText('Minutes')).toHaveValue(30);
        fireEvent.click(button(/^start downtime$/i));
        await flush();

        expect(mockRequest).toHaveBeenLastCalledWith('startErpDowntime', { ...WHICH, minutes: 30 });
        expect(screen.getByText(WINDOW.message)).toBeInTheDocument();
        expect(disabled(/^end downtime$/i)).toBe(false);
        expect(screen.queryByRole('button', { name: /^start downtime$/i })).toBeNull();
    });

    it('a refused start is the title, in red, with the ERP\'s words and the form still there', async () => {
        mockRequest.mockResolvedValueOnce(answer({ maintenance: null }));
        mockRequest.mockResolvedValueOnce({ success: false, error: 'The ERP is not deployed.' });
        await open();

        // A plain line of what it does, above the one field.
        expect(screen.getByText(/answers every call as down for maintenance until the time is up/)).toBeInTheDocument();
        expect(document.querySelector('.modal-status-icon')).toBeNull();
        fireEvent.click(button(/^start downtime$/i));
        await flush();

        expect(screen.getByText("Couldn't Start Downtime on Nordwind")).toBeInTheDocument();
        expect(document.querySelector('.modal-status-icon')).not.toBeNull();
        expect(screen.getByText('The ERP is not deployed.')).not.toHaveClass('text-negative');
        expect(screen.getByLabelText('Minutes')).toHaveValue(30);
    });

    it('a refused end says it was the end that failed', async () => {
        mockRequest.mockResolvedValueOnce(answer({ maintenance: WINDOW }));
        mockRequest.mockResolvedValueOnce({ success: false, error: 'The ERP is not deployed.' });
        await open();

        fireEvent.click(button(/^end downtime$/i));
        await flush();

        expect(screen.getByText("Couldn't End Downtime on Nordwind")).toBeInTheDocument();
        expect(screen.getByText(WINDOW.message)).toBeInTheDocument();
    });

    it('sends the minutes typed, and refuses none or more than a day', async () => {
        mockRequest.mockResolvedValueOnce(answer({ maintenance: null }));
        mockRequest.mockResolvedValueOnce(answer({ maintenance: WINDOW }));
        await open();

        fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '1441' } });
        expect(disabled(/^start downtime$/i)).toBe(true);
        fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } });
        expect(disabled(/^start downtime$/i)).toBe(true);
        fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '5' } });
        fireEvent.click(button(/^start downtime$/i));
        await flush();

        expect(mockRequest).toHaveBeenLastCalledWith('startErpDowntime', { ...WHICH, minutes: 5 });
    });

    it('while a window is running, offers only to end it, and ending it offers a new one', async () => {
        mockRequest.mockResolvedValueOnce(answer({ maintenance: WINDOW }));
        mockRequest.mockResolvedValueOnce(answer({ maintenance: null }));
        await open();

        expect(screen.getByText(WINDOW.message)).toBeInTheDocument();
        expect(screen.queryByLabelText('Minutes')).toBeNull();
        fireEvent.click(button(/^end downtime$/i));
        await flush();

        expect(mockRequest).toHaveBeenLastCalledWith('endErpDowntime', WHICH);
        expect(screen.getByLabelText('Minutes')).toHaveValue(30);
        expect(screen.queryByText(WINDOW.message)).toBeNull();
    });
});
