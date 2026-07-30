/**
 * AddIntegrationModal Tests (integrations grid — Step 6)
 *
 * The add-integration surface moves from the inline picker
 * (AppBuilderComponentsList) into a DialogContainer + core Modal, hosted by
 * the grid. Content and messages are ported verbatim:
 *   - catalog `kind:'integration'` entry → addAppBuilderComponent {id}
 *   - custom GitHub URL (parseGitHubUrl-gated) → addAppBuilderComponent {source}
 * Posting closes the modal; Cancel closes without posting.
 *
 * Strict TDD: written BEFORE the component exists.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddIntegrationModal } from '@/features/dashboard/ui/components/integrations/AddIntegrationModal';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(() => jest.fn()),
        request: jest.fn(() => new Promise(() => {})),
    },
}));

jest.mock('@adobe/react-spectrum', () => ({
    Flex: ({ children, ...props }: any) => (
        <div style={{ display: 'flex' }} {...props}>
            {children}
        </div>
    ),
    Button: ({ children, onPress, isDisabled, variant, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} data-variant={variant} {...props}>
            {children}
        </button>
    ),
    TextField: ({ label, value, onChange, ...props }: any) => (
        <input
            aria-label={label}
            value={value ?? ''}
            onChange={(e) => onChange?.(e.target.value)}
            {...props}
        />
    ),
    Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    DialogContainer: ({ children }: any) => <div data-testid="dialog-container">{children}</div>,
}));

jest.mock('@/core/ui/components/ui/Modal', () => ({
    Modal: ({ title, actionButtons = [], onClose, closeLabel, children }: any) => (
        <div role="dialog" aria-label={title}>
            <h2>{title}</h2>
            {children}
            <button onClick={onClose}>{closeLabel ?? 'Close'}</button>
            {actionButtons.map((b: any, i: number) => (
                <button key={i} onClick={b.onPress} data-variant={b.variant} disabled={b.isDisabled}>
                    {b.label}
                </button>
            ))}
        </div>
    ),
}));

function getClient() {
    const { webviewClient } = require('@/core/ui/utils/WebviewClient');
    return webviewClient as { postMessage: jest.Mock };
}

const CATALOG: AppBuilderComponentCatalogEntry[] = [
    {
        id: 'erp-sync',
        name: 'ERP Sync',
        description: 'Sync ERP data',
        kind: 'integration',
        source: { owner: 'acme', repo: 'erp-sync' },
    },
    {
        id: 'commerce-paas-mesh',
        name: 'API Mesh',
        description: 'Commerce mesh',
        kind: 'mesh',
        source: { owner: 'acme', repo: 'mesh' },
    },
];

function renderModal(overrides: Partial<React.ComponentProps<typeof AddIntegrationModal>> = {}) {
    const onClose = jest.fn();
    render(
        <AddIntegrationModal isOpen={true} catalog={CATALOG} onClose={onClose} {...overrides} />,
    );
    return { onClose };
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('AddIntegrationModal', () => {
    it('renders no dialog while closed', () => {
        renderModal({ isOpen: false });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows only catalog integration entries (mesh excluded)', () => {
        renderModal();

        expect(screen.getByText('ERP Sync')).toBeInTheDocument();
        expect(screen.queryByText('API Mesh')).not.toBeInTheDocument();
    });

    it('posts addAppBuilderComponent with the chosen catalog id', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderModal();

        await user.click(screen.getByRole('button', { name: /ERP Sync/i }));

        expect(getClient().postMessage).toHaveBeenCalledWith('addAppBuilderComponent', {
            id: 'erp-sync',
        });
    });

    it('posts addAppBuilderComponent with a parsed custom source when a GitHub URL is entered', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderModal();

        const input = screen.getByLabelText(/github.*url|custom.*url/i);
        await user.type(input, 'https://github.com/owner/custom-app');
        await user.click(screen.getByRole('button', { name: /^add$/i }));

        expect(getClient().postMessage).toHaveBeenCalledWith('addAppBuilderComponent', {
            source: { owner: 'owner', repo: 'custom-app' },
        });
    });

    it('disables the custom Add button until a valid GitHub URL is entered', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderModal();

        expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled();

        const input = screen.getByLabelText(/github.*url|custom.*url/i);
        await user.type(input, 'not-a-url');
        expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled();

        await user.clear(input);
        await user.type(input, 'https://github.com/owner/custom-app');
        expect(screen.getByRole('button', { name: /^add$/i })).toBeEnabled();
    });

    it('closes after posting a catalog choice', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const { onClose } = renderModal();

        await user.click(screen.getByRole('button', { name: /ERP Sync/i }));

        expect(onClose).toHaveBeenCalled();
    });

    it('closes after posting a custom source', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const { onClose } = renderModal();

        const input = screen.getByLabelText(/github.*url|custom.*url/i);
        await user.type(input, 'https://github.com/owner/custom-app');
        await user.click(screen.getByRole('button', { name: /^add$/i }));

        expect(onClose).toHaveBeenCalled();
    });

    it('cancel closes WITHOUT posting anything', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const { onClose } = renderModal();

        await user.click(screen.getByRole('button', { name: /cancel/i }));

        expect(onClose).toHaveBeenCalled();
        expect(getClient().postMessage).not.toHaveBeenCalled();
    });
});
