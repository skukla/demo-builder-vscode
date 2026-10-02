/**
 * ErpDemoControlsDialog — the mock ERP's demo controls on its card (AB-59): its look, and a
 * simulated downtime.
 *
 * The real Modal over the shared Spectrum mock; only the webview client is mocked, and every
 * request it receives is asserted in full. The ERP's answers are typed to the handlers' result
 * (`ErpDemoControlsResult`), so a fixture that drifts from what the extension sends fails to
 * compile.
 */

import { mockRequest } from '../../../../helpers/webviewClientMock';
import '@testing-library/jest-dom';

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

// Below the mock on purpose: jest.mock hoists within its own module only.
import {
    ErpDemoControlsDialog,
    type ErpDemoControlTarget,
} from '@/features/dashboard/ui/components/ErpDemoControlsDialog';
import type { ErpDemoControlsResult } from '@/types/erpDemoControls';

const WINDOW = {
    until: '2026-10-02T15:00:00.000Z',
    message: 'Nordwind is in maintenance until 15:00 UTC.',
};
/** Meridian's own look (lib/appearance.js THEMES.meridian). */
const MERIDIAN = { palette: 'indigo', logo: 'orbit', nav: 'top' };

function answer(data: Omit<NonNullable<ErpDemoControlsResult['data']>, 'id'>): ErpDemoControlsResult {
    return { success: true, data: { id: 'erp-integration', ...data } };
}

const WHICH = { id: 'erp-integration', erp: 'demo-erp' };

function target(control: ErpDemoControlTarget['control']): ErpDemoControlTarget {
    return { ...WHICH, name: 'Nordwind', control };
}

async function flush(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

async function open(control: ErpDemoControlTarget['control'] | null) {
    const onClose = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <ErpDemoControlsDialog target={control ? target(control) : null} onClose={onClose} />
        </Provider>,
    );
    await flush();
    return { onClose };
}

const button = (name: RegExp) => screen.getByRole('button', { name });
/** The core Modal's action buttons are focusable divs, so disabled reads off aria-disabled. */
const disabled = (name: RegExp) => button(name).getAttribute('aria-disabled') === 'true';
const group = (name: string) => screen.getByRole('radiogroup', { name });

beforeEach(() => {
    mockRequest.mockReset();
});

