/**
 * IntegrationSettingsModal — an integration's Settings (AB-21).
 *
 * The real Modal over the shared Spectrum mock; only the webview client is
 * mocked, and the request it receives is asserted in full.
 */

import '../../../../helpers/webviewClientMock';
import '@testing-library/jest-dom';

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

// Below the mock on purpose: jest.mock hoists within its own module only.
import { IntegrationSettingsModal } from '@/features/dashboard/ui/components/IntegrationSettingsModal';
import type { ComponentSettings } from '@/types/appBuilderComponents';

const SECRET = 'fake-test-pw-not-a-secret';

const SETTINGS: ComponentSettings = {
    fields: [
        { name: 'ERP_DISPLAY_NAME', label: 'ERP name', type: 'text', required: false, value: 'Acme ERP' },
        { name: 'ERP_REGION', label: 'Region', type: 'text', required: true, value: 'eu' },
        { name: 'ERP_API_KEY', label: 'API key', type: 'secret', required: true, isSet: true },
    ],
    connected: [{ name: 'ERP_BASE_URL', label: 'ERP address', from: 'Acme ERP', value: 'https://ns.example/web/demo-erp' }],
};

function getClient() {
    return jest.requireMock('@/core/ui/utils/WebviewClient').webviewClient;
}

async function flush(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

function renderModal(target: { id: string; name: string; settings: ComponentSettings } | null = {
    id: 'erp-integration',
    name: 'ERP integration',
    settings: SETTINGS,
}) {
    const onClose = jest.fn();
    const onSaved = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <IntegrationSettingsModal target={target} onClose={onClose} onSaved={onSaved} />
        </Provider>,
    );
    return { onClose, onSaved };
}

const saveButton = () => screen.getByRole('button', { name: /save and redeploy/i });
const field = (label: string) => screen.getByText(label).closest('label')?.querySelector('input') as HTMLInputElement;

beforeEach(() => {
    jest.clearAllMocks();
    getClient().request.mockReset();
});

describe('IntegrationSettingsModal', () => {
    it('renders nothing while closed', () => {
        renderModal(null);

        expect(screen.queryByText('ERP integration settings')).not.toBeInTheDocument();
    });

    it('shows each setting with its value, a secret only as set, and the provided address read-only', () => {
        renderModal();

        expect(screen.getByText('ERP integration settings')).toBeInTheDocument();
        expect(field('ERP name').value).toBe('Acme ERP');
        expect(field('Region').value).toBe('eu');
        expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('');
        expect(screen.getByText('Secret is set')).toBeInTheDocument();
        expect(screen.getByText(/ERP address: https:\/\/ns\.example\/web\/demo-erp \(from Acme ERP\)/)).toBeInTheDocument();
        expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    });

    it('Save is off until something changes, and off while a required setting is blank', () => {
        renderModal();
        expect(saveButton()).toHaveAttribute('aria-disabled', 'true');

        fireEvent.change(field('ERP name'), { target: { value: 'Nordwind' } });
        expect(saveButton()).toHaveAttribute('aria-disabled', 'false');

        fireEvent.change(field('Region'), { target: { value: ' ' } });
        expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
        expect(field('Region')).toHaveAttribute('data-validation-state', 'invalid');
        expect(screen.getByText('Region cannot be empty.')).toBeInTheDocument();
    });

    it('sends only what changed, then passes the new settings up and closes', async () => {
        const next: ComponentSettings = { ...SETTINGS, fields: [{ ...SETTINGS.fields[0], value: 'Nordwind' }] };
        getClient().request.mockResolvedValue({ success: true, saved: true, settings: next });
        const { onClose, onSaved } = renderModal();

        fireEvent.change(field('ERP name'), { target: { value: 'Nordwind' } });
        fireEvent.change(screen.getByLabelText('API key'), { target: { value: SECRET } });
        fireEvent.click(saveButton());
        await flush();

        expect(getClient().request).toHaveBeenCalledWith('saveIntegrationSettings', {
            id: 'erp-integration',
            values: { ERP_DISPLAY_NAME: 'Nordwind' },
            secrets: { ERP_API_KEY: SECRET },
        });
        expect(onSaved).toHaveBeenCalledWith('erp-integration', next);
        expect(onClose).toHaveBeenCalled();
    });

    it('a failed redeploy keeps the modal open with the reason, and still passes up what was saved', async () => {
        getClient().request.mockResolvedValue({
            success: false,
            saved: true,
            error: 'Settings saved, but redeploying ERP failed: aio said no',
            settings: SETTINGS,
        });
        const { onClose, onSaved } = renderModal();

        fireEvent.change(field('ERP name'), { target: { value: 'Nordwind' } });
        fireEvent.click(saveButton());
        await flush();

        expect(screen.getByText('Settings saved, but redeploying ERP failed: aio said no')).toBeInTheDocument();
        expect(onSaved).toHaveBeenCalledWith('erp-integration', SETTINGS);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('while saving, says the redeploy can take a while and that the window can be closed', async () => {
        getClient().request.mockReturnValue(new Promise(() => undefined));
        renderModal();

        fireEvent.change(field('ERP name'), { target: { value: 'Nordwind' } });
        fireEvent.click(saveButton());
        await flush();

        expect(screen.getByRole('button', { name: /saving and redeploying/i })).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByText(/you\s+can close this window/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });
});
