/**
 * ManageApisModal Tests (Integrations redesign — Step 11: dashboard "Manage APIs" parity)
 *
 * The dashboard's live API-access modal for a DEPLOYED App Builder integration:
 *   - opens → fetches the org entitlement list ONCE via `listConsoleApis`
 *     (managed = always-on → `locked`; `added` = current extras → checked+removable);
 *   - check adds, uncheck removes; Apply posts `setConsoleApis` with the FULL
 *     desired optional set (dashboard semantics: posts IMMEDIATELY);
 *   - success closes the modal; failure shows an inline error and stays open;
 *   - adds are additive — there is NO removal affordance anywhere.
 *
 * Uses the REAL Modal + ApiAccessPicker (the integration surface under test)
 * over the shared Spectrum mock; only the webview client is mocked.
 *
 * Strict TDD: written BEFORE the component exists.
 */

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ManageApisModal } from '@/features/dashboard/ui/components/ManageApisModal';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(() => jest.fn()),
        request: jest.fn(),
    },
}));

function getClient() {
    const { webviewClient } = jest.requireMock('@/core/ui/utils/WebviewClient') as {
        webviewClient: { request: jest.Mock; postMessage: jest.Mock };
    };
    return webviewClient;
}

/** The org list as `listConsoleApis` reports it: `managed` = covered by the reconcile union. */
const ORG_APIS = [
    { code: 'GraphQLServiceSDK', name: 'API Mesh', managed: true },
    { code: 'AssetsSDK', name: 'AEM Assets', managed: false },
    { code: 'FireflySDK', name: 'Firefly Services', managed: false },
];

type RequestImpl = (type: string, payload?: unknown) => Promise<unknown>;

/** Default happy-path request routing; override per test for pending/failure shapes. */
function mockRequest(impl?: RequestImpl) {
    getClient().request.mockImplementation(
        impl ??
            ((type: string) => {
                if (type === 'listConsoleApis') {
                    return Promise.resolve({ success: true, data: { apis: ORG_APIS } });
                }
                return Promise.resolve({ success: true });
            })
    );
}

/** Flush the microtask queue inside act so request promises settle into state. */
async function flush() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

function renderModal(props: Partial<React.ComponentProps<typeof ManageApisModal>> = {}) {
    const onClose = jest.fn();
    const result = render(
        <Provider theme={defaultTheme}>
            <ManageApisModal isOpen componentName="erp-sync" onClose={onClose} {...props} />
        </Provider>
    );
    return { onClose, ...result };
}

/** The checkbox input rendered for a given API display name (shared-mock shape). */
function checkboxFor(name: string): HTMLInputElement {
    const label = screen.getByText(name).closest('label');
    if (!label) throw new Error(`No checkbox label found for "${name}"`);
    return label.querySelector('input[type="checkbox"]') as HTMLInputElement;
}