describe('ErpDemoControlsDialog', () => {
    it('renders nothing while closed, and asks the ERP nothing', async () => {
        await open(null);

        expect(screen.queryByRole('dialog')).toBeNull();
        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('says why when the ERP cannot be read', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Adobe sign-in required.' });

        await open('appearance');

        expect(screen.getByText('Adobe sign-in required.')).toBeInTheDocument();
        expect(disabled(/^save$/i)).toBe(true);
    });

    it('a request with no answer says so in plain words, not the transport\'s', async () => {
        mockRequest.mockRejectedValue(new Error('Request timeout (30000ms)'));

        await open('downtime');

        expect(screen.getByText('No answer came back from the ERP. Try again.')).toBeInTheDocument();
        expect(screen.queryByText(/Request timeout/)).toBeNull();
    });
});

describe('ErpDemoControlsDialog — appearance', () => {
    it("reads the ERP's look and shows its theme and colour chosen", async () => {
        mockRequest.mockResolvedValue(answer({ appearance: MERIDIAN, maintenance: null }));

        await open('appearance');

        expect(mockRequest).toHaveBeenCalledWith('getErpDemoControls', WHICH);
        expect(screen.getByText(/Nordwind: demo appearance/)).toBeInTheDocument();
        expect(within(group('Theme')).getByRole('radio', { name: /^Meridian/ })).toBeChecked();
        expect(within(group('Colour')).getByRole('radio', { name: /^Indigo/ })).toBeChecked();
        // Nothing changed yet, so nothing to save.
        expect(disabled(/^save$/i)).toBe(true);
    });

    it('a theme brings its own colour, a colour then overrides it, and Save sends both', async () => {
        mockRequest.mockResolvedValueOnce(answer({ appearance: MERIDIAN, maintenance: null }));
        mockRequest.mockResolvedValueOnce(
            answer({ appearance: { palette: 'plum', logo: 'monogram', nav: 'top' } }),
        );
        const { onClose } = await open('appearance');

        fireEvent.click(within(group('Theme')).getByRole('radio', { name: /^Foundry/ }));
        expect(within(group('Colour')).getByRole('radio', { name: /^Bronze/ })).toBeChecked();
        fireEvent.click(within(group('Colour')).getByRole('radio', { name: /^Plum/ }));
        fireEvent.click(button(/^save$/i));
        await flush();

        expect(mockRequest).toHaveBeenLastCalledWith('setErpAppearance', {
            ...WHICH,
            theme: 'foundry',
            palette: 'plum',
        });
        expect(onClose).toHaveBeenCalled();
    });

    it('a look no theme matches sends the colour alone', async () => {
        mockRequest.mockResolvedValueOnce(
            answer({ appearance: { palette: 'plum', logo: 'cube', nav: 'top' }, maintenance: null }),
        );
        mockRequest.mockResolvedValueOnce(answer({ appearance: MERIDIAN }));
        await open('appearance');

        fireEvent.click(within(group('Colour')).getByRole('radio', { name: /^Teal/ }));
        fireEvent.click(button(/^save$/i));
        await flush();

        expect(mockRequest).toHaveBeenLastCalledWith('setErpAppearance', {
            ...WHICH,
            palette: 'teal',
        });
    });

    it('a refused save stays open and says why', async () => {
        mockRequest.mockResolvedValueOnce(answer({ appearance: MERIDIAN, maintenance: null }));
        mockRequest.mockResolvedValueOnce({
            success: false,
            error: 'The ERP answered 503 for PATCH settings: Nordwind is in maintenance until 15:00 UTC.',
        });
        const { onClose } = await open('appearance');

        fireEvent.click(within(group('Theme')).getByRole('radio', { name: /^Granite/ }));
        fireEvent.click(button(/^save$/i));
        await flush();

        expect(screen.getByText(/Nordwind is in maintenance until 15:00 UTC/)).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe('ErpDemoControlsDialog — simulated downtime', () => {
    it('offers 30 minutes, starts the window, then offers to end it', async () => {
        mockRequest.mockResolvedValueOnce(answer({ appearance: MERIDIAN, maintenance: null }));
        mockRequest.mockResolvedValueOnce(answer({ maintenance: WINDOW }));
        await open('downtime');

        expect(screen.getByText(/Nordwind: simulate downtime/)).toBeInTheDocument();
        expect(screen.getByLabelText('Minutes')).toHaveValue(30);
        fireEvent.click(button(/^start downtime$/i));
        await flush();

        expect(mockRequest).toHaveBeenLastCalledWith('startErpDowntime', { ...WHICH, minutes: 30 });
        expect(screen.getByText(WINDOW.message)).toBeInTheDocument();
        expect(disabled(/^end downtime$/i)).toBe(false);
        expect(screen.queryByRole('button', { name: /^start downtime$/i })).toBeNull();
    });

    it('sends the minutes typed, and refuses none or more than a day', async () => {
        mockRequest.mockResolvedValueOnce(answer({ appearance: MERIDIAN, maintenance: null }));
        mockRequest.mockResolvedValueOnce(answer({ maintenance: WINDOW }));
        await open('downtime');

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
        mockRequest.mockResolvedValueOnce(answer({ appearance: MERIDIAN, maintenance: WINDOW }));
        mockRequest.mockResolvedValueOnce(answer({ maintenance: null }));
        await open('downtime');

        expect(screen.getByText(WINDOW.message)).toBeInTheDocument();
        expect(screen.queryByLabelText('Minutes')).toBeNull();
        fireEvent.click(button(/^end downtime$/i));
        await flush();

        expect(mockRequest).toHaveBeenLastCalledWith('endErpDowntime', WHICH);
        expect(screen.getByLabelText('Minutes')).toHaveValue(30);
        expect(screen.queryByText(WINDOW.message)).toBeNull();
    });
});