/** The modal's footer Apply action (Modal renders div[role=button] actions). */
function applyButton(): HTMLElement {
    return screen.getByRole('button', { name: /^apply/i });
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('ManageApisModal', () => {
    describe('open/close lifecycle', () => {
        it('renders nothing and does NOT fetch while closed', () => {
            mockRequest();
            renderModal({ isOpen: false });

            expect(screen.queryByText('Manage APIs')).not.toBeInTheDocument();
            expect(getClient().request).not.toHaveBeenCalled();
        });

        it('fetches the org API list exactly once when opened', async () => {
            mockRequest();
            const { rerender, onClose } = renderModal();
            await flush();

            expect(getClient().request).toHaveBeenCalledWith('listConsoleApis');
            expect(getClient().request).toHaveBeenCalledTimes(1);

            // A re-render while open must NOT refetch.
            rerender(
                <Provider theme={defaultTheme}>
                    <ManageApisModal isOpen componentName="erp-sync" onClose={onClose} />
                </Provider>
            );
            await flush();
            expect(getClient().request).toHaveBeenCalledTimes(1);
        });

        it('Cancel closes without posting setConsoleApis', async () => {
            mockRequest();
            const { onClose } = renderModal();
            await flush();

            fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

            expect(onClose).toHaveBeenCalledTimes(1);
            expect(getClient().request).not.toHaveBeenCalledWith(
                'setConsoleApis',
                expect.anything()
            );
        });
    });

    describe('list fetch states', () => {
        it('shows a compact loading state while the fetch is pending', () => {
            mockRequest(() => new Promise(() => {}));
            renderModal();

            expect(screen.getByText(/loading adobe apis/i)).toBeInTheDocument();
        });

        it('shows an inline error when the fetch reports failure — modal stays open', async () => {
            mockRequest((type) =>
                type === 'listConsoleApis'
                    ? Promise.resolve({ success: false, error: 'org unavailable' })
                    : Promise.resolve({ success: true })
            );
            const { onClose } = renderModal();
            await flush();

            expect(screen.getByText(/org unavailable/i)).toBeInTheDocument();
            expect(onClose).not.toHaveBeenCalled();
        });

        it('shows an inline error when the fetch rejects', async () => {
            mockRequest(() => Promise.reject(new Error('network down')));
            renderModal();
            await flush();

            expect(screen.getByText(/network down/i)).toBeInTheDocument();
        });
    });

    describe('picker semantics', () => {
        it('lists managed entries as checked, disabled rows and free entries toggleable', async () => {
            mockRequest();
            renderModal();
            await flush();

            // Managed/always-on APIs render checked + disabled in the top Provided group.
            const managed = checkboxFor('API Mesh');
            expect(managed).toBeChecked();
            expect(managed).toBeDisabled();
            expect(screen.queryByTestId('api-provided-footnote')).toBeNull();

            const free = checkboxFor('Firefly Services');
            expect(free).not.toBeChecked();
            expect(free).not.toBeDisabled();
        });

        it('seeds previously-added APIs checked + removable (uncheck to remove)', async () => {
            mockRequest((type) =>
                type === 'listConsoleApis'
                    ? Promise.resolve({
                          success: true,
                          data: { apis: ORG_APIS, added: ['FireflySDK'] },
                      })
                    : Promise.resolve({ success: true })
            );
            renderModal();
            await flush();

            const added = checkboxFor('Firefly Services');
            expect(added).toBeChecked(); // seeded from `added`
            expect(added).not.toBeDisabled(); // removable (not managed/locked)
            // Managed APIs render checked + disabled in the Provided group (never removable).
            const managed = checkboxFor('API Mesh');
            expect(managed).toBeChecked();
            expect(managed).toBeDisabled();
            expect(screen.getByText(/uncheck to remove/i)).toBeInTheDocument();
        });
    });

    describe('Apply', () => {
        it('is disabled until at least one NEW pick is made', async () => {
            mockRequest();
            renderModal();
            await flush();

            expect(applyButton()).toHaveAttribute('aria-disabled', 'true');

            fireEvent.click(checkboxFor('Firefly Services'));

            expect(applyButton()).toHaveAttribute('aria-disabled', 'false');
        });

        it('posts setConsoleApis with the FULL desired optional set on add', async () => {
            mockRequest();
            renderModal();
            await flush();

            fireEvent.click(checkboxFor('Firefly Services'));
            fireEvent.click(applyButton());
            await flush();

            expect(getClient().request).toHaveBeenCalledWith('setConsoleApis', {
                apis: ['FireflySDK'],
            });
        });

        it('removing a previously-added API posts setConsoleApis WITHOUT it', async () => {
            mockRequest((type) =>
                type === 'listConsoleApis'
                    ? Promise.resolve({
                          success: true,
                          data: { apis: ORG_APIS, added: ['FireflySDK', 'AssetsSDK'] },
                      })
                    : Promise.resolve({ success: true })
            );
            renderModal();
            await flush();

            fireEvent.click(checkboxFor('Firefly Services')); // uncheck → remove
            fireEvent.click(applyButton());
            await flush();

            expect(getClient().request).toHaveBeenCalledWith('setConsoleApis', {
                apis: ['AssetsSDK'],
            });
        });

        it('stays disabled when reopened with existing added APIs and nothing changes', async () => {
            mockRequest((type) =>
                type === 'listConsoleApis'
                    ? Promise.resolve({
                          success: true,
                          data: { apis: ORG_APIS, added: ['FireflySDK'] },
                      })
                    : Promise.resolve({ success: true })
            );
            renderModal();
            await flush();

            // No edit yet → Apply is a no-op.
            expect(applyButton()).toHaveAttribute('aria-disabled', 'true');
        });

        it('shows a busy state while the subscribe is in flight', async () => {
            mockRequest((type) =>
                type === 'listConsoleApis'
                    ? Promise.resolve({ success: true, data: { apis: ORG_APIS } })
                    : new Promise(() => {})
            );
            renderModal();
            await flush();

            fireEvent.click(checkboxFor('Firefly Services'));
            fireEvent.click(applyButton());
            await flush();

            const busy = screen.getByRole('button', { name: /applying/i });
            expect(busy).toHaveAttribute('aria-disabled', 'true');
        });

        it('closes the modal on success', async () => {
            mockRequest();
            const { onClose } = renderModal();
            await flush();

            fireEvent.click(checkboxFor('Firefly Services'));
            fireEvent.click(applyButton());
            await flush();

            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('shows an inline error and stays open when the subscribe fails', async () => {
            mockRequest((type) =>
                type === 'listConsoleApis'
                    ? Promise.resolve({ success: true, data: { apis: ORG_APIS } })
                    : Promise.resolve({ success: false, error: 'needs a product profile' })
            );
            const { onClose } = renderModal();
            await flush();

            fireEvent.click(checkboxFor('Firefly Services'));
            fireEvent.click(applyButton());
            await flush();

            expect(screen.getByText(/needs a product profile/i)).toBeInTheDocument();
            expect(onClose).not.toHaveBeenCalled();
        });
    });

    // The loading/error views use the house centered treatment (LoadingDisplay /
    // StatusDisplay in a CenteredFeedbackContainer) rather than a small inline
    // spinner, which collapsed this size-L modal to a sliver (reported 2026-07-31).
    describe('loading and failure use the standard centered views', () => {
        it('shows the centered loading view with the time expectation', async () => {
            getClient().request.mockReturnValue(new Promise(() => {}));
            renderModal();
            await flush();

            expect(screen.getByText('Loading Adobe APIs…')).toBeInTheDocument();
            expect(screen.getByText('This can take up to a minute')).toBeInTheDocument();
        });

        it('offers a Retry on failure that re-fires the fetch', async () => {
            getClient().request.mockResolvedValue({ success: false, error: 'boom' });
            renderModal();
            await flush();

            expect(screen.getByText("Couldn't load Adobe APIs")).toBeInTheDocument();
            const callsBefore = getClient().request.mock.calls.length;

            fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));
            await flush();

            expect(getClient().request.mock.calls.length).toBeGreaterThan(callsBefore);
        });
    });

    // Signed-out is NOT a retryable error — Retry re-runs the same unauthenticated
    // call. The house treatment (AdobeAuthStep) offers a sign-in action instead.
    describe('signed out offers sign-in, not Retry', () => {
        const signedOut = { success: false, error: 'Adobe sign-in required.', code: 'AUTH_REQUIRED' };

        it('shows Sign In with Adobe and NO Retry', async () => {
            getClient().request.mockResolvedValue(signedOut);
            renderModal();
            await flush();

            expect(screen.getByText('Sign in to Adobe')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /sign in with adobe/i })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^retry$/i })).not.toBeInTheDocument();
        });

        it('re-fetches once sign-in resolves', async () => {
            getClient().request.mockResolvedValue(signedOut);
            renderModal();
            await flush();

            const before = getClient().request.mock.calls.length;
            fireEvent.click(screen.getByRole('button', { name: /sign in with adobe/i }));
            await flush();

            // reAuthenticate itself, plus the reload it triggers.
            expect(getClient().request.mock.calls.length).toBeGreaterThan(before + 1);
            expect(getClient().request.mock.calls.some((c: unknown[]) => c[0] === 'reAuthenticate'))
                .toBe(true);
        });

        it('still offers Retry for a NON-auth failure', async () => {
            getClient().request.mockResolvedValue({ success: false, error: 'network down' });
            renderModal();
            await flush();

            expect(screen.getByRole('button', { name: /^retry$/i })).toBeInTheDocument();
            expect(screen.queryByText('Sign in to Adobe')).not.toBeInTheDocument();
        });
    });
});
